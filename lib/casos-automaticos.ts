// Reposición automática: crea un caso de compra (estado "pendiente") en
// cuanto el stock de un material cruza su punto de reposición, sin esperar
// a que alguien lo detecte manualmente. Reutiliza tal cual lib/stock-
// sugerido.ts, lib/eoq.ts y lib/riesgo-stock.ts — este archivo solo hace la
// orquestación de datos (Supabase) alrededor de esas funciones puras.
//
// Si un material tiene convenios vigentes con VARIOS proveedores, no se
// crea un solo caso — se crea una solicitud_compra (código propio) con una
// cotización por cada convenio, para que el responsable pueda comparar y
// elegir (lib/solicitudes.ts). Con 0 o 1 convenio, el comportamiento es el
// de siempre: un caso suelto, sin solicitud.
//
// Dos caminos la llaman:
//   - app/api/generar-casos-automaticos/route.ts, con el cliente de
//     service_role (el disparador real es un pg_cron -> pg_net contra ese
//     endpoint, sin sesión de usuario).
//   - lib/actions/casos-automaticos.ts (revisarReposicionAutomatica), con
//     el cliente de sesión normal, para el botón manual "Revisar ahora".
//
// No lleva "use server": no es un Server Action en sí (su parámetro,
// el cliente de Supabase, no es serializable), solo un helper de servidor
// como lib/data.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularStockSugerido } from "@/lib/stock-sugerido";
import { calcularEOQ } from "@/lib/eoq";
import { evaluarRiesgoStock, type RiesgoStock } from "@/lib/riesgo-stock";
import { esConvenioVigente } from "@/lib/convenios";
import { construirCorreoOrdenConvenio } from "@/lib/plantillas-correo";
import { enviarCorreo } from "@/lib/email";
import { registrarEventoCaso } from "@/lib/eventos-caso";
import { formatearCorreoEvento } from "@/lib/email-caso";
import type { Convenio } from "@/lib/types";

const SISTEMA = { id: null, nombre: null };

export interface ResumenReposicionAutomatica {
  materialesRevisados: number;
  casosCreados: number;
}

interface MaterialCandidato {
  id: string;
  nombre: string;
  sku: string | null;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
  costo_unitario: number;
  proveedor_id: string;
}

interface ProveedorInfo {
  id: string;
  nombre: string;
  contacto: string | null;
  dias_entrega_declarado: number | null;
}

const CASO_COMPRA_ABIERTO = ["pendiente", "cotizando", "por_autorizar", "ordenado"];

export async function generarCasosAutomaticosPorStockBajo(
  supabase: SupabaseClient,
  opts: { materialIds?: string[] } = {}
): Promise<ResumenReposicionAutomatica> {
  let query = supabase
    .from("materiales")
    .select(
      "id, nombre, sku, unidad, stock_actual, stock_minimo, costo_unitario, proveedor_id"
    )
    .eq("activo", true)
    .not("proveedor_id", "is", null);
  // Acota el barrido a materiales puntuales (pruebas de integración o un
  // reintento dirigido) — sin esto, siempre revisa el catálogo completo.
  if (opts.materialIds) query = query.in("id", opts.materialIds);
  const { data: materialesRows } = await query;

  const materiales = (materialesRows ?? []) as MaterialCandidato[];
  if (materiales.length === 0)
    return { materialesRevisados: 0, casosCreados: 0 };

  const materialIds = materiales.map((m) => m.id);
  const proveedorIds = [...new Set(materiales.map((m) => m.proveedor_id))];

  const [
    { data: abiertosRows },
    { data: proveedoresRows },
    { data: salidasRows },
    { data: recibidasRows },
    { data: conveniosRows },
  ] = await Promise.all([
    supabase
      .from("casos_compra")
      .select("material_id")
      .in("material_id", materialIds)
      .in("estado", CASO_COMPRA_ABIERTO),
    supabase
      .from("proveedores")
      .select("id, nombre, contacto, dias_entrega_declarado")
      .in("id", proveedorIds),
    supabase
      .from("movimientos")
      .select("material_id, cantidad, created_at")
      .in("material_id", materialIds)
      .eq("tipo", "salida"),
    supabase
      .from("casos_compra")
      .select("material_id, created_at, updated_at")
      .in("material_id", materialIds)
      .eq("estado", "recibido"),
    supabase
      .from("convenios_proveedor")
      .select("*")
      .in("material_id", materialIds)
      .eq("activo", true),
  ]);

  const materialesConCasoAbierto = new Set(
    (abiertosRows ?? []).map((r: { material_id: string }) => r.material_id)
  );
  const proveedorInfoPorId = new Map<string, ProveedorInfo>(
    (proveedoresRows ?? []).map((p: ProveedorInfo) => [p.id, p])
  );

  const salidasPorMaterial = new Map<
    string,
    { cantidad: number; created_at: string }[]
  >();
  for (const s of (salidasRows ?? []) as {
    material_id: string;
    cantidad: number;
    created_at: string;
  }[]) {
    const lista = salidasPorMaterial.get(s.material_id) ?? [];
    lista.push({ cantidad: s.cantidad, created_at: s.created_at });
    salidasPorMaterial.set(s.material_id, lista);
  }

  const recibidasPorMaterial = new Map<
    string,
    { created_at: string; updated_at: string }[]
  >();
  for (const c of (recibidasRows ?? []) as {
    material_id: string;
    created_at: string;
    updated_at: string;
  }[]) {
    const lista = recibidasPorMaterial.get(c.material_id) ?? [];
    lista.push({ created_at: c.created_at, updated_at: c.updated_at });
    recibidasPorMaterial.set(c.material_id, lista);
  }

  // Todos los convenios vigentes de cada material (de cualquier proveedor,
  // no solo el asignado por defecto al material) — de aquí sale el
  // fan-out a varias cotizaciones cuando hay más de uno.
  const conveniosPorMaterial = new Map<string, Convenio[]>();
  for (const c of (conveniosRows ?? []) as Convenio[]) {
    if (!esConvenioVigente(c)) continue;
    const lista = conveniosPorMaterial.get(c.material_id) ?? [];
    lista.push(c);
    conveniosPorMaterial.set(c.material_id, lista);
  }

  let casosCreados = 0;

  for (const material of materiales) {
    if (materialesConCasoAbierto.has(material.id)) continue;

    const salidas = salidasPorMaterial.get(material.id) ?? [];
    const comprasRecibidas = recibidasPorMaterial.get(material.id) ?? [];
    const stockSugerido = calcularStockSugerido({ salidas, comprasRecibidas });
    const eoq =
      material.costo_unitario > 0
        ? calcularEOQ({ salidas, costoUnitario: material.costo_unitario })
        : null;

    const conveniosDelMaterial = conveniosPorMaterial.get(material.id) ?? [];
    // Para decidir SI y QUÉ TAN URGENTE reponer, se usa el convenio del
    // proveedor asignado por defecto al material (si tiene uno) — la
    // decisión de "cuándo" no depende de cuántos proveedores alternativos
    // existan, solo de a quién surte normalmente este material.
    const convenioDefault = conveniosDelMaterial.find(
      (c) => c.proveedor_id === material.proveedor_id
    );
    const proveedorInfoDefault = proveedorInfoPorId.get(material.proveedor_id);
    const proveedorDiasEntrega =
      convenioDefault?.dias_entrega_pactado ??
      proveedorInfoDefault?.dias_entrega_declarado ??
      null;

    const riesgo = evaluarRiesgoStock({
      stockActual: material.stock_actual,
      stockMinimo: material.stock_minimo,
      proveedorDiasEntrega,
      stockSugerido,
      eoq,
    });
    if (!riesgo.debeCrearCaso) continue;

    if (conveniosDelMaterial.length > 1) {
      const creados = await crearSolicitudComparativa(
        supabase,
        material,
        conveniosDelMaterial,
        riesgo,
        proveedorInfoPorId
      );
      casosCreados += creados;
      continue;
    }

    // 0 o 1 convenio: un caso suelto, como siempre. Si hay exactamente uno
    // (aunque no sea el del proveedor asignado por defecto al material),
    // se usa su precio/condiciones — sigue siendo la única opción pactada.
    const convenio = conveniosDelMaterial[0];
    const proveedorId = convenio?.proveedor_id ?? material.proveedor_id;
    const proveedorInfo = proveedorInfoPorId.get(proveedorId);

    const cantidad = Math.max(riesgo.cantidadSugerida, convenio?.cantidad_minima ?? 0);
    const precioUnitario = convenio?.precio_pactado ?? material.costo_unitario;
    const referencia = `OC-${Date.now().toString().slice(-6)}-${casosCreados}`;
    const montoEstimado = precioUnitario > 0 ? precioUnitario * cantidad : 0;
    const notaConvenio = convenio
      ? ` Precio según convenio vigente: $${convenio.precio_pactado.toFixed(2)}/unidad.`
      : "";
    const descripcionBase = `${riesgo.motivo} Cantidad sugerida: ${cantidad} ${material.unidad}.${notaConvenio}`;

    const { data: caso, error } = await supabase
      .from("casos_compra")
      .insert({
        proveedor_id: proveedorId,
        material_id: material.id,
        titulo: `Reposición automática: ${material.nombre}`,
        descripcion: descripcionBase,
        monto_estimado: montoEstimado,
        cantidad_estimada: cantidad,
        referencia,
        estado: "pendiente",
        origen: "stock_bajo",
        nivel_riesgo: riesgo.nivelRiesgo,
        dias_cobertura_restante: riesgo.diasCobertura,
        lead_time_dias_usado: riesgo.leadTimeUsado,
      })
      .select("id")
      .single();

    // No se aborta el resto del lote por un material: se sigue con los demás.
    if (error || !caso) continue;
    await registrarEventoCaso(supabase, caso.id, "creado", null, SISTEMA);

    await resolverNotificacionesDelMaterial(
      supabase,
      material.id,
      caso.id,
      `Se generó automáticamente el caso ${referencia} para reponer ${material.nombre} (riesgo ${riesgo.nivelRiesgo}). Revisa y asigna un responsable.`,
      material.proveedor_id,
      riesgo.nivelRiesgo
    );

    if (convenio?.auto_enviar && proveedorInfo) {
      await intentarEnvioAutomatico(supabase, {
        casoId: caso.id,
        material,
        convenio,
        proveedorInfo,
        cantidad,
        precioUnitario,
        referencia,
        descripcionBase,
      });
    }

    casosCreados++;
  }

  return { materialesRevisados: materiales.length, casosCreados };
}

// Fan-out: un material con convenios vigentes de varios proveedores → una
// solicitud_compra (con su propio código) + una cotización por convenio,
// para que el responsable pueda comparar y elegir (lib/solicitudes.ts).
async function crearSolicitudComparativa(
  supabase: SupabaseClient,
  material: MaterialCandidato,
  convenios: Convenio[],
  riesgo: RiesgoStock,
  proveedorInfoPorId: Map<string, ProveedorInfo>
): Promise<number> {
  const codigo = `SOL-${Date.now().toString().slice(-6)}`;
  const { data: solicitud, error: errSol } = await supabase
    .from("solicitudes_compra")
    .insert({
      codigo,
      material_id: material.id,
      material_nombre: material.nombre,
      titulo: `Reposición automática: ${material.nombre}`,
    })
    .select("id, codigo")
    .single();
  // Si no se pudo armar el grupo, no se crea nada para este material — se
  // reintenta en la próxima corrida (no queda a medias con solo algunas
  // cotizaciones sueltas).
  if (errSol || !solicitud) return 0;

  let creados = 0;
  for (const convenio of convenios) {
    const proveedorInfo = proveedorInfoPorId.get(convenio.proveedor_id);
    const cantidad = Math.max(riesgo.cantidadSugerida, convenio.cantidad_minima ?? 0);
    const precioUnitario = convenio.precio_pactado;
    const referencia = `OC-${Date.now().toString().slice(-6)}-${creados}`;
    const montoEstimado = precioUnitario * cantidad;
    const descripcionBase = `${riesgo.motivo} Cantidad sugerida: ${cantidad} ${material.unidad}. Precio según convenio vigente: $${precioUnitario.toFixed(2)}/unidad. Cotización comparativa de la solicitud ${solicitud.codigo}.`;

    const { data: caso, error } = await supabase
      .from("casos_compra")
      .insert({
        proveedor_id: convenio.proveedor_id,
        material_id: material.id,
        titulo: `Reposición automática: ${material.nombre}`,
        descripcion: descripcionBase,
        monto_estimado: montoEstimado,
        cantidad_estimada: cantidad,
        referencia,
        estado: "pendiente",
        origen: "stock_bajo",
        nivel_riesgo: riesgo.nivelRiesgo,
        dias_cobertura_restante: riesgo.diasCobertura,
        lead_time_dias_usado: riesgo.leadTimeUsado,
        solicitud_id: solicitud.id,
      })
      .select("id")
      .single();
    if (error || !caso) continue;
    creados++;
    await registrarEventoCaso(
      supabase,
      caso.id,
      "creado",
      `Cotización comparativa de la solicitud ${solicitud.codigo}.`,
      SISTEMA
    );

    if (convenio.auto_enviar && proveedorInfo) {
      await intentarEnvioAutomatico(supabase, {
        casoId: caso.id,
        material,
        convenio,
        proveedorInfo,
        cantidad,
        precioUnitario,
        referencia,
        descripcionBase,
      });
    }
  }

  if (creados > 0) {
    await resolverNotificacionesDelMaterial(
      supabase,
      material.id,
      null,
      `Se generó automáticamente la solicitud ${solicitud.codigo} para reponer ${material.nombre} — se pidió cotización a ${creados} proveedores con convenio. Revisa y elige la mejor opción.`,
      material.proveedor_id,
      riesgo.nivelRiesgo
    );
  }
  return creados;
}

// Marca como atendidas las alertas abiertas del material y deja una nueva
// notificación explicando qué se generó — mismo mecanismo que ya usa el
// resto de la app (campana/toasts), sin tocar ese componente.
async function resolverNotificacionesDelMaterial(
  supabase: SupabaseClient,
  materialId: string,
  casoId: string | null,
  mensaje: string,
  proveedorId: string,
  nivelRiesgo: "medio" | "alto" | "critico"
): Promise<void> {
  await supabase
    .from("notificaciones")
    .update({
      estado: "atendida",
      ...(casoId ? { caso_compra_id: casoId } : {}),
      resuelta_at: new Date().toISOString(),
    })
    .eq("material_id", materialId)
    .eq("estado", "abierta");

  await supabase.from("notificaciones").insert({
    material_id: materialId,
    proveedor_id: proveedorId,
    tipo: "stock",
    nivel: nivelRiesgo === "medio" ? "aviso" : "bajo",
    mensaje,
    caso_compra_id: casoId,
  });
}

// Opt-in por convenio: si el precio/cantidad/condiciones ya están
// pactados, no hace falta que un humano redacte y apruebe el correo — se
// manda solo y el caso pasa directo a "ordenado". Nunca se finge un envío
// que no ocurrió: si el servicio no está configurado/falla, el caso se
// queda en "pendiente" con una nota.
async function intentarEnvioAutomatico(
  supabase: SupabaseClient,
  params: {
    casoId: string;
    material: MaterialCandidato;
    convenio: Convenio;
    proveedorInfo: ProveedorInfo;
    cantidad: number;
    precioUnitario: number;
    referencia: string;
    descripcionBase: string;
  }
): Promise<void> {
  const { casoId, material, convenio, proveedorInfo, cantidad, precioUnitario, referencia, descripcionBase } =
    params;

  if (!proveedorInfo.contacto) {
    await supabase
      .from("casos_compra")
      .update({
        descripcion: `${descripcionBase} Envío automático configurado pero el proveedor no tiene correo registrado.`,
      })
      .eq("id", casoId);
    return;
  }

  const correo = construirCorreoOrdenConvenio({
    material: { nombre: material.nombre, sku: material.sku, unidad: material.unidad },
    proveedorNombre: proveedorInfo.nombre,
    cantidad,
    precioUnitario,
    condicionesPago: convenio.condiciones_pago,
    diasEntregaPactado: convenio.dias_entrega_pactado,
    referencia,
  });
  const envio = await enviarCorreo({
    to: proveedorInfo.contacto,
    subject: correo.asunto,
    body: correo.cuerpo,
  });

  if (envio.ok) {
    await supabase
      .from("casos_compra")
      .update({
        estado: "ordenado",
        correo_enviado_at: new Date().toISOString(),
        descripcion: `${descripcionBase} Orden confirmada y enviada automáticamente por convenio.`,
      })
      .eq("id", casoId);
    await registrarEventoCaso(
      supabase,
      casoId,
      "correo_enviado",
      formatearCorreoEvento(correo.asunto, correo.cuerpo),
      SISTEMA
    );
  } else {
    await supabase
      .from("casos_compra")
      .update({
        descripcion: `${descripcionBase} Envío automático configurado pero falló: ${envio.error} Revisar manualmente.`,
      })
      .eq("id", casoId);
  }
}
