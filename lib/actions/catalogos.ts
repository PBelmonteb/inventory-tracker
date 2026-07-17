"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";

type Tabla = "categorias" | "ubicaciones" | "proveedores" | "clientes";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function crearCatalogo(
  tabla: Tabla,
  formData: FormData
): Promise<ActionResult> {
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };
  const contacto = String(formData.get("contacto") ?? "").trim();

  let diasEntregaDeclarado: number | null = null;
  if (tabla === "proveedores") {
    const raw = String(formData.get("dias_entrega_declarado") ?? "").trim();
    if (raw) {
      diasEntregaDeclarado = Number(raw);
      if (!Number.isFinite(diasEntregaDeclarado) || diasEntregaDeclarado <= 0)
        return { ok: false, error: "Los días de entrega deben ser un número mayor a cero" };
    }
  }

  if (DEMO) {
    try {
      store.crearCatalogo(tabla, nombre, contacto, diasEntregaDeclarado);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const payload: Record<string, string | number> = { nombre };
    if (tabla === "proveedores" || tabla === "clientes")
      payload.contacto = contacto;
    if (tabla === "proveedores" && diasEntregaDeclarado !== null)
      payload.dias_entrega_declarado = diasEntregaDeclarado;
    const { error } = await supabase.from(tabla).insert(payload);
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/catalogos");
  revalidatePath("/inventario");
  revalidatePath("/clientes");
  return { ok: true };
}

// Edita contacto/tiempo de entrega de un proveedor existente. Es la única
// entidad de catálogo con edición hoy: categorías/ubicaciones/clientes solo
// tienen alta/baja (no tienen campos adicionales que valga la pena editar).
export async function actualizarProveedor(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const contacto = String(formData.get("contacto") ?? "").trim() || null;
  const raw = String(formData.get("dias_entrega_declarado") ?? "").trim();
  let diasEntregaDeclarado: number | null = null;
  if (raw) {
    diasEntregaDeclarado = Number(raw);
    if (!Number.isFinite(diasEntregaDeclarado) || diasEntregaDeclarado <= 0)
      return { ok: false, error: "Los días de entrega deben ser un número mayor a cero" };
  }

  if (DEMO) {
    try {
      store.actualizarProveedor(id, {
        contacto,
        dias_entrega_declarado: diasEntregaDeclarado,
      });
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("proveedores")
      .update({ contacto, dias_entrega_declarado: diasEntregaDeclarado })
      .eq("id", id);
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/catalogos");
  revalidatePath("/proveedores");
  return { ok: true };
}

export async function eliminarCatalogo(
  tabla: Tabla,
  id: string
): Promise<ActionResult> {
  if (DEMO) {
    store.eliminarCatalogo(tabla, id);
    revalidatePath("/catalogos");
    revalidatePath("/inventario");
    revalidatePath("/clientes");
    return { ok: true };
  }
  const supabase = await createClient();
  const { error } = await supabase.from(tabla).delete().eq("id", id);
  if (error) return { ok: false, error: mensajeSupabase(error) };

  revalidatePath("/catalogos");
  revalidatePath("/inventario");
  revalidatePath("/clientes");
  return { ok: true };
}
