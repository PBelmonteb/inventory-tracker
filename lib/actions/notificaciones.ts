"use server";

import { getNotificaciones } from "@/lib/data";
import type { NotificacionConRelaciones } from "@/lib/types";

/**
 * Lectura de notificaciones para la campana global (cliente).
 * Reutiliza el mismo fetcher que el Portal de Proveedores → fuente única.
 * En Supabase dispara la sincronización (`sincronizar_notificaciones`).
 */
export async function obtenerNotificaciones(): Promise<
  NotificacionConRelaciones[]
> {
  return getNotificaciones();
}
