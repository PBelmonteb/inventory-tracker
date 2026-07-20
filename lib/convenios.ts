// Un convenio está "vigente" si sigue activo y, si tiene fecha de
// vencimiento, esa fecha todavía no pasó. Vive aparte (no en lib/types.ts)
// porque tanto el camino Supabase (filtro en la query) como el DEMO
// (filtro en memoria) necesitan la misma regla exacta — igual que
// calcularStockSugerido se comparte entre ambos.

export function esConvenioVigente(
  convenio: { activo: boolean; vigencia_hasta: string | null },
  ahora: Date = new Date()
): boolean {
  if (!convenio.activo) return false;
  if (!convenio.vigencia_hasta) return true;
  // Comparación por día calendario: un convenio que vence "hoy" sigue
  // vigente hoy (deja de estarlo mañana), sin importar la hora exacta.
  const hoy = ahora.toISOString().slice(0, 10);
  return convenio.vigencia_hasta >= hoy;
}
