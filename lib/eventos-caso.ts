// Timeline de un caso de compra (estilo Salesforce): un solo punto de
// inserción reusado desde todas las acciones que tocan un caso
// (lib/actions/compras.ts, lib/actions/solicitudes.ts,
// lib/casos-automaticos.ts, el webhook de correo entrante) — para que
// "qué ha pasado" nunca se quede corto por un flujo que se olvidó de
// loguear su evento. No lleva "use server": es un helper de servidor
// como lib/casos-automaticos.ts, no un Server Action en sí.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TipoEventoCaso, UsuarioActor } from "@/lib/types";

export async function registrarEventoCaso(
  supabase: SupabaseClient,
  casoId: string,
  tipo: TipoEventoCaso,
  detalle: string | null = null,
  usuario: UsuarioActor = { id: null, nombre: null }
): Promise<void> {
  await supabase.from("casos_compra_eventos").insert({
    caso_compra_id: casoId,
    tipo,
    detalle,
    usuario_id: usuario.id,
    usuario_nombre: usuario.nombre,
  });
}
