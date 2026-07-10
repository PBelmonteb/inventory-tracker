// Esqueleto de carga compartido por todos los portales.
// Aparece al instante al navegar (Next.js lo muestra mientras el componente
// servidor resuelve sus consultas), eliminando la sensación de pantalla colgada.
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse p-4 md:p-8">
      {/* Encabezado */}
      <div className="mb-6 space-y-2">
        <div className="h-7 w-64 rounded-lg bg-surface-2" />
        <div className="h-4 w-80 rounded bg-surface-2/70" />
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-surface-2" />
        ))}
      </div>

      {/* Filtros */}
      <div className="mb-4 h-12 rounded-xl bg-surface-2/70" />

      {/* Filas */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-surface-2/60" />
        ))}
      </div>
    </div>
  );
}
