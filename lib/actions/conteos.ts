"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { getConteo, getConteos, getStockPorUbicacionTodos } from "@/lib/data";
import type { Conteo, ConteoDetalle, UsuarioActor } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireGestor() {
  const profile = await getCurrentProfile();
  if (!profile || !esGestor(profile)) throw new Error("No autorizado");
}

export async function obtenerConteos(): Promise<Conteo[]> {
  return getConteos();
}

// Único punto de lectura del detalle de un conteo: decide si
// stock_esperado llega al cliente o no. El conteo es a ciegas mientras
// no esté "aplicado"/"cancelado" — y aun "contado", solo un gestor ve
// esperado/contado/varianza (para poder revisar antes de aplicar).
export async function obtenerConteoDetalle(conteoId: string): Promise<ConteoDetalle | null> {
  const conteo = await getConteo(conteoId);
  if (!conteo) return null;
  const yo = await getCurrentProfile();
  const puedeVerEsperado =
    conteo.estado === "aplicado" ||
    conteo.estado === "cancelado" ||
    (conteo.estado === "contado" && esGestor(yo));

  return {
    ...conteo,
    items: conteo.items.map((it) => {
      if (puedeVerEsperado) return it;
      const { stock_esperado: _oculto, ...resto } = it;
      return resto;
    }),
  };
}

export async function crearConteo(formData: FormData): Promise<ActionResult> {
  await requireGestor();
  const titulo = String(formData.get("titulo") ?? "").trim();
  const categoria_id = String(formData.get("categoria_id") ?? "") || null;
  const ubicacion_id = String(formData.get("ubicacion_id") ?? "") || null;
  if (!titulo) return { ok: false, error: "El título es obligatorio" };

  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  if (DEMO) {
    try {
      store.crearConteo({ titulo, categoria_id, ubicacion_id }, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    let query = supabase.from("materiales").select("id, nombre, sku, ubicacion_id, stock_actual").eq("activo", true);
    if (categoria_id) query = query.eq("categoria_id", categoria_id);
    const { data: materiales } = await query;
    if (!materiales || materiales.length === 0)
      return { ok: false, error: "No hay materiales en ese alcance" };

    const stockPorMaterial = await getStockPorUbicacionTodos();
    const codigo = `CONT-${Date.now().toString().slice(-6)}`;
    const { data: conteo, error: errConteo } = await supabase
      .from("conteos")
      .insert({ codigo, titulo, creado_por_id: actor.id, creado_por_nombre: actor.nombre })
      .select("id")
      .single();
    if (errConteo || !conteo) return { ok: false, error: errConteo ? mensajeSupabase(errConteo) : "Error" };

    const items = materiales.flatMap((m) => {
      const filas = stockPorMaterial[m.id] ?? [
        { ubicacion_id: m.ubicacion_id, ubicacion_nombre: null, stock: m.stock_actual },
      ];
      return filas
        .filter((f) => !ubicacion_id || f.ubicacion_id === ubicacion_id)
        .map((f) => ({
          conteo_id: conteo.id,
          material_id: m.id,
          material_nombre: m.nombre,
          material_sku: m.sku,
          ubicacion_id: f.ubicacion_id,
          ubicacion_nombre: f.ubicacion_nombre,
          stock_esperado: f.stock,
        }));
    });
    if (items.length === 0) {
      // No se pudo generar ni un item con este alcance — no dejar el
      // conteo huérfano sin nada que contar.
      await supabase.from("conteos").delete().eq("id", conteo.id);
      return { ok: false, error: "No hay materiales en ese alcance" };
    }

    const { error: errItems } = await supabase.from("conteo_items").insert(items);
    if (errItems) {
      await supabase.from("conteos").delete().eq("id", conteo.id);
      return { ok: false, error: mensajeSupabase(errItems) };
    }
  }

  revalidatePath("/conteos");
  return { ok: true };
}

// Cualquier autenticado puede capturar (el operario hace el recorrido
// físico) — el propio RLS/estado del conteo es la única barrera.
export async function capturarConteoItem(
  itemId: string,
  cantidad: number
): Promise<ActionResult> {
  if (!Number.isFinite(cantidad) || cantidad < 0)
    return { ok: false, error: "La cantidad contada debe ser un número válido" };

  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  if (DEMO) {
    try {
      store.capturarConteoItem(itemId, cantidad, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
    revalidatePath("/conteos");
    return { ok: true };
  }

  const supabase = await createClient();
  const { data: item, error: errItem } = await supabase
    .from("conteo_items")
    .select("conteo_id")
    .eq("id", itemId)
    .single();
  if (errItem || !item) return { ok: false, error: "Item no encontrado" };

  const { data: conteo } = await supabase
    .from("conteos")
    .select("estado")
    .eq("id", item.conteo_id)
    .single();
  if (!conteo || conteo.estado !== "abierto")
    return { ok: false, error: "Este conteo ya no está abierto para captura" };

  const { error } = await supabase
    .from("conteo_items")
    .update({
      cantidad_contada: cantidad,
      contado_por_id: actor.id,
      contado_por_nombre: actor.nombre,
      contado_at: new Date().toISOString(),
    })
    .eq("id", itemId);
  if (error) return { ok: false, error: mensajeSupabase(error) };

  const { count } = await supabase
    .from("conteo_items")
    .select("id", { count: "exact", head: true })
    .eq("conteo_id", item.conteo_id)
    .is("cantidad_contada", null);
  if (count === 0) {
    await supabase
      .from("conteos")
      .update({ estado: "contado", updated_at: new Date().toISOString() })
      .eq("id", item.conteo_id);
  }

  revalidatePath("/conteos");
  return { ok: true };
}

export async function cerrarConteo(conteoId: string): Promise<ActionResult> {
  await requireGestor();
  if (DEMO) {
    try {
      store.cerrarConteo(conteoId);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data: conteo } = await supabase.from("conteos").select("estado").eq("id", conteoId).single();
    if (!conteo || conteo.estado !== "abierto")
      return { ok: false, error: "Este conteo ya no está abierto" };
    const { error } = await supabase
      .from("conteos")
      .update({ estado: "contado", updated_at: new Date().toISOString() })
      .eq("id", conteoId);
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }
  revalidatePath("/conteos");
  return { ok: true };
}

export async function cancelarConteo(conteoId: string): Promise<ActionResult> {
  await requireGestor();
  if (DEMO) {
    try {
      store.cancelarConteo(conteoId);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data: conteo } = await supabase.from("conteos").select("estado").eq("id", conteoId).single();
    if (conteo?.estado === "aplicado")
      return { ok: false, error: "Un conteo ya aplicado no se puede cancelar" };
    const { error } = await supabase
      .from("conteos")
      .update({ estado: "cancelado", updated_at: new Date().toISOString() })
      .eq("id", conteoId);
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }
  revalidatePath("/conteos");
  return { ok: true };
}

export async function aplicarConteo(conteoId: string): Promise<ActionResult> {
  await requireGestor();
  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  if (DEMO) {
    try {
      store.aplicarConteo(conteoId, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase.rpc("aplicar_conteo", { p_conteo: conteoId });
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }
  revalidatePath("/conteos");
  revalidatePath("/inventario");
  revalidatePath("/movimientos");
  revalidatePath("/reportes");
  return { ok: true };
}
