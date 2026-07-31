"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { getCurrentProfile } from "@/lib/auth";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function guardarVista(
  pagina: string,
  nombre: string,
  query: string
): Promise<ActionResult> {
  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) return { ok: false, error: "Ponle un nombre a la vista" };
  if (!query) return { ok: false, error: "No hay filtros que guardar" };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "No autorizado" };

  if (DEMO) {
    try {
      store.crearVistaGuardada(profile.id, pagina, nombreLimpio, query);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
    revalidatePath(`/${pagina}`);
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vistas_guardadas")
    .insert({ usuario_id: profile.id, pagina, nombre: nombreLimpio, query });
  if (error) {
    // Nombre repetido choca con el unique(usuario_id, pagina, nombre).
    if (error.code === "23505")
      return { ok: false, error: "Ya tienes una vista guardada con ese nombre" };
    return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath(`/${pagina}`);
  return { ok: true };
}

export async function eliminarVista(id: string, pagina: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "No autorizado" };

  if (DEMO) {
    store.eliminarVistaGuardada(profile.id, id);
    revalidatePath(`/${pagina}`);
    return { ok: true };
  }

  // Sin .eq("usuario_id", ...) explícito: el RLS de vistas_guardadas ya
  // solo deja borrar filas propias (mismo patrón que el resto de la app).
  const supabase = await createClient();
  const { error } = await supabase.from("vistas_guardadas").delete().eq("id", id);
  if (error) return { ok: false, error: mensajeSupabase(error) };

  revalidatePath(`/${pagina}`);
  return { ok: true };
}
