"use server";

// Autorizar/rechazar un caso de venta creado por operario — mismo patrón
// que lib/actions/autorizacion.ts (compras), pero sin umbral por monto
// (decisión de alcance: toda cotización de operario necesita autorización
// sin importar el monto, cualquier gestor/ventas la puede autorizar) y sin
// correo saliente (autorizar aquí no manda una orden a nadie, solo
// notifica al creador). Ver migración 0043_autorizacion_casos_venta.sql.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { getCurrentProfile, puedeGestionarVentas } from "@/lib/auth";
import { registrarEventoCasoVenta } from "@/lib/eventos-caso";
import { enviarPush } from "@/lib/push";
import type { UsuarioActor } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireGestorOVentas() {
  const profile = await getCurrentProfile();
  if (!profile || !puedeGestionarVentas(profile)) throw new Error("No autorizado");
}

type ItemVenta = { material_id: string; cantidad: number };

function parseItems(raw: string): ItemVenta[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const items: ItemVenta[] = [];
    for (const it of parsed) {
      const material_id = String((it as ItemVenta).material_id ?? "");
      const cantidad = Number((it as ItemVenta).cantidad ?? 0);
      if (!material_id || !Number.isFinite(cantidad) || cantidad <= 0) return null;
      items.push({ material_id, cantidad });
    }
    return items;
  } catch {
    return null;
  }
}

// Autorizar = confirma el precio por cada material (el operario nunca lo
// captura, le toca a quien autoriza) y pasa el caso a "cotizacion" — sigue
// su ciclo normal desde ahí. El monto del caso ya no se toca aquí: lo
// recalcula solo el trigger de la migración 0045_precio_linea_venta.sql
// en cuanto se actualiza el precio de cada item. A diferencia de compras,
// no hay cantidad que ajustar (ya viene fija por material desde la
// creación) ni correo que enviar.
export async function autorizarCasoVenta(
  casoId: string,
  precios: { id: string; precio_unitario: number }[]
): Promise<ActionResult> {
  await requireGestorOVentas();
  if (
    precios.length === 0 ||
    precios.some((p) => !Number.isFinite(p.precio_unitario) || p.precio_unitario <= 0)
  )
    return {
      ok: false,
      error: "Captura el precio de cada material — el operario no lo captura, te toca a ti.",
    };

  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  if (DEMO) {
    try {
      store.autorizarCasoVenta(casoId, precios, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data: caso } = await supabase
      .from("casos_venta")
      .select("estado, titulo, creado_por_id")
      .eq("id", casoId)
      .single();
    if (!caso) return { ok: false, error: "Caso no encontrado" };
    if (caso.estado !== "por_autorizar")
      return { ok: false, error: "Este caso ya no está pendiente de autorización" };

    for (const p of precios) {
      const { error: errItem } = await supabase
        .from("casos_venta_items")
        .update({ precio_unitario: p.precio_unitario })
        .eq("id", p.id)
        .eq("caso_venta_id", casoId);
      if (errItem) return { ok: false, error: mensajeSupabase(errItem) };
    }

    // El update de items (arriba) ya disparó el trigger que recalcula
    // monto — este update solo cambia el estado.
    const { error } = await supabase
      .from("casos_venta")
      .update({ estado: "cotizacion" })
      .eq("id", casoId);
    if (error) return { ok: false, error: mensajeSupabase(error) };

    await registrarEventoCasoVenta(
      supabase,
      casoId,
      "estado_cambiado",
      `por_autorizar → cotizacion (autorizado por ${actor.nombre ?? "ventas"})`,
      actor
    );

    if (caso.creado_por_id) {
      const mensaje = `${actor.nombre ?? "Ventas"} autorizó tu cotización "${caso.titulo}".`;
      await supabase.from("notificaciones").insert({
        usuario_id: caso.creado_por_id,
        tipo: "autorizacion",
        mensaje,
        caso_venta_id: casoId,
      });
      await enviarPush(caso.creado_por_id, {
        titulo: "Cotización autorizada",
        cuerpo: mensaje,
        url: "/clientes",
      });
    }
  }

  revalidatePath("/clientes");
  return { ok: true };
}

export async function rechazarCasoVenta(
  casoId: string,
  motivo?: string
): Promise<ActionResult> {
  await requireGestorOVentas();
  const motivoLimpio = motivo?.trim() || null;

  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  if (DEMO) {
    try {
      store.rechazarCasoVenta(casoId, motivoLimpio, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data: caso } = await supabase
      .from("casos_venta")
      .select("estado, titulo, creado_por_id")
      .eq("id", casoId)
      .single();
    if (!caso) return { ok: false, error: "Caso no encontrado" };
    if (caso.estado !== "por_autorizar")
      return { ok: false, error: "Este caso ya no está pendiente de autorización" };

    const { error } = await supabase
      .from("casos_venta")
      .update({
        estado: "rechazado",
        motivo_rechazo: motivoLimpio,
        updated_at: new Date().toISOString(),
      })
      .eq("id", casoId);
    if (error) return { ok: false, error: mensajeSupabase(error) };

    await registrarEventoCasoVenta(
      supabase,
      casoId,
      "estado_cambiado",
      `por_autorizar → rechazado (${actor.nombre ?? "ventas"})${motivoLimpio ? `: ${motivoLimpio}` : ""}`,
      actor
    );

    if (caso.creado_por_id) {
      const mensaje = motivoLimpio
        ? `${actor.nombre ?? "Ventas"} rechazó tu cotización "${caso.titulo}": ${motivoLimpio}`
        : `${actor.nombre ?? "Ventas"} rechazó tu cotización "${caso.titulo}".`;
      await supabase.from("notificaciones").insert({
        usuario_id: caso.creado_por_id,
        tipo: "autorizacion",
        mensaje,
        caso_venta_id: casoId,
      });
      await enviarPush(caso.creado_por_id, {
        titulo: "Cotización rechazada",
        cuerpo: mensaje,
        url: "/clientes",
      });
    }
  }

  revalidatePath("/clientes");
  return { ok: true };
}

// Editar un caso "rechazado" y reenviarlo: regresa solo a "por_autorizar"
// — nunca se toca el estado a mano. El creador puede reenviar el suyo;
// gestor/ventas puede reenviar cualquiera.
export async function editarCasoVentaRechazado(
  casoId: string,
  formData: FormData
): Promise<ActionResult> {
  const yo = await getCurrentProfile();
  if (!yo) return { ok: false, error: "No autorizado" };

  const cliente_id = String(formData.get("cliente_id") ?? "");
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;
  const items = parseItems(String(formData.get("items") ?? ""));

  if (!cliente_id) return { ok: false, error: "Selecciona un cliente" };
  if (!titulo) return { ok: false, error: "El título es obligatorio" };
  if (!items)
    return { ok: false, error: "Agrega al menos un material con cantidad mayor a cero" };

  const actor: UsuarioActor = { id: yo.id, nombre: yo.nombre };

  if (DEMO) {
    try {
      store.editarCasoVentaRechazado(
        casoId,
        { cliente_id, titulo, descripcion, items },
        actor
      );
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data: caso } = await supabase
      .from("casos_venta")
      .select("estado, creado_por_id")
      .eq("id", casoId)
      .single();
    if (!caso) return { ok: false, error: "Caso no encontrado" };
    if (caso.estado !== "rechazado")
      return { ok: false, error: "Este caso ya no está rechazado" };
    if (!puedeGestionarVentas(yo) && caso.creado_por_id !== yo.id)
      return { ok: false, error: "No autorizado" };

    const { data: cliente } = await supabase
      .from("clientes")
      .select("nombre")
      .eq("id", cliente_id)
      .single();

    const { error } = await supabase
      .from("casos_venta")
      .update({
        cliente_id,
        cliente_nombre: cliente?.nombre ?? null,
        titulo,
        descripcion,
        estado: "por_autorizar",
        motivo_rechazo: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", casoId);
    if (error) return { ok: false, error: mensajeSupabase(error) };

    await supabase.from("casos_venta_items").delete().eq("caso_venta_id", casoId);
    const { error: errItems } = await supabase
      .from("casos_venta_items")
      .insert(items.map((it) => ({ ...it, caso_venta_id: casoId })));
    if (errItems) return { ok: false, error: mensajeSupabase(errItems) };

    await registrarEventoCasoVenta(
      supabase,
      casoId,
      "estado_cambiado",
      "rechazado → por_autorizar (editado y reenviado)",
      actor
    );
  }

  revalidatePath("/clientes");
  return { ok: true };
}

// Solo gestor/ventas, y solo si el caso nunca pasó de "rechazado" (nunca
// generó salida/movimiento — borrarlo no corrompe nada, igual que
// eliminarCasoCompra del lado de compras).
export async function eliminarCasoVenta(casoId: string): Promise<ActionResult> {
  await requireGestorOVentas();

  if (DEMO) {
    try {
      store.eliminarCasoVentaRechazado(casoId);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data: caso } = await supabase
      .from("casos_venta")
      .select("estado")
      .eq("id", casoId)
      .single();
    if (!caso) return { ok: false, error: "Caso no encontrado" };
    if (caso.estado !== "rechazado")
      return { ok: false, error: "Solo se pueden eliminar casos rechazados" };
    const { error } = await supabase.from("casos_venta").delete().eq("id", casoId);
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/clientes");
  return { ok: true };
}
