// Lógica compartida para resolver una solicitud de compra (elegir una
// cotización ganadora entre varios proveedores): la ganadora se marca, las
// demás cotizaciones abiertas de la misma solicitud se cancelan solas. La
// llaman tanto elegirGanadora (lib/actions/solicitudes.ts) como
// recibirCasoCompra (lib/actions/compras.ts) — recibir físicamente de un
// proveedor también confirma que ese fue el elegido.
//
// No lleva "use server": es un helper de servidor (como lib/casos-
// automaticos.ts), no un Server Action en sí — su parámetro SupabaseClient
// no es serializable.

import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarEventoCaso } from "@/lib/eventos-caso";
import type { UsuarioActor } from "@/lib/types";

const CASO_COMPRA_ABIERTO = ["pendiente", "cotizando", "ordenado"];

export async function resolverSolicitud(
  supabase: SupabaseClient,
  solicitudId: string,
  casoGanadorId: string,
  actor: UsuarioActor = { id: null, nombre: null }
): Promise<void> {
  const { data: solicitud } = await supabase
    .from("solicitudes_compra")
    .select("estado")
    .eq("id", solicitudId)
    .single();
  // Ya resuelta/cancelada, o no existe: no hay nada que hacer (silencioso —
  // recibirCasoCompra llama esto siempre que hay solicitud_id, no solo
  // cuando de verdad hace falta resolverla).
  if (!solicitud || solicitud.estado !== "abierta") return;

  await supabase
    .from("solicitudes_compra")
    .update({
      estado: "resuelta",
      cotizacion_ganadora_id: casoGanadorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", solicitudId);
  await registrarEventoCaso(
    supabase,
    casoGanadorId,
    "estado_cambiado",
    "Elegida como cotización ganadora.",
    actor
  );

  const { data: hermanas } = await supabase
    .from("casos_compra")
    .select("id")
    .eq("solicitud_id", solicitudId)
    .neq("id", casoGanadorId)
    .in("estado", CASO_COMPRA_ABIERTO);

  for (const h of hermanas ?? []) {
    await supabase
      .from("casos_compra")
      .update({ estado: "cancelado", updated_at: new Date().toISOString() })
      .eq("id", h.id);
    await registrarEventoCaso(
      supabase,
      h.id,
      "estado_cambiado",
      "Cancelado automáticamente: se eligió otra cotización de la misma solicitud.",
      actor
    );
  }
}
