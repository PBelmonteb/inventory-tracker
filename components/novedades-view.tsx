import { Card, Badge } from "@/components/ui";
import { NOVEDADES, type TipoNovedad } from "@/lib/novedades";

const TIPO_LABEL: Record<TipoNovedad, string> = {
  nuevo: "Nuevo",
  mejora: "Mejora",
  correccion: "Corrección",
};

const TIPO_TONE: Record<TipoNovedad, "accent" | "ok" | "neutral"> = {
  nuevo: "accent",
  mejora: "ok",
  correccion: "neutral",
};

export function NovedadesView() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* Sin h1 propio: vive como tab dentro de Ayuda. */}
      <Card className="mb-8 p-4 text-sm text-muted">
        Esta página se va actualizando conforme se agregan nuevas funciones o
        se corrigen cosas — no es una lista cerrada.
      </Card>

      <div className="space-y-8">
        {NOVEDADES.map((grupo) => (
          <section key={grupo.mes}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
              {grupo.mes}
            </h2>
            <Card className="divide-y divide-line overflow-hidden">
              {grupo.items.map((item) => (
                <div key={item.titulo} className="flex items-start gap-3 p-4">
                  <Badge tone={TIPO_TONE[item.tipo]} className="mt-0.5 shrink-0">
                    {TIPO_LABEL[item.tipo]}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">
                      {item.titulo}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      {item.descripcion}
                    </p>
                  </div>
                </div>
              ))}
            </Card>
          </section>
        ))}
      </div>
    </div>
  );
}
