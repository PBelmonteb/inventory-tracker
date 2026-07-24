"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { getCurrentProfile } from "@/lib/auth";
import { registrarEventoCasoVenta } from "@/lib/eventos-caso";
import { getEventosCasoVenta } from "@/lib/data";
import {
  ESTADOS_CASO_VENTA,
  type CasoVentaEvento,
  type EstadoCasoVenta,
  type UsuarioActor,
} from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

type ItemVenta = { material_id: string; cantidad: number };

function parseItems(raw: string): ItemVenta[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const items: ItemVenta[] = [];
    for (const it of parsed) {
      const material_id = String((it as ItemVenta).material_id ?? "");
      const cantidad = Number((it as ItemVenta).cantidad ?? 0);
      if (!material_id || !Number.isFinite(cantidad) || cantidad <= 0)
        return null;
      items.push({ material_id, cantidad });
    }
    return items;
  } catch {
    return null;
  }
}

export async function crearCasoVenta(
  formData: FormData
): Promise<ActionResult> {
  const cliente_id = String(formData.get("cliente_id") ?? "");
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;
  const monto = Number(formData.get("monto") ?? 0) || 0;
  const responsable_id = String(formData.get("responsable_id") ?? "") || null;
  let referencia = String(formData.get("referencia") ?? "").trim();
  if (!referencia) referencia = `OV-${Date.now().toString().slice(-6)}`;

  if (!cliente_id) return { ok: false, error: "Selecciona un cliente" };
  if (!titulo) return { ok: false, error: "El título es obligatorio" };
  if (monto < 0) return { ok: false, error: "El monto no puede ser negativo" };

  const items = parseItems(String(formData.get("items") ?? ""));
  if (!items)
    return {
      ok: false,
      error: "Agrega al menos un material con cantidad mayor a cero",
    };

  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  if (DEMO) {
    try {
      const caso = store.crearCasoVenta(
        { cliente_id, titulo, descripcion, monto, referencia, responsable_id },
        items
      );
      store.registrarEventoCasoVenta(caso.id, "creado", null, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("casos_venta")
      .insert({ cliente_id, titulo, descripcion, monto, referencia })
      .select("id")
      .single();
    if (error) return { ok: false, error: mensajeSupabase(error) };
    const { error: errItems } = await supabase
      .from("casos_venta_items")
      .insert(items.map((it) => ({ ...it, caso_venta_id: data.id })));
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

// Asigna (o quita) el responsable de un caso de venta. Sin gate de rol.
export async function asignarResponsableCasoVenta(
  casoId: string,
  usuarioId: string
): Promise<ActionResult> {
  const yo = await getCurrentProfile();
  if (!yo) return { ok: false, error: "No autenticado" };
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
  if (!yo) return { ok: false, error: "No autenticado" };

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
  const yo = await getCurrentProfile();
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
  revalidatePath("/reportes");
  // La salida puede dejar otro material bajo mínimo → nueva alerta al recargar.
  revalidatePath("/proveedores");
  return { ok: true };
}

export async function cancelarSalidaPendiente(
  id: string
): Promise<ActionResult> {
  const yo = await getCurrentProfile();
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

// Nota manual en el timeline de un caso de venta (estilo Chatter).
export async function agregarNotaCasoVenta(
  casoId: string,
  texto: string
): Promise<ActionResult> {
  if (!casoId) return { ok: false, error: "Caso inválido" };
  if (!texto.trim()) return { ok: false, error: "La nota no puede estar vacía" };

  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

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
