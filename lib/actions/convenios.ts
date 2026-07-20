"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import type { Convenio } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function requireGestor() {
  const profile = await getCurrentProfile();
  if (!profile || !esGestor(profile)) throw new Error("No autorizado");
}

interface DatosConvenio {
  proveedor_id: string;
  material_id: string;
  precio_pactado: number;
  cantidad_minima: number | null;
  dias_entrega_pactado: number | null;
  condiciones_pago: string | null;
  vigencia_hasta: string | null;
  notas: string | null;
}

function parsearFormData(formData: FormData): DatosConvenio | { error: string } {
  const proveedor_id = String(formData.get("proveedor_id") ?? "");
  const material_id = String(formData.get("material_id") ?? "");
  if (!proveedor_id) return { error: "Selecciona un proveedor" };
  if (!material_id) return { error: "Selecciona un material" };

  const precio_pactado = Number(formData.get("precio_pactado") ?? 0);
  if (!Number.isFinite(precio_pactado) || precio_pactado <= 0)
    return { error: "El precio pactado debe ser mayor a cero" };

  const cantidadRaw = String(formData.get("cantidad_minima") ?? "").trim();
  const cantidad_minima = cantidadRaw ? Number(cantidadRaw) : null;
  if (cantidad_minima !== null && (!Number.isFinite(cantidad_minima) || cantidad_minima <= 0))
    return { error: "La cantidad mínima debe ser mayor a cero" };

  const diasRaw = String(formData.get("dias_entrega_pactado") ?? "").trim();
  const dias_entrega_pactado = diasRaw ? Number(diasRaw) : null;
  if (
    dias_entrega_pactado !== null &&
    (!Number.isFinite(dias_entrega_pactado) || dias_entrega_pactado <= 0)
  )
    return { error: "Los días de entrega deben ser mayor a cero" };

  const condiciones_pago = String(formData.get("condiciones_pago") ?? "").trim() || null;
  const vigencia_hasta = String(formData.get("vigencia_hasta") ?? "").trim() || null;
  const notas = String(formData.get("notas") ?? "").trim() || null;

  return {
    proveedor_id,
    material_id,
    precio_pactado,
    cantidad_minima,
    dias_entrega_pactado,
    condiciones_pago,
    vigencia_hasta,
    notas,
  };
}

export async function crearConvenio(formData: FormData): Promise<ActionResult> {
  try {
    await requireGestor();
  } catch {
    return { ok: false, error: "No autorizado" };
  }

  const datos = parsearFormData(formData);
  if ("error" in datos) return { ok: false, error: datos.error };

  if (DEMO) {
    try {
      store.crearConvenio(datos);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from("convenios_proveedor").insert(datos);
    if (error) return { ok: false, error: mensajeSupabase(error) };

    // Bitácora de precio (fuente='convenio') — mismo mecanismo que ya usa
    // el resto de la app para precio_venta manual (lib/mock/store.ts).
    const { data: material } = await supabase
      .from("materiales")
      .select("nombre, sku")
      .eq("id", datos.material_id)
      .single();
    await supabase.from("historial_precios").insert({
      material_id: datos.material_id,
      material_nombre: material?.nombre ?? null,
      material_sku: material?.sku ?? null,
      tipo: "costo",
      valor: datos.precio_pactado,
      fuente: "convenio",
      proveedor_id: datos.proveedor_id,
      cantidad: datos.cantidad_minima,
    });
  }

  revalidatePath("/convenios");
  revalidatePath(`/materiales/${datos.material_id}`);
  return { ok: true };
}

export async function actualizarConvenio(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireGestor();
  } catch {
    return { ok: false, error: "No autorizado" };
  }
  if (!id) return { ok: false, error: "Convenio inválido" };

  const datos = parsearFormData(formData);
  if ("error" in datos) return { ok: false, error: datos.error };

  if (DEMO) {
    try {
      store.actualizarConvenio(id, datos);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data: actual } = await supabase
      .from("convenios_proveedor")
      .select("precio_pactado")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from("convenios_proveedor")
      .update({ ...datos, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: mensajeSupabase(error) };

    // Solo se registra un nuevo punto en la bitácora si el precio cambió de
    // verdad (editar solo las condiciones de pago no debería ensuciar la
    // gráfica de historial de costo con un punto repetido).
    if (actual && Number(actual.precio_pactado) !== datos.precio_pactado) {
      const { data: material } = await supabase
        .from("materiales")
        .select("nombre, sku")
        .eq("id", datos.material_id)
        .single();
      await supabase.from("historial_precios").insert({
        material_id: datos.material_id,
        material_nombre: material?.nombre ?? null,
        material_sku: material?.sku ?? null,
        tipo: "costo",
        valor: datos.precio_pactado,
        fuente: "convenio",
        proveedor_id: datos.proveedor_id,
        cantidad: datos.cantidad_minima,
      });
    }
  }

  revalidatePath("/convenios");
  revalidatePath(`/materiales/${datos.material_id}`);
  return { ok: true };
}

// Baja lógica — nunca se borra, para no perder el histórico de qué se pactó
// (mismo criterio que eliminarMaterial: activo=false, no delete).
export async function desactivarConvenio(id: string): Promise<ActionResult> {
  try {
    await requireGestor();
  } catch {
    return { ok: false, error: "No autorizado" };
  }
  if (!id) return { ok: false, error: "Convenio inválido" };

  if (DEMO) {
    try {
      store.desactivarConvenio(id);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("convenios_proveedor")
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/convenios");
  return { ok: true };
}

// Lectura sin gate de rol: la usan los formularios de "Nuevo caso" y
// "Solicitar cotización" (cualquier operario puede verla, solo gestor puede
// crear/editar convenios).
export async function obtenerConvenioVigente(
  materialId: string,
  proveedorId: string
): Promise<Convenio | null> {
  if (!materialId || !proveedorId) return null;

  if (DEMO) {
    return store.obtenerConvenioVigente(materialId, proveedorId);
  }

  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("convenios_proveedor")
    .select("*")
    .eq("material_id", materialId)
    .eq("proveedor_id", proveedorId)
    .eq("activo", true)
    .or(`vigencia_hasta.is.null,vigencia_hasta.gte.${hoy}`)
    .maybeSingle();

  return (data as Convenio) ?? null;
}
