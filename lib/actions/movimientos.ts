"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { getStockPorUbicacion } from "@/lib/data";
import type { StockPorUbicacion, TipoMovimiento } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Wrapper "use server" para que formularios cliente (movimiento, traslado)
// puedan consultar el desglose por ubicación al vuelo, sin exponer Supabase.
export async function obtenerStockPorUbicacion(
  materialId: string
): Promise<StockPorUbicacion[]> {
  if (!materialId) return [];
  return getStockPorUbicacion(materialId);
}

export async function registrarMovimiento(
  formData: FormData
): Promise<ActionResult> {
  const material_id = String(formData.get("material_id") ?? "");
  const tipo = String(formData.get("tipo") ?? "") as TipoMovimiento;
  const cantidad = Number(formData.get("cantidad") ?? 0);
  const nota = String(formData.get("nota") ?? "").trim() || null;
  const referencia = String(formData.get("referencia") ?? "").trim() || null;
  // Ubicación donde ocurre (opcional; sin ella, la app usa la de por defecto
  // del material vía el trigger/lógica de aplicarMovimiento).
  const ubicacion_id = String(formData.get("ubicacion_id") ?? "").trim() || null;
  // Costo de compra de esta entrada (opcional): alimenta el WAC.
  const costoRaw = formData.get("costo_unitario");
  const costo =
    tipo === "entrada" && costoRaw != null && String(costoRaw).trim() !== ""
      ? Number(costoRaw)
      : null;

  if (!material_id) return { ok: false, error: "Selecciona un material" };
  if (!["entrada", "salida", "ajuste"].includes(tipo))
    return { ok: false, error: "Tipo de movimiento inválido" };
  if (!Number.isFinite(cantidad))
    return { ok: false, error: "Cantidad inválida" };
  if (tipo !== "ajuste" && cantidad <= 0)
    return { ok: false, error: "La cantidad debe ser mayor a cero" };
  if (cantidad < 0)
    return { ok: false, error: "La cantidad no puede ser negativa" };
  // Un ajuste modifica el stock a mano: exige un motivo para dejar rastro.
  if (tipo === "ajuste" && !nota)
    return {
      ok: false,
      error: "El ajuste requiere un motivo (queda registrado para auditoría).",
    };

  if (costo != null && (!Number.isFinite(costo) || costo < 0))
    return { ok: false, error: "Costo unitario inválido" };

  if (DEMO) {
    try {
      store.aplicarMovimiento(material_id, tipo, cantidad, {
        nota,
        referencia,
        costo,
        ubicacion_id,
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("movimientos").insert({
      material_id,
      tipo,
      cantidad,
      usuario_id: user?.id ?? null,
      nota,
      referencia,
      costo_unitario: costo,
      ubicacion_id,
    });
    // Los triggers de la BD validan stock insuficiente y aplican el cambio.
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/inventario");
  revalidatePath("/movimientos");
  revalidatePath(`/materiales/${material_id}`);
  revalidatePath("/reportes");
  return { ok: true };
}

// Traslada stock entre ubicaciones: genera una salida en el origen y una
// entrada en el destino, ligadas por una misma referencia. Transaccional
// (Supabase: RPC; DEMO: store.transferirStock).
export async function transferirStock(
  formData: FormData
): Promise<ActionResult> {
  const material_id = String(formData.get("material_id") ?? "");
  const origen_id = String(formData.get("origen_id") ?? "");
  const destino_id = String(formData.get("destino_id") ?? "");
  const cantidad = Number(formData.get("cantidad") ?? 0);
  const nota = String(formData.get("nota") ?? "").trim() || null;

  if (!material_id || !origen_id || !destino_id)
    return { ok: false, error: "Selecciona material, origen y destino" };
  if (origen_id === destino_id)
    return { ok: false, error: "El origen y destino deben ser distintos" };
  if (!Number.isFinite(cantidad) || cantidad <= 0)
    return { ok: false, error: "La cantidad debe ser mayor a cero" };

  if (DEMO) {
    try {
      store.transferirStock(material_id, origen_id, destino_id, cantidad, nota);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase.rpc("transferir_stock", {
      p_material: material_id,
      p_origen: origen_id,
      p_destino: destino_id,
      p_cantidad: cantidad,
      p_nota: nota,
    });
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/inventario");
  revalidatePath("/movimientos");
  revalidatePath(`/materiales/${material_id}`);
  return { ok: true };
}
