"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { getCurrentProfile, esGestor, puedeGestionarCompras } from "@/lib/auth";
import { registrarEventoCaso } from "@/lib/eventos-caso";
import { enviarCorreo } from "@/lib/email";
import { enviarPush } from "@/lib/push";
import { construirCorreoOrdenAutorizada } from "@/lib/plantillas-correo";
import { formatearCorreoEvento } from "@/lib/email-caso";
import { getConfiguracionAutorizacion } from "@/lib/data";
import type { ConfiguracionAutorizacion, UsuarioActor } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireGestor() {
  const profile = await getCurrentProfile();
  if (!profile || !esGestor(profile)) throw new Error("No autorizado");
}

// Autorizar/rechazar un caso de compra también es tarea de compras, no
// solo de un gestor — a diferencia de resolverInspeccionCalidad (calidad
// no es de compras), que se queda en requireGestor().
async function requireGestorOCompras() {
  const profile = await getCurrentProfile();
  if (!profile || !puedeGestionarCompras(profile)) throw new Error("No autorizado");
}

export async function obtenerConfiguracionAutorizacion(): Promise<ConfiguracionAutorizacion> {
  return getConfiguracionAutorizacion();
}

// Solo admin (no gerente) puede cambiar el umbral — mismo candado que la
// policy de RLS (0026_conteo_ciclico.sql: configuracion_autorizacion_update).
export async function guardarUmbralAutorizacion(monto: number): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || profile.rol !== "admin")
    return { ok: false, error: "Solo un administrador puede cambiar el umbral" };
  if (!Number.isFinite(monto) || monto < 0)
    return { ok: false, error: "El umbral debe ser un número mayor o igual a cero" };

  if (DEMO) {
    store.guardarUmbralAutorizacion(monto, { id: profile.id, nombre: profile.nombre });
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("configuracion_autorizacion")
    .update({
      monto_umbral_admin: monto,
      updated_at: new Date().toISOString(),
      updated_por_id: profile.id,
      updated_por_nombre: profile.nombre,
    })
    .eq("id", true);
  if (error) return { ok: false, error: mensajeSupabase(error) };
  revalidatePath("/administracion");
  revalidatePath("/proveedores");
  return { ok: true };
}

// Autoriza un caso "por_autorizar": lo pasa a "ordenado" y manda la orden de
// compra sola (si el proveedor tiene correo registrado) — nunca finge el
// envío si falla o no hay servicio configurado, mismo criterio que el envío
// automático por convenio. Notifica a quien creó el caso por campana y
// (si tiene push activado) por notificación real del navegador.
export async function autorizarCasoCompra(
  casoId: string,
  cantidad: number,
  monto: number
): Promise<ActionResult> {
  await requireGestorOCompras();
  if (!Number.isFinite(cantidad) || cantidad <= 0)
    return { ok: false, error: "La cantidad debe ser mayor a cero" };
  // >0, no solo >=0: el operario ya no manda ningún monto (queda en 0 al
  // crear el caso), así que un gestor SIEMPRE tiene que capturar el real
  // aquí antes de autorizar — nunca se puede colar un pedido a $0.
  if (!Number.isFinite(monto) || monto <= 0)
    return { ok: false, error: "Captura el monto del pedido antes de autorizar" };

  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  // Nivel de aprobación por monto: arriba del umbral, un gerente ya no
  // basta — se necesita admin (rechazar sí sigue abierto a cualquier
  // gestor, porque rechazar no compromete dinero).
  const { monto_umbral_admin } = await getConfiguracionAutorizacion();
  if (monto > monto_umbral_admin && yo?.rol !== "admin") {
    return {
      ok: false,
      error: `Este caso supera el umbral de $${monto_umbral_admin.toLocaleString("es-MX")} — solo un administrador puede autorizarlo.`,
    };
  }

  if (DEMO) {
    try {
      store.autorizarCasoCompra(casoId, cantidad, monto, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
    revalidatePath("/proveedores");
    return { ok: true };
  }

  const supabase = await createClient();
  const { data: caso, error: errCaso } = await supabase
    .from("casos_compra")
    .select(
      "id, titulo, descripcion, referencia, estado, creado_por_id, proveedores(nombre,contacto), materiales(nombre,sku,unidad)"
    )
    .eq("id", casoId)
    .single();
  if (errCaso || !caso) return { ok: false, error: "Caso no encontrado" };
  if (caso.estado !== "por_autorizar")
    return { ok: false, error: "Este caso ya no está pendiente de autorización" };

  const proveedor = Array.isArray(caso.proveedores) ? caso.proveedores[0] : caso.proveedores;
  const material = Array.isArray(caso.materiales) ? caso.materiales[0] : caso.materiales;
  const referencia = caso.referencia ?? `OC-${Date.now().toString().slice(-6)}`;

  let correoEnviadoAt: string | null = null;
  let notaCorreo = "";
  if (material && proveedor?.contacto) {
    const correo = construirCorreoOrdenAutorizada({
      material: { nombre: material.nombre, sku: material.sku, unidad: material.unidad },
      proveedorNombre: proveedor.nombre ?? null,
      cantidad,
      precioUnitario: cantidad > 0 ? monto / cantidad : 0,
      referencia,
    });
    const resultado = await enviarCorreo({
      to: proveedor.contacto,
      subject: correo.asunto,
      body: correo.cuerpo,
    });
    if (resultado.ok) {
      correoEnviadoAt = new Date().toISOString();
      await registrarEventoCaso(
        supabase,
        casoId,
        "correo_enviado",
        formatearCorreoEvento(correo.asunto, correo.cuerpo),
        actor
      );
    } else {
      notaCorreo = ` Orden autorizada; el correo no se pudo enviar (${resultado.error}).`;
    }
  } else if (!proveedor?.contacto) {
    notaCorreo = " Orden autorizada; el proveedor no tiene correo registrado, no se mandó automáticamente.";
  }

  const { error } = await supabase
    .from("casos_compra")
    .update({
      estado: "ordenado",
      cantidad_estimada: cantidad,
      monto_estimado: monto,
      correo_enviado_at: correoEnviadoAt,
      descripcion: notaCorreo ? `${caso.descripcion ?? ""}${notaCorreo}`.trim() : caso.descripcion,
      updated_at: new Date().toISOString(),
    })
    .eq("id", casoId);
  if (error) return { ok: false, error: mensajeSupabase(error) };

  await registrarEventoCaso(
    supabase,
    casoId,
    "estado_cambiado",
    `por_autorizar → ordenado (autorizado por ${actor.nombre ?? "un gestor"})`,
    actor
  );

  if (caso.creado_por_id) {
    const mensaje = `${actor.nombre ?? "Un gestor"} autorizó tu caso de compra "${caso.titulo}".`;
    await supabase.from("notificaciones").insert({
      usuario_id: caso.creado_por_id,
      tipo: "autorizacion",
      mensaje,
      caso_compra_id: casoId,
    });
    await enviarPush(caso.creado_por_id, {
      titulo: "Caso de compra autorizado",
      cuerpo: mensaje,
      url: "/proveedores",
    });
  }

  revalidatePath("/proveedores");
  return { ok: true };
}

// Rechaza un caso "por_autorizar": pasa a "rechazado" con el motivo (opcional)
// y notifica a quien lo creó, igual que autorizar.
export async function rechazarCasoCompra(
  casoId: string,
  motivo?: string
): Promise<ActionResult> {
  await requireGestorOCompras();
  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };
  const motivoLimpio = motivo?.trim() || null;

  if (DEMO) {
    try {
      store.rechazarCasoCompra(casoId, motivoLimpio, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
    revalidatePath("/proveedores");
    return { ok: true };
  }

  const supabase = await createClient();
  const { data: caso, error: errCaso } = await supabase
    .from("casos_compra")
    .select("id, titulo, estado, creado_por_id")
    .eq("id", casoId)
    .single();
  if (errCaso || !caso) return { ok: false, error: "Caso no encontrado" };
  if (caso.estado !== "por_autorizar")
    return { ok: false, error: "Este caso ya no está pendiente de autorización" };

  const { error } = await supabase
    .from("casos_compra")
    .update({
      estado: "rechazado",
      motivo_rechazo: motivoLimpio,
      updated_at: new Date().toISOString(),
    })
    .eq("id", casoId);
  if (error) return { ok: false, error: mensajeSupabase(error) };

  await registrarEventoCaso(
    supabase,
    casoId,
    "estado_cambiado",
    `por_autorizar → rechazado (${actor.nombre ?? "un gestor"})${motivoLimpio ? `: ${motivoLimpio}` : ""}`,
    actor
  );

  if (caso.creado_por_id) {
    const mensaje = motivoLimpio
      ? `${actor.nombre ?? "Un gestor"} rechazó tu caso de compra "${caso.titulo}": ${motivoLimpio}`
      : `${actor.nombre ?? "Un gestor"} rechazó tu caso de compra "${caso.titulo}".`;
    await supabase.from("notificaciones").insert({
      usuario_id: caso.creado_por_id,
      tipo: "autorizacion",
      mensaje,
      caso_compra_id: casoId,
    });
    await enviarPush(caso.creado_por_id, {
      titulo: "Caso de compra rechazado",
      cuerpo: mensaje,
      url: "/proveedores",
    });
  }

  revalidatePath("/proveedores");
  return { ok: true };
}

// Edita un caso rechazado y lo regresa a "por_autorizar" — nunca se toca el
// estado a mano, editar y reenviar es la única forma de "reintentar".
export async function editarCasoRechazado(
  casoId: string,
  formData: FormData
): Promise<ActionResult> {
  const proveedor_id = String(formData.get("proveedor_id") ?? "") || null;
  const material_id = String(formData.get("material_id") ?? "") || null;
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;
  const cantidadRaw = String(formData.get("cantidad_estimada") ?? "").trim();
  const cantidad_estimada = Number(cantidadRaw) || 0;

  if (!proveedor_id) return { ok: false, error: "Selecciona un proveedor" };
  if (!material_id) return { ok: false, error: "Selecciona un material" };
  if (!titulo) return { ok: false, error: "El título es obligatorio" };
  if (cantidad_estimada <= 0)
    return { ok: false, error: "La cantidad debe ser mayor a cero" };

  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  // El monto solo lo captura un gestor — el operario nunca lo ve ni lo
  // manda, así que no hay campo que leer ni que validar para él; el
  // monto existente del caso se queda igual hasta que un gestor lo
  // revise (mismo criterio que crearSolicitudCompra).
  let monto_estimado: number | undefined;
  if (puedeGestionarCompras(yo)) {
    const montoRaw = String(formData.get("monto_estimado") ?? "").trim();
    monto_estimado = Number(montoRaw) || 0;
    if (monto_estimado <= 0)
      return { ok: false, error: "El monto debe ser mayor a cero" };
  }

  if (DEMO) {
    try {
      store.editarCasoRechazado(casoId, {
        proveedor_id,
        material_id,
        titulo,
        descripcion,
        cantidad_estimada,
        monto_estimado,
      }, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
    revalidatePath("/proveedores");
    return { ok: true };
  }

  const supabase = await createClient();
  const { data: caso, error: errCaso } = await supabase
    .from("casos_compra")
    .select("estado")
    .eq("id", casoId)
    .single();
  if (errCaso || !caso) return { ok: false, error: "Caso no encontrado" };
  if (caso.estado !== "rechazado")
    return { ok: false, error: "Este caso ya no está rechazado" };

  const { error } = await supabase
    .from("casos_compra")
    .update({
      proveedor_id,
      material_id,
      titulo,
      descripcion,
      cantidad_estimada,
      ...(monto_estimado !== undefined ? { monto_estimado } : {}),
      estado: "por_autorizar",
      motivo_rechazo: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", casoId);
  if (error) return { ok: false, error: mensajeSupabase(error) };

  await registrarEventoCaso(
    supabase,
    casoId,
    "estado_cambiado",
    "rechazado → por_autorizar (editado y reenviado)",
    actor
  );

  revalidatePath("/proveedores");
  return { ok: true };
}

// Solo para casos "rechazado" — un caso activo nunca se borra, solo se
// cancela (mismo criterio que el resto de la app: baja lógica, no destruir
// historial). Un rechazado nunca generó movimiento de stock ni WAC, así
// que borrarlo no corrompe nada; sus eventos se van con él (on delete
// cascade, migración 0020).
export async function eliminarCasoCompra(casoId: string): Promise<ActionResult> {
  await requireGestorOCompras();

  if (DEMO) {
    try {
      store.eliminarCasoCompraRechazado(casoId);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
    revalidatePath("/proveedores");
    return { ok: true };
  }

  const supabase = await createClient();
  const { data: caso, error: errCaso } = await supabase
    .from("casos_compra")
    .select("estado")
    .eq("id", casoId)
    .single();
  if (errCaso || !caso) return { ok: false, error: "Caso no encontrado" };
  if (caso.estado !== "rechazado")
    return { ok: false, error: "Solo se pueden eliminar casos rechazados" };

  const { error } = await supabase.from("casos_compra").delete().eq("id", casoId);
  if (error) return { ok: false, error: mensajeSupabase(error) };

  revalidatePath("/proveedores");
  return { ok: true };
}

// Resuelve una inspección de calidad pendiente: libera (todo o en parte) y/o
// rechaza, con motivo si hay rechazo. La validación real de las cantidades
// vive en lib/inspeccion-calidad.ts (espejada en la RPC) — acá solo se
// exige el rol, igual que autorizarCasoCompra.
export async function resolverInspeccionCalidad(
  inspeccionId: string,
  cantidadLiberada: number,
  cantidadRechazada: number,
  motivoRechazo: string | null
): Promise<ActionResult> {
  await requireGestor();

  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  if (DEMO) {
    try {
      store.resolverInspeccionCalidad(
        inspeccionId,
        cantidadLiberada,
        cantidadRechazada,
        motivoRechazo,
        actor
      );
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase.rpc("resolver_inspeccion_calidad", {
      p_inspeccion: inspeccionId,
      p_cantidad_liberada: cantidadLiberada,
      p_cantidad_rechazada: cantidadRechazada,
      p_motivo_rechazo: motivoRechazo,
    });
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/aprobaciones");
  revalidatePath("/inventario");
  revalidatePath("/movimientos");
  revalidatePath("/analisis");
  return { ok: true };
}

// Guarda (o actualiza) la suscripción de notificaciones push del usuario
// actual. En DEMO no hay push real que activar — regresa ok sin guardar
// nada (no hay tabla que espejar, la campana in-app ya cubre ese caso).
export async function guardarSuscripcionPush(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<ActionResult> {
  const yo = await getCurrentProfile();
  if (!yo) return { ok: false, error: "No autenticado" };
  if (DEMO) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscripciones").upsert(
    { usuario_id: yo.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth_key: sub.auth },
    { onConflict: "endpoint" }
  );
  if (error) return { ok: false, error: mensajeSupabase(error) };
  return { ok: true };
}
