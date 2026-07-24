// Lógica compartida para resolver una solicitud de compra (elegir una
// cotización ganadora entre varios proveedores): la ganadora se marca, las
// demás cotizaciones abiertas de la misma solicitud se cancelan solas. La
// llaman tanto elegirGanadora (lib/actions/solicitudes.ts) como
// recibirCasoCompra (lib/actions/compras.ts) — recibir físicamente de un
// proveedor también confirma que ese fue el elegido.
//
// Todo el trabajo pasa en un solo RPC (resolver_solicitud_compra, migración
// 0021) con un "for update" sobre la solicitud — antes esto se hacía leyendo
// y escribiendo por separado vía PostgREST (que no soporta "select for
// update"), y dos personas eligiendo DOS cotizaciones distintas de la misma
// solicitud casi al mismo tiempo podían ambas pasar el chequeo "sigue
// abierta" y ambas proceder, dejando un caso con eventos contradictorios
// ("elegida ganadora" y "cancelada automáticamente" a la vez).
//
// No lleva "use server": es un helper de servidor (como lib/casos-
// automaticos.ts), no un Server Action en sí — su parámetro SupabaseClient
// no es serializable.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActor } from "@/lib/types";

export async function resolverSolicitud(
  supabase: SupabaseClient,
  solicitudId: string,
  casoGanadorId: string,
  actor: UsuarioActor = { id: null, nombre: null }
): Promise<void> {
  await supabase.rpc("resolver_solicitud_compra", {
    p_solicitud: solicitudId,
    p_caso_ganador: casoGanadorId,
    p_usuario_id: actor.id,
    p_usuario_nombre: actor.nombre,
  });
}
