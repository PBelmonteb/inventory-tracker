// Bloqueo de calidad — validación pura de "resolver una inspección"
// (liberar y/o rechazar). La misma regla vive espejada en la RPC
// resolver_inspeccion_calidad (supabase/migrations/0033_bloqueo_calidad.sql)
// y en lib/mock/store.ts para DEMO; este módulo es la única versión con
// test, así que si la regla cambia, cambia aquí primero.

export interface ResolucionInspeccion {
  cantidadRecibida: number;
  cantidadLiberada: number;
  cantidadRechazada: number;
  motivoRechazo: string | null;
}

const TOLERANCIA = 0.001;

export function validarResolucionInspeccion(
  r: ResolucionInspeccion
): { ok: true } | { ok: false; error: string } {
  if (
    !Number.isFinite(r.cantidadLiberada) ||
    !Number.isFinite(r.cantidadRechazada) ||
    r.cantidadLiberada < 0 ||
    r.cantidadRechazada < 0
  ) {
    return { ok: false, error: "Las cantidades no pueden ser negativas" };
  }
  if (Math.abs(r.cantidadLiberada + r.cantidadRechazada - r.cantidadRecibida) > TOLERANCIA) {
    return {
      ok: false,
      error: `Liberado + rechazado debe sumar lo recibido (${r.cantidadRecibida})`,
    };
  }
  if (r.cantidadRechazada > 0 && !r.motivoRechazo?.trim()) {
    return { ok: false, error: "Captura el motivo del rechazo" };
  }
  return { ok: true };
}
