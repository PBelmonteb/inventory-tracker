"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { getCurrentProfile, esAdmin } from "@/lib/auth";
import { getEOQ, getStockSugerido, getStockSugeridoTodos } from "@/lib/data";
import type { StockSugerido } from "@/lib/stock-sugerido";
import type { ResultadoEOQ } from "@/lib/eoq";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

// Se llama on-demand desde el formulario de edición (client component) —
// por eso vive como server action de solo lectura en vez de en lib/data.ts
// directo, que solo pueden llamar Server Components.
export async function obtenerStockSugerido(
  materialId: string
): Promise<StockSugerido> {
  return getStockSugerido(materialId);
}

// Para el botón "Aplicar sugeridos" de Inventario -- todo el catálogo de
// una vez, en lugar de abrir material por material.
export async function obtenerStockSugeridoTodos(): Promise<
  Record<string, StockSugerido>
> {
  return getStockSugeridoTodos();
}

export async function obtenerEOQ(
  materialId: string,
  costoUnitario: number
): Promise<ResultadoEOQ> {
  return getEOQ(materialId, costoUnitario);
}

function parseMaterial(formData: FormData) {
  const num = (k: string) => {
    const v = formData.get(k);
    const n = v === null || v === "" ? 0 : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };

  const avisoModo =
    String(formData.get("aviso_modo") ?? "porcentaje") === "unidad"
      ? "unidad"
      : "porcentaje";
  const avisoValorRaw = num("aviso_valor");

  return {
    sku: str("sku"),
    nombre: String(formData.get("nombre") ?? "").trim(),
    descripcion: str("descripcion"),
    categoria_id: str("categoria_id"),
    ubicacion_id: str("ubicacion_id"),
    proveedor_id: str("proveedor_id"),
    unidad: String(formData.get("unidad") ?? "pza").trim() || "pza",
    stock_minimo: num("stock_minimo"),
    // Si no se especifica, 20% por defecto (avisa con holgura razonable).
    aviso_valor: avisoValorRaw > 0 ? avisoValorRaw : 20,
    aviso_modo: avisoModo as "unidad" | "porcentaje",
    costo_unitario: num("costo_unitario"),
    precio_venta: num("precio_venta"),
    // Checkbox: ausente en FormData si está desmarcado.
    requiere_inspeccion_calidad: formData.get("requiere_inspeccion_calidad") === "on",
  };
}

export async function crearMaterial(formData: FormData): Promise<ActionResult> {
  const data = parseMaterial(formData);
  if (!data.nombre) return { ok: false, error: "El nombre es obligatorio" };

  const stockInicial = Number(formData.get("stock_inicial") ?? 0) || 0;

  if (DEMO) {
    try {
      const m = store.crearMaterial(data, stockInicial);
      revalidatePath("/inventario");
      return { ok: true, id: m.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("materiales")
    .insert({ ...data, stock_actual: 0 })
    .select("id")
    .single();
  if (error) return { ok: false, error: mensajeSupabase(error) };

  // Registra el stock inicial como un movimiento de entrada (para historial).
  if (stockInicial > 0 && inserted) {
    const { error: movError } = await supabase.from("movimientos").insert({
      material_id: inserted.id,
      tipo: "entrada",
      cantidad: stockInicial,
      nota: "Stock inicial",
    });
    if (movError) return { ok: false, error: mensajeSupabase(movError) };
  }

  revalidatePath("/inventario");
  return { ok: true, id: inserted?.id };
}

export async function actualizarMaterial(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const data = parseMaterial(formData);
  if (!data.nombre) return { ok: false, error: "El nombre es obligatorio" };

  // Al editar NO se toca el costo: es el WAC, gestionado por las entradas.
  // (El precio de venta sí se actualiza.)
  const { costo_unitario, ...editable } = data;
  void costo_unitario;

  if (DEMO) {
    try {
      store.actualizarMaterial(id, editable);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("materiales")
      .update(editable)
      .eq("id", id);
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/inventario");
  revalidatePath(`/materiales/${id}`);
  return { ok: true, id };
}

// Precios de venta es territorio de admin (dueño), no de gerente -- la
// pestaña "Precios" de Administración ya no se le muestra a un gerente,
// pero esta acción es el muro real (RLS de materiales sigue abierto a
// cualquier gestor, ver 0002_rls.sql). Nota: el formulario general de
// editar material (editarMaterial más abajo) todavía deja tocar
// precio_venta campo por campo -- ese hueco es previo a este cambio y
// queda sin cerrar por ahora (edición general de materiales sí sigue
// siendo trabajo de gerente, no quiero bloquear todo el formulario).
export async function actualizarPreciosVenta(
  updates: { id: string; precio_venta: number }[]
): Promise<ActionResult> {
  const yo = await getCurrentProfile();
  if (!esAdmin(yo)) return { ok: false, error: "No autorizado" };
  if (updates.length === 0) return { ok: false, error: "Nada que guardar" };
  const invalido = updates.find(
    (u) => !u.id || !Number.isFinite(u.precio_venta) || u.precio_venta < 0
  );
  if (invalido)
    return { ok: false, error: "El precio de venta no puede ser negativo" };

  if (DEMO) {
    try {
      for (const u of updates)
        store.actualizarMaterial(u.id, { precio_venta: u.precio_venta });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    for (const u of updates) {
      const { error } = await supabase
        .from("materiales")
        .update({ precio_venta: u.precio_venta })
        .eq("id", u.id);
      if (error) return { ok: false, error: mensajeSupabase(error) };
    }
  }

  revalidatePath("/administracion");
  revalidatePath("/inventario");
  revalidatePath("/analisis");
  return { ok: true };
}

export async function actualizarStocksMinimos(
  updates: { id: string; stock_minimo: number }[]
): Promise<ActionResult> {
  if (updates.length === 0) return { ok: false, error: "Nada que guardar" };
  const invalido = updates.find(
    (u) => !u.id || !Number.isFinite(u.stock_minimo) || u.stock_minimo < 0
  );
  if (invalido)
    return { ok: false, error: "El stock mínimo no puede ser negativo" };

  if (DEMO) {
    try {
      for (const u of updates)
        store.actualizarMaterial(u.id, { stock_minimo: u.stock_minimo });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    for (const u of updates) {
      const { error } = await supabase
        .from("materiales")
        .update({ stock_minimo: u.stock_minimo })
        .eq("id", u.id);
      if (error) return { ok: false, error: mensajeSupabase(error) };
    }
  }

  revalidatePath("/inventario");
  revalidatePath("/analisis");
  return { ok: true };
}

export async function eliminarMaterial(id: string): Promise<ActionResult> {
  if (DEMO) {
    try {
      store.eliminarMaterial(id);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
    revalidatePath("/inventario");
    return { ok: true };
  }
  const supabase = await createClient();
  // Baja lógica: se desactiva, no se borra. Así el material y su historial
  // de movimientos se conservan (el inventario lo filtra por `activo`).
  const { error } = await supabase
    .from("materiales")
    .update({ activo: false })
    .eq("id", id);
  if (error) return { ok: false, error: mensajeSupabase(error) };

  revalidatePath("/inventario");
  return { ok: true };
}
