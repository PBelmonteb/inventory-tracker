import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { DEMO } from "@/lib/config";
import { PERFIL_DEMO } from "@/lib/mock/seed-data";
import type { Profile } from "@/lib/types";

/**
 * Devuelve el perfil del usuario autenticado, o null.
 * Envuelto en `cache()`: el layout y la página comparten el resultado en un
 * mismo request (evita validar el token y consultar el perfil dos veces).
 * Se mantiene `auth.getUser()` (valida el token contra Supabase) en lugar de
 * `getSession()` por seguridad — solo se deduplica, no se relaja.
 */
export const getCurrentProfile = cache(
  async (): Promise<Profile | null> => {
    if (DEMO) return PERFIL_DEMO;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    return (data as Profile) ?? null;
  }
);

/** True si el perfil puede editar catálogos/materiales. */
export function esGestor(profile: Profile | null): boolean {
  return profile?.rol === "admin" || profile?.rol === "gerente";
}
