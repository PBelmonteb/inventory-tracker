"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { getCurrentProfile, puedeCrearCasoVenta, puedeGestionarVentas } from "@/lib/auth";
import { registrarEventoCasoVenta } from "@/lib/eventos-caso";
import { getEventosCasoVenta, getDevolucionesCasoVenta } from "@/lib/data";
import {
  ESTADOS_CASO_VENTA,
  type CasoVentaEvento,
  type DevolucionVenta,
  type EstadoCasoVenta,
  type UsuarioActor,
} from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Gestionar el Portal de Clientes (cambiar estado de casos, confirmar o
// cancelar salidas, gestionar clientes) es tarea de gestor o ventas.
// Crear una cotización es más permisivo — ver requireCrearCasoVenta.
async function requireGestorOVentas() {
  const profile = await getCurrentProfile();
  if (!profile || !puedeGestionarVentas(profile)) throw new Error("No autorizado");
}

// Operario también puede crear una cotización (sin autoridad para
// confirmarla) — entra a "por_autorizar" en vez de "cotizacion" (ver
// crearCasoVenta). Mismo criterio que crearSolicitudCompra del lado de
// compras (lib/actions/solicitudes.ts).
async function requireCrearCasoVenta() {
  const profile = await getCurrentProfile();
  if (!profile || !puedeCrearCasoVenta(profile)) throw new Error("No autorizado");
}

type ItemVenta = { material_id: string; cantidad: number; precio_unitario: number };

function parseItems(raw: string): ItemVenta[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const items: ItemVenta[] = [];
    for (const it of parsed) {
      const material_id = String((it as ItemVenta).material_id ?? "");
      const cantidad = Number((it as ItemVenta).cantidad ?? 0);
      const precio_unitario = Number((it as ItemVenta).precio_unitario ?? 0) || 0;
      if (!material_id || !Number.isFinite(cantidad) || cantidad <= 0)
        return null;
      if (precio_unitario < 0) return null;
      items.push({ material_id, cantidad, precio_unitario });
    }
    return items;
  } catch {
    return null;
  }
}

export async function crearCasoVenta(
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireCrearCasoVenta();
  } catch {
    return { ok: false, error: "No autorizado" };
  }

  const cliente_id = String(formData.get("cliente_id") ?? "");
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;
  const responsable_id = String(formData.get("responsable_id") ?? "") || null;
  let referencia = String(formData.get("referencia") ?? "").trim();
  if (!referencia) referencia = `OV-${Date.now().toString().slice(-6)}`;

  if (!cliente_id) return { ok: false, error: "Selecciona un cliente" };
  if (!titulo) return { ok: false, error: "El título es obligatorio" };

  const items = parseItems(String(formData.get("items") ?? ""));
  if (!items)
    return {
      ok: false,
      error: "Agrega al menos un material con cantidad mayor a cero",
    };

  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  // Ruteo por rol (igual que crearSolicitudCompra del lado de compras): si
  // quien crea el caso NO tiene autoridad sobre el Portal de Clientes
  // (operario), entra directo a "por_autorizar" y el PRECIO se ignora — lo
  // captura ventas/gestor al autorizar (autorizarCasoVenta). Si es
  // gestor/ventas, sigue como hoy: "cotizacion", con el precio que capture
  // por línea (monto ya no se captura a mano, lo deriva el trigger de la
  // migración 0045_precio_linea_venta.sql a partir de los items).
  const requiereAutorizacion = Boolean(yo) && !puedeGestionarVentas(yo);
  const estadoInicial = requiereAutorizacion ? "por_autorizar" : "cotizacion";
  // Defensa en profundidad: aunque el formulario de operario no ofrece
  // precio, se fuerza a 0 por si alguien manda un request a mano.
  const itemsFinales = requiereAutorizacion
    ? items.map((it) => ({ ...it, precio_unitario: 0 }))
    : items;

  if (DEMO) {
    try {
      const caso = store.crearCasoVenta(
        {
          cliente_id,
          titulo,
          descripcion,
          referencia,
          responsable_id,
          estado: estadoInicial,
          creado_por_id: actor.id,
          creado_por_nombre: actor.nombre,
        },
        itemsFinales
      );
      store.registrarEventoCasoVenta(caso.id, "creado", null, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("casos_venta")
      .insert({
        cliente_id,
        titulo,
        descripcion,
        referencia,
        estado: estadoInicial,
        creado_por_id: actor.id,
        creado_por_nombre: actor.nombre,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: mensajeSupabase(error) };
    const { error: errItems } = await supabase
      .from("casos_venta_items")
      .insert(itemsFinales.map((it) => ({ ...it, caso_venta_id: data.id })));
    if (errItems) return { ok: false, error: mensajeSupabase(errItems) };
    await registrarEventoCasoVenta(supabase, data.id, "creado", null, actor);
    if (responsable_id) {
      await supabase.rpc("asignar_responsable_caso_venta", {
        p_caso: data.id,
        p_usuario: responsable_id,
        p_asignado_por: actor.nombre,
      });
      await registrarEventoCasoVenta(
        supabase,
        data.id,
        "responsable_asignado",
        "Responsable asignado",
        actor
      );
    }
  }

  revalidatePath("/clientes");
  return { ok: true };
}

// Asigna (o quita) el responsable de un caso de venta.
export async function asignarResponsableCasoVenta(
  casoId: string,
  usuarioId: string
): Promise<ActionResult> {
  const yo = await getCurrentProfile();
  if (!yo || !puedeGestionarVentas(yo)) return { ok: false, error: "No autorizado" };
  const actor: UsuarioActor = { id: yo.id, nombre: yo.nombre };
  const detalleEvento = usuarioId ? "Responsable asignado" : "Responsable removido";

  if (DEMO) {
    try {
      store.asignarResponsableCasoVenta(casoId, usuarioId || null, yo.nombre);
      store.registrarEventoCasoVenta(casoId, "responsable_asignado", detalleEvento, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase.rpc("asignar_responsable_caso_venta", {
      p_caso: casoId,
      p_usuario: usuarioId || null,
      p_asignado_por: yo.nombre,
    });
    if (error) return { ok: false, error: mensajeSupabase(error) };
    await registrarEventoCasoVenta(supabase, casoId, "responsable_asignado", detalleEvento, actor);
  }

  revalidatePath("/clientes");
  return { ok: true };
}

// Asigna (o quita) el responsable de completar una salida pendiente.
// No bloquea confirmar/cancelar — es solo informativo + notificación.
export async function asignarResponsableSalidaPendiente(
  id: string,
  usuarioId: string
): Promise<ActionResult> {
  const yo = await getCurrentProfile();
  if (!yo || !puedeGestionarVentas(yo)) return { ok: false, error: "No autorizado" };

  if (DEMO) {
    try {
      store.asignarResponsableSalidaPendiente(id, usuarioId || null, yo.nombre);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase.rpc(
      "asignar_responsable_salida_pendiente",
      { p_id: id, p_usuario: usuarioId || null, p_asignado_por: yo.nombre }
    );
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/clientes");
  return { ok: true };
}

export async function cambiarEstadoCasoVenta(
  id: string,
  estado: EstadoCasoVenta
): Promise<ActionResult> {
  if (!ESTADOS_CASO_VENTA.includes(estado))
    return { ok: false, error: "Estado inválido" };
  // "por_autorizar"/"rechazado" nunca se ponen a mano — solo se llega ahí
  // vía crearCasoVenta (al crear) o autorizarCasoVenta/rechazarCasoVenta
  // (lib/actions/autorizacion-ventas.ts). El <select> libre de
  // clientes-view.tsx tampoco los ofrece, pero se blinda aquí también.
  if (estado === "por_autorizar" || estado === "rechazado")
    return { ok: false, error: "Ese estado no se puede asignar directamente" };
  const yo = await getCurrentProfile();
  if (!puedeGestionarVentas(yo)) return { ok: false, error: "No autorizado" };
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  if (DEMO) {
    try {
      store.cambiarEstadoCasoVenta(id, estado, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    // RPC autoritaria: valida disponible al comprometer (anti-sobreventa);
    // el trigger de la BD crea/cancela las salidas pendientes.
    const supabase = await createClient();
    const { data: actual } = await supabase
      .from("casos_venta")
      .select("estado")
      .eq("id", id)
      .single();
    const { error } = await supabase.rpc("cambiar_estado_caso_venta", {
      p_caso: id,
      p_estado: estado,
    });
    if (error) return { ok: false, error: mensajeSupabase(error) };
    await registrarEventoCasoVenta(
      supabase,
      id,
      "estado_cambiado",
      `${actual?.estado ?? "?"} → ${estado}`,
      actor
    );
  }

  revalidatePath("/clientes");
  revalidatePath("/movimientos");
  return { ok: true };
}

// cantidad opcional: si se omite confirma todo lo pendiente (como antes); si
// se especifica una cantidad menor, confirma solo esa parte y la salida
// sigue pendiente por el restante (entrega parcial).
export async function confirmarSalidaPendiente(
  id: string,
  cantidad?: number
): Promise<ActionResult> {
  if (cantidad !== undefined && (!Number.isFinite(cantidad) || cantidad <= 0))
    return { ok: false, error: "La cantidad debe ser mayor a cero" };
  const yo = await getCurrentProfile();
  if (!puedeGestionarVentas(yo)) return { ok: false, error: "No autorizado" };
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  if (DEMO) {
    try {
      store.confirmarSalidaPendiente(id, cantidad, actor);
    } catch (err) {
      // Aquí llega "Stock insuficiente: ..." para mostrarse en la fila.
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data: sp } = await supabase
      .from("salidas_pendientes")
      .select("caso_venta_id, cantidad, materiales(nombre, unidad)")
      .eq("id", id)
      .single();
    const { error } = await supabase.rpc("confirmar_salida_pendiente", {
      p_id: id,
      p_cantidad: cantidad ?? null,
    });
    if (error) return { ok: false, error: mensajeSupabase(error) };
    if (sp?.caso_venta_id) {
      const aConfirmar = cantidad ?? sp.cantidad;
      const restante = sp.cantidad - aConfirmar;
      const material = sp.materiales as unknown as { nombre: string; unidad: string } | null;
      await registrarEventoCasoVenta(
        supabase,
        sp.caso_venta_id,
        "estado_cambiado",
        `Entrega confirmada: ${aConfirmar} ${material?.unidad ?? ""} de ${material?.nombre ?? "material"}${restante > 0 ? ` (quedan ${restante} pendientes)` : ""}.`,
        actor
      );
    }
  }

  revalidatePath("/clientes");
  revalidatePath("/inventario");
  revalidatePath("/movimientos");
  revalidatePath("/analisis");
  // La salida puede dejar otro material bajo mínimo → nueva alerta al recargar.
  revalidatePath("/proveedores");
  return { ok: true };
}

export async function cancelarSalidaPendiente(
  id: string
): Promise<ActionResult> {
  const yo = await getCurrentProfile();
  if (!puedeGestionarVentas(yo)) return { ok: false, error: "No autorizado" };
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  if (DEMO) {
    try {
      store.cancelarSalidaPendiente(id, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data: sp } = await supabase
      .from("salidas_pendientes")
      .select("caso_venta_id, cantidad, materiales(nombre, unidad)")
      .eq("id", id)
      .single();
    const { error } = await supabase
      .from("salidas_pendientes")
      .update({ estado: "cancelada", resuelta_at: new Date().toISOString() })
      .eq("id", id)
      .eq("estado", "pendiente");
    if (error) return { ok: false, error: mensajeSupabase(error) };
    if (sp?.caso_venta_id) {
      const material = sp.materiales as unknown as { nombre: string; unidad: string } | null;
      await registrarEventoCasoVenta(
        supabase,
        sp.caso_venta_id,
        "estado_cambiado",
        `Entrega pendiente cancelada: ${sp.cantidad} ${material?.unidad ?? ""} de ${material?.nombre ?? "material"}.`,
        actor
      );
    }
  }

  revalidatePath("/clientes");
  revalidatePath("/movimientos");
  return { ok: true };
}

// Lectura de solo lectura, sin gate de rol — mismo criterio que
// obtenerEventosCaso (lib/actions/solicitudes.ts) del lado de compras.
export async function obtenerEventosCasoVenta(
  casoId: string
): Promise<CasoVentaEvento[]> {
  return getEventosCasoVenta(casoId);
}

// Nota manual en el timeline de un caso de venta (estilo Chatter). Además
// de gestor/ventas, el operario que creó el caso puede agregar notas al
// suyo mientras espera autorización (decisión de alcance del flujo de
// autorización — ver migración 0043_autorizacion_casos_venta.sql).
export async function agregarNotaCasoVenta(
  casoId: string,
  texto: string
): Promise<ActionResult> {
  if (!casoId) return { ok: false, error: "Caso inválido" };
  if (!texto.trim()) return { ok: false, error: "La nota no puede estar vacía" };

  const yo = await getCurrentProfile();
  if (!yo) return { ok: false, error: "No autorizado" };
  if (!puedeGestionarVentas(yo)) {
    const esCreador = DEMO
      ? store.getCasosVenta().find((c) => c.id === casoId)?.creado_por_id === yo.id
      : await esCreadorCasoVenta(casoId, yo.id);
    if (!esCreador) return { ok: false, error: "No autorizado" };
  }
  const actor: UsuarioActor = { id: yo.id, nombre: yo.nombre };

  if (DEMO) {
    try {
      store.agregarNotaCasoVenta(casoId, texto, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    await registrarEventoCasoVenta(supabase, casoId, "nota", texto.trim(), actor);
  }

  revalidatePath("/clientes");
  return { ok: true };
}

async function esCreadorCasoVenta(casoId: string, usuarioId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("casos_venta")
    .select("creado_por_id")
    .eq("id", casoId)
    .single();
  return data?.creado_por_id === usuarioId;
}

// Lectura de solo lectura, sin gate de rol — mismo criterio que
// obtenerEventosCasoVenta.
export async function obtenerDevolucionesCasoVenta(
  casoId: string
): Promise<DevolucionVenta[]> {
  return getDevolucionesCasoVenta(casoId);
}

// Reversa parcial o total de un caso entregado — inserta una "entrada"
// compensatoria (sin costo_unitario, no toca WAC) en vez de mutar/borrar
// el movimiento de salida original. Ver migración 0042.
export async function registrarDevolucionVenta(
  casoId: string,
  materialId: string,
  cantidad: number,
  motivo?: string
): Promise<ActionResult> {
  if (!Number.isFinite(cantidad) || cantidad <= 0)
    return { ok: false, error: "La cantidad debe ser mayor a cero" };
  const yo = await getCurrentProfile();
  if (!puedeGestionarVentas(yo)) return { ok: false, error: "No autorizado" };
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  let materialNombre = "";
  if (DEMO) {
    try {
      materialNombre = store.registrarDevolucionVenta(casoId, materialId, cantidad, motivo, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data: material } = await supabase
      .from("materiales")
      .select("nombre")
      .eq("id", materialId)
      .single();
    materialNombre = material?.nombre ?? "material";
    const { error } = await supabase.rpc("registrar_devolucion_venta", {
      p_caso: casoId,
      p_material: materialId,
      p_cantidad: cantidad,
      p_motivo: motivo ?? null,
    });
    if (error) return { ok: false, error: mensajeSupabase(error) };
    await registrarEventoCasoVenta(
      supabase,
      casoId,
      "estado_cambiado",
      `Devolución registrada: ${cantidad} de ${materialNombre}${motivo ? ` (${motivo})` : ""}.`,
      actor
    );
  }

  revalidatePath("/clientes");
  revalidatePath("/inventario");
  revalidatePath("/movimientos");
  return { ok: true };
}
