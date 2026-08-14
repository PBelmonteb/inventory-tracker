"use client";

// Esqueleto de "AI Insights" — briefing gerencial generado por IA sobre
// los mismos datos que ya calcula Análisis. Sin ANTHROPIC_API_KEY en el
// servidor, el botón queda visible pero avisa que falta configurar (mismo
// criterio de "degradarse con gracia" que ya usan Push/Resend/Sentry en
// esta app) — ver lib/actions/ai-insights.ts.

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { generarInsightsIA } from "@/lib/actions/ai-insights";
import { formatDate } from "@/lib/utils";
import { Sparkles, TriangleAlert } from "lucide-react";

export function AiInsightsView({ configurado }: { configurado: boolean }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ briefing: string; generadoAt: string } | null>(
    null
  );

  async function generar() {
    setCargando(true);
    setError(null);
    const res = await generarInsightsIA();
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResultado({ briefing: res.briefing, generadoAt: res.generadoAt });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-fg">AI Insights</h2>
            <p className="mt-1 text-sm text-muted">
              Un briefing en lenguaje llano de lo que está pasando en tu
              inventario, compras, ventas y producción — con sugerencias de
              optimización, generado leyendo los mismos datos que el resto
              de Análisis.
            </p>
          </div>
        </div>

        {!configurado && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Todavía no está activo — falta agregar{" "}
              <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs dark:bg-white/10">
                ANTHROPIC_API_KEY
              </code>{" "}
              a las variables de entorno del servidor. El resto ya está
              listo: en cuanto se agregue esa variable, este botón funciona
              sin más cambios.
            </p>
          </div>
        )}

        <div className="mt-4">
          <Button onClick={generar} disabled={cargando}>
            <Sparkles className="h-4 w-4" />
            {cargando ? "Generando..." : "Generar briefing"}
          </Button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </Card>

      {resultado && (
        <Card className="p-5">
          <p className="mb-3 text-xs text-faint">
            Generado {formatDate(resultado.generadoAt)}
          </p>
          {/* Texto plano a propósito: sin dependencia nueva de markdown
              para un botón que hoy no corre (sin API key). El modelo
              devuelve encabezados "## " simples, legibles igual como
              texto. */}
          <div className="whitespace-pre-wrap text-sm text-fg">
            {resultado.briefing}
          </div>
        </Card>
      )}
    </div>
  );
}
