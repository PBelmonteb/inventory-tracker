"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { getCurrentProfile, puedeGestionarVentas } from "@/lib/auth";
import type { ConvenioCliente } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Gestionar convenios con clientes es tarea de gestor o ventas.
async function requireGestorOVentas() {
  const profile = await getCurrentProfile();
  if (!profile || !puedeGestionarVentas(profile)) throw new Error("No autorizado");
}

interface DatosConvenioCliente {
  cliente_id: string;
  material_id: string;
  precio_pactado: number;
  cantidad_minima: number | null;
  condiciones_pago: string | null;
  vigencia_hasta: string | null;
  notas: string | null;
}

function parsearFormData(formData: FormData): DatosConvenioCliente | { error: string } {
  const cliente_id = String(formData.get("cliente_id") ?? "");
  const material_id = String(formData.get("material_id") ?? "");
  if (!cliente_id) return { error: "Selecciona un cliente" };
  if (!material_id) return { error: "Selecciona un material" };

  const precio_pactado = Number(formData.get("precio_pactado") ?? 0);
  if (!Number.isFinite(precio_pactado) || precio_pactado <= 0)
    return { error: "El precio pactado debe ser mayor a cero" };

  const cantidadRaw = String(formData.get("cantidad_minima") ?? "").trim();
  const cantidad_minima = cantidadRaw ? Number(cantidadRaw) : null;
  if (cantidad_minima !== null && (!Number.isFinite(cantidad_minima) || cantidad_minima <= 0))
    return { error: "La cantidad mínima debe ser mayor a cero" };

  const condiciones_pago = String(formData.get("condiciones_pago") ?? "").trim() || null;
  const vigencia_hasta = String(formData.get("vigencia_hasta") ?? "").trim() || null;
  const notas = String(formData.get("notas") ?? "").trim() || null;

  return { cliente_id, material_id, precio_pactado, cantidad_minima, condiciones_pago, vigencia_hasta, notas };
}

export async function crearConvenioCliente(formData: FormData): Promise<ActionResult> {
  try {
    await requireGestorOVentas();
  } catch {
    return { ok: false, error: "No autorizado" };
  }

  const datos = parsearFormData(formData);
  if ("error" in datos) return { ok: false, error: datos.error };

  if (DEMO) {
    try {
      store.crearConvenioCliente(datos);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase.from("convenios_cliente").insert(datos);
    if (error) return { ok: false, error: mensajeSupabase(error) };

    const { data: material } = await supabase
      .from("materiales")
      .select("nombre, sku")
      .eq("id", datos.material_id)
      .single();
    await supabase.from("historial_precios").insert({
      material_id: datos.material_id,
      material_nombre: material?.nombre ?? null,
      material_sku: material?.sku ?? null,
      tipo: "venta",
      valor: datos.precio_pactado,
      fuente: "convenio",
      cantidad: datos.cantidad_minima,
    });
  }

  revalidatePath("/clientes");
  revalidatePath(`/materiales/${datos.material_id}`);
  return { ok: true };
}

export async function actualizarConvenioCliente(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    await requireGestorOVentas();
  } catch {
    return { ok: false, error: "No autorizado" };
  }
  if (!id) return { ok: false, error: "Convenio inválido" };

  const datos = parsearFormData(formData);
  if ("error" in datos) return { ok: false, error: datos.error };

  if (DEMO) {
    try {
      store.actualizarConvenioCliente(id, datos);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data: actual } = await supabase
      .from("convenios_cliente")
      .select("precio_pactado")
      .eq("id", id)
      .single();

    const { error } = await supabase
      .from("convenios_cliente")
      .update({ ...datos, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: mensajeSupabase(error) };

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
        tipo: "venta",
        valor: datos.precio_pactado,
        fuente: "convenio",
        cantidad: datos.cantidad_minima,
      });
    }
  }

  revalidatePath("/clientes");
  revalidatePath(`/materiales/${datos.material_id}`);
  return { ok: true };
}

// Baja lógica — nunca se borra, para no perder el histórico de qué se
// pactó (mismo criterio que desactivarConvenio del lado de compras).
export async function desactivarConvenioCliente(id: string): Promise<ActionResult> {
  try {
    await requireGestorOVentas();
  } catch {
    return { ok: false, error: "No autorizado" };
  }
  if (!id) return { ok: false, error: "Convenio inválido" };

  if (DEMO) {
    try {
      store.desactivarConvenioCliente(id);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("convenios_cliente")
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/clientes");
  return { ok: true };
}

// Lectura sin gate de rol — la usa components/caso-venta-form.tsx (cualquiera
// que llegue a /clientes puede verla, solo gestor/ventas puede crear/editar).
export async function obtenerConvenioClienteVigente(
  materialId: string,
  clienteId: string
): Promise<ConvenioCliente | null> {
  if (!materialId || !clienteId) return null;

  if (DEMO) {
    return store.obtenerConvenioClienteVigente(materialId, clienteId);
  }

  const supabase = await createClient();
  const hoy = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("convenios_cliente")
    .select("*")
    .eq("material_id", materialId)
    .eq("cliente_id", clienteId)
    .eq("activo", true)
    .or(`vigencia_hasta.is.null,vigencia_hasta.gte.${hoy}`)
    .maybeSingle();

  return (data as ConvenioCliente) ?? null;
}
