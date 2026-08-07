// Mirror de lib/convenios.ts para convenios con clientes — misma regla de
// vigencia (activo + fecha de vencimiento no pasada), compartida entre el
// camino Supabase y el DEMO.

export function esConvenioClienteVigente(
  convenio: { activo: boolean; vigencia_hasta: string | null },
  ahora: Date = new Date()
): boolean {
  if (!convenio.activo) return false;
  if (!convenio.vigencia_hasta) return true;
  const hoy = ahora.toISOString().slice(0, 10);
  return convenio.vigencia_hasta >= hoy;
}
