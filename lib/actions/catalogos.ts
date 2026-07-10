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

  if (DEMO) {
    try {
      store.crearCatalogo(tabla, nombre, contacto);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const payload: Record<string, string> = { nombre };
    if (tabla === "proveedores" || tabla === "clientes")
      payload.contacto = contacto;
    const { error } = await supabase.from(tabla).insert(payload);
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/catalogos");
  revalidatePath("/inventario");
  revalidatePath("/clientes");
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
