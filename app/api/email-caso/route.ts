// Webhook de correo entrante (email-to-case).
// El Email Worker de Cloudflare hace POST aquí con el correo parseado;
// el simulador del modo demo usa exactamente el mismo contrato.
//
// Payload: { de, asunto, cuerpo, mensajeId }
// Seguridad: header `x-webhook-secret` debe coincidir con
// EMAIL_WEBHOOK_SECRET (si la variable no está definida, solo se acepta
// en modo demo).

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { secretoValido } from "@/lib/webhook-auth";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  esRemitenteExterno,
  extraerMonto,
  formatearCorreoEvento,
  matchMaterial,
  matchProveedor,
  matchReferenciaEnAsunto,
  resumirCuerpo,
  type EmailEntrante,
} from "@/lib/email-caso";
import { registrarEventoCaso } from "@/lib/eventos-caso";

// Casos que todavía admiten respuestas ligadas a su hilo (uno ya
// recibido/cancelado no tiene sentido reabrirlo por un correo tardío).
const CASO_COMPRA_ABIERTO = ["pendiente", "cotizando", "por_autorizar", "ordenado"];
const SISTEMA = { id: null, nombre: null };

// Dominio propio (para "¿es un remitente externo?") derivado de EMAIL_FROM
// — el mismo dominio desde el que la app manda correo, no una variable
// nueva que haya que configurar aparte.
function dominioPropio(): string | null {
  return process.env.EMAIL_FROM?.split("@")[1]?.trim().toLowerCase() || null;
}

export async function POST(req: Request) {
  // ---- Autenticación del webhook ----
  const secreto = process.env.EMAIL_WEBHOOK_SECRET;
  if (secreto) {
    if (!secretoValido(req.headers.get("x-webhook-secret"), secreto))
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );
  } else if (!DEMO) {
    // En producción sin secreto configurado, rechazar todo.
    return NextResponse.json(
      { ok: false, error: "Webhook no configurado (EMAIL_WEBHOOK_SECRET)" },
      { status: 503 }
    );
  }

  // ---- Payload ----
  let email: EmailEntrante;
  try {
    const body = (await req.json()) as Partial<EmailEntrante>;
    email = {
      de: String(body.de ?? "").trim(),
      asunto: String(body.asunto ?? "").trim(),
      cuerpo: String(body.cuerpo ?? "").slice(0, 10000),
      mensajeId: String(body.mensajeId ?? "").trim(),
    };
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido" },
      { status: 400 }
    );
  }
  if (!email.de || !email.mensajeId)
    return NextResponse.json(
      { ok: false, error: "Faltan campos: de, mensajeId" },
      { status: 400 }
    );

  const texto = `${email.asunto}\n${email.cuerpo}`;
  const titulo = email.asunto || "Correo sin asunto";

  if (DEMO) {
    // Idempotencia: Cloudflare puede reintentar el mismo correo.
    if (store.emailYaProcesado(email.mensajeId))
      return NextResponse.json({ ok: true, duplicado: true });

    const dominio = dominioPropio();
    const externo = esRemitenteExterno(email.de, dominio);
    const proveedores = store.getProveedores();
    const proveedorRemitente = matchProveedor(email.de, proveedores);

    // Antes de crear un caso nuevo: ¿es una respuesta a uno que ya existe?
    // El código viaja en el asunto (lib/plantillas-correo.ts) — si aparece,
    // se liga como evento en vez de duplicar el caso. El código por sí solo
    // NO autentica al remitente (son 6 dígitos de un timestamp, y viajan en
    // el asunto saliente) — se guarda si el remitente coincide con el
    // proveedor de ESE caso, para que el staff lo vea en el timeline.
    const casosAbiertos = store
      .getCasosCompra()
      .filter((c) => CASO_COMPRA_ABIERTO.includes(c.estado));
    const casoLigado = matchReferenciaEnAsunto(email.asunto, casosAbiertos);
    if (casoLigado) {
      const verificado =
        proveedorRemitente != null && proveedorRemitente.id === casoLigado.proveedor_id;
      store.registrarEventoCaso(
        casoLigado.id,
        "correo_recibido",
        formatearCorreoEvento(email.asunto, email.cuerpo),
        SISTEMA,
        { remitenteExterno: externo, remitenteVerificado: verificado }
      );
      // Monto detectado en la respuesta — solo si el caso todavía no
      // tiene uno confirmado por una persona (ver extraerMonto).
      const montoDetectado = extraerMonto(texto);
      if (
        montoDetectado > 0 &&
        (casoLigado.monto_estimado === 0 || !casoLigado.monto_confirmado)
      ) {
        store.actualizarMontoDetectado(casoLigado.id, montoDetectado);
        store.registrarEventoCaso(
          casoLigado.id,
          "nota",
          // Sin el monto en el texto: el timeline no filtra notas por rol.
          "Monto detectado en el correo — sin confirmar, revisa antes de elegir esta cotización.",
          SISTEMA
        );
      }
      store.registrarEmailProcesado(email.mensajeId);
      revalidatePath("/proveedores");
      return NextResponse.json({
        ok: true,
        vinculado: true,
        caso: { id: casoLigado.id, referencia: casoLigado.referencia },
      });
    }

    if (!proveedorRemitente)
      // Anti-spam: solo remitentes registrados como proveedores crean casos.
      return NextResponse.json(
        {
          ok: false,
          error: `El remitente ${email.de} no coincide con el contacto de ningún proveedor`,
        },
        { status: 422 }
      );

    const material = matchMaterial(texto, store.getMateriales());
    const montoNuevoCaso = extraerMonto(texto);
    const caso = store.crearCasoCompra({
      proveedor_id: proveedorRemitente.id,
      material_id: material?.id ?? null,
      titulo,
      descripcion: resumirCuerpo(email.cuerpo),
      monto_estimado: montoNuevoCaso,
      monto_confirmado: montoNuevoCaso === 0,
      referencia: `OC-${Date.now().toString().slice(-6)}`,
      origen: "correo",
    });
    store.registrarEventoCaso(caso.id, "creado", null, SISTEMA);
    store.registrarEventoCaso(
      caso.id,
      "correo_recibido",
      formatearCorreoEvento(email.asunto, email.cuerpo),
      SISTEMA,
      { remitenteExterno: externo, remitenteVerificado: true }
    );
    store.registrarEmailProcesado(email.mensajeId);

    revalidatePath("/proveedores");
    return NextResponse.json({
      ok: true,
      caso: {
        id: caso.id,
        titulo: caso.titulo,
        referencia: caso.referencia,
        proveedor: proveedorRemitente.nombre,
        material: material?.nombre ?? null,
        monto_estimado: caso.monto_estimado,
      },
    });
  }

  // ---- Rama Supabase (producción) ----
  // Usa service_role: el webhook no tiene sesión de usuario y el RLS
  // bloquearía los inserts con el cliente normal (cookie-based).
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error: errDup } = await supabase
    .from("emails_procesados")
    .insert({ mensaje_id: email.mensajeId });
  if (errDup) {
    if (errDup.code === "23505")
      return NextResponse.json({ ok: true, duplicado: true });
    return NextResponse.json(
      { ok: false, error: errDup.message },
      { status: 500 }
    );
  }

  const [{ data: casosAbiertos }, { data: proveedores }] = await Promise.all([
    supabase
      .from("casos_compra")
      .select("id, referencia, proveedor_id, monto_estimado, monto_confirmado")
      .in("estado", CASO_COMPRA_ABIERTO),
    supabase.from("proveedores").select("id,nombre,contacto"),
  ]);

  const dominio = dominioPropio();
  const externo = esRemitenteExterno(email.de, dominio);
  const proveedorRemitente = matchProveedor(email.de, proveedores ?? []);

  // El código en el asunto NO autentica al remitente por sí solo (son 6
  // dígitos de un timestamp, y viajan en el asunto saliente) — se guarda
  // igual (no se rechaza: cortaría respuestas legítimas desde un contacto
  // distinto al registrado), pero solo si el remitente coincide con el
  // proveedor de ESE caso se marca "verificado" para que el staff lo vea.
  const casoLigado = matchReferenciaEnAsunto(email.asunto, casosAbiertos ?? []);
  if (casoLigado) {
    const verificado =
      proveedorRemitente != null && proveedorRemitente.id === casoLigado.proveedor_id;
    await registrarEventoCaso(
      supabase,
      casoLigado.id,
      "correo_recibido",
      formatearCorreoEvento(email.asunto, email.cuerpo),
      SISTEMA,
      { remitenteExterno: externo, remitenteVerificado: verificado }
    );
    // Monto detectado en la respuesta — solo si el caso todavía no tiene
    // uno confirmado por una persona (ver extraerMonto).
    const montoDetectado = extraerMonto(texto);
    if (
      montoDetectado > 0 &&
      (casoLigado.monto_estimado === 0 || !casoLigado.monto_confirmado)
    ) {
      await supabase
        .from("casos_compra")
        .update({
          monto_estimado: montoDetectado,
          monto_confirmado: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", casoLigado.id);
      await registrarEventoCaso(
        supabase,
        casoLigado.id,
        "nota",
        // Sin el monto en el texto: el timeline no filtra notas por rol.
        "Monto detectado en el correo — sin confirmar, revisa antes de elegir esta cotización.",
        SISTEMA
      );
    }
    revalidatePath("/proveedores");
    return NextResponse.json({
      ok: true,
      vinculado: true,
      caso: { id: casoLigado.id, referencia: casoLigado.referencia },
    });
  }

  if (!proveedorRemitente)
    return NextResponse.json(
      {
        ok: false,
        error: `El remitente ${email.de} no coincide con el contacto de ningún proveedor`,
      },
      { status: 422 }
    );

  const { data: materiales } = await supabase
    .from("materiales")
    .select("id,nombre,sku")
    .eq("activo", true);

  const material = matchMaterial(texto, materiales ?? []);
  const montoNuevoCaso = extraerMonto(texto);
  const { data: caso, error } = await supabase
    .from("casos_compra")
    .insert({
      proveedor_id: proveedorRemitente.id,
      material_id: material?.id ?? null,
      titulo,
      descripcion: resumirCuerpo(email.cuerpo),
      monto_estimado: montoNuevoCaso,
      monto_confirmado: montoNuevoCaso === 0,
      referencia: `OC-${Date.now().toString().slice(-6)}`,
      origen: "correo",
    })
    .select("id,titulo,referencia,monto_estimado")
    .single();
  if (error)
    return NextResponse.json(
      { ok: false, error: mensajeSupabase(error) },
      { status: 500 }
    );
  await registrarEventoCaso(supabase, caso.id, "creado", null, SISTEMA);
  await registrarEventoCaso(
    supabase,
    caso.id,
    "correo_recibido",
    formatearCorreoEvento(email.asunto, email.cuerpo),
    SISTEMA,
    { remitenteExterno: externo, remitenteVerificado: true }
  );

  revalidatePath("/proveedores");
  return NextResponse.json({
    ok: true,
    caso: {
      ...caso,
      proveedor: proveedorRemitente.nombre,
      material: material?.nombre ?? null,
    },
  });
}
