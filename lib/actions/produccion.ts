"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { getCurrentProfile, esGestor } from "@/lib/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireGestor() {
  const profile = await getCurrentProfile();
  if (!profile || !esGestor(profile)) throw new Error("No autorizado");
}

// Guardar = reemplaza toda la receta del producto (solo gestor — es
// configuración de catálogo, como editar un material).
export async function guardarBom(
  producto_id: string,
  items: { componente_id: string; cantidad_por_unidad: number }[]
): Promise<ActionResult> {
  if (!producto_id) return { ok: false, error: "Material inválido" };
  try {
    await requireGestor();
  } catch {
    return { ok: false, error: "No autorizado" };
  }

  if (DEMO) {
    try {
      store.guardarBom(producto_id, items);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error: delErr } = await supabase
      .from("bom_items")
      .delete()
      .eq("producto_id", producto_id);
    if (delErr) return { ok: false, error: mensajeSupabase(delErr) };

    if (items.length > 0) {
      const { error: insErr } = await supabase.from("bom_items").insert(
        items.map((it) => ({
          producto_id,
          componente_id: it.componente_id,
          cantidad_por_unidad: it.cantidad_por_unidad,
        }))
      );
      if (insErr) return { ok: false, error: mensajeSupabase(insErr) };
    }
  }

  revalidatePath(`/materiales/${producto_id}`);
  revalidatePath("/produccion");
  return { ok: true };
}

// Producir es una acción de piso de planta, no de configuración — igual que
// registrar un movimiento, cualquier autenticado puede hacerlo (no solo
// gestor).
export async function producir(
  producto_id: string,
  cantidad: number,
  ubicacion_id?: string | null
): Promise<ActionResult> {
  if (!producto_id) return { ok: false, error: "Material inválido" };
  if (!Number.isFinite(cantidad) || cantidad <= 0)
    return { ok: false, error: "La cantidad debe ser mayor a cero" };

  if (DEMO) {
    try {
      store.producir(producto_id, cantidad, ubicacion_id ?? null);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase.rpc("producir", {
      p_producto_id: producto_id,
      p_cantidad: cantidad,
      p_ubicacion: ubicacion_id ?? null,
    });
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/produccion");
  revalidatePath("/inventario");
  revalidatePath("/movimientos");
  revalidatePath(`/materiales/${producto_id}`);
  return { ok: true };
}
