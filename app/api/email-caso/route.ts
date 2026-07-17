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
  extraerMonto,
  matchMaterial,
  matchProveedor,
  resumirCuerpo,
  type EmailEntrante,
} from "@/lib/email-caso";

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

    const proveedor = matchProveedor(email.de, store.getProveedores());
    if (!proveedor)
      // Anti-spam: solo remitentes registrados como proveedores crean casos.
      return NextResponse.json(
        {
          ok: false,
          error: `El remitente ${email.de} no coincide con el contacto de ningún proveedor`,
        },
        { status: 422 }
      );

    const material = matchMaterial(texto, store.getMateriales());
    const caso = store.crearCasoCompra({
      proveedor_id: proveedor.id,
      material_id: material?.id ?? null,
      titulo,
      descripcion: resumirCuerpo(email.cuerpo),
      monto_estimado: extraerMonto(texto),
      referencia: `OC-${Date.now().toString().slice(-6)}`,
      origen: "correo",
    });
    store.registrarEmailProcesado(email.mensajeId);

    revalidatePath("/proveedores");
    return NextResponse.json({
      ok: true,
      caso: {
        id: caso.id,
        titulo: caso.titulo,
        referencia: caso.referencia,
        proveedor: proveedor.nombre,
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

  const [{ data: proveedores }, { data: materiales }] = await Promise.all([
    supabase.from("proveedores").select("id,nombre,contacto"),
    supabase.from("materiales").select("id,nombre,sku").eq("activo", true),
  ]);

  const proveedor = matchProveedor(email.de, proveedores ?? []);
  if (!proveedor)
    return NextResponse.json(
      {
        ok: false,
        error: `El remitente ${email.de} no coincide con el contacto de ningún proveedor`,
      },
      { status: 422 }
    );

  const material = matchMaterial(texto, materiales ?? []);
  const { data: caso, error } = await supabase
    .from("casos_compra")
    .insert({
      proveedor_id: proveedor.id,
      material_id: material?.id ?? null,
      titulo,
      descripcion: resumirCuerpo(email.cuerpo),
      monto_estimado: extraerMonto(texto),
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

  revalidatePath("/proveedores");
  return NextResponse.json({
    ok: true,
    caso: {
      ...caso,
      proveedor: proveedor.nombre,
      material: material?.nombre ?? null,
    },
  });
}
