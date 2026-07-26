"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";
import { recibirTraslado, cancelarTraslado } from "@/lib/actions/movimientos";
import { formatDate, formatQty } from "@/lib/utils";
import type { Traslado } from "@/lib/types";
import { Truck, PackageCheck, Ban } from "lucide-react";

const ESTADO_META: Record<
  Traslado["estado"],
  { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "accent" }
> = {
  en_transito: { label: "En tránsito", tone: "warn" },
  recibido: { label: "Recibido", tone: "ok" },
  cancelado: { label: "Cancelado", tone: "neutral" },
};

type Filtro = "en_transito" | "todos";

export function TrasladosView({ traslados }: { traslados: Traslado[] }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("en_transito");
  const [procesando, setProcesando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtrados = useMemo(
    () => (filtro === "todos" ? traslados : traslados.filter((t) => t.estado === "en_transito")),
    [traslados, filtro]
  );
  const enTransito = traslados.filter((t) => t.estado === "en_transito").length;

  async function accion(fn: (id: string) => Promise<{ ok: boolean; error?: string }>, id: string) {
    setError(null);
    setProcesando(id);
    const res = await fn(id);
    setProcesando(null);
    if (!res.ok) {
      setError(res.error ?? "Error");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="mb-6 flex items-center gap-2">
        <Truck className="h-6 w-6 text-accent" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
            Stock en tránsito
          </h1>
          <p className="mt-1 text-sm text-muted">
            Traslados entre ubicaciones que tardan en llegar — el material no
            cuenta en origen ni en destino mientras está en camino.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant={filtro === "en_transito" ? "primary" : "secondary"}
          className="px-3 py-1.5 text-xs"
          onClick={() => setFiltro("en_transito")}
        >
          En tránsito {enTransito > 0 && `(${enTransito})`}
        </Button>
        <Button
          variant={filtro === "todos" ? "primary" : "secondary"}
          className="px-3 py-1.5 text-xs"
          onClick={() => setFiltro("todos")}
        >
          Todos
        </Button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {filtrados.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          {filtro === "en_transito"
            ? "No hay nada en tránsito ahorita. Se inicia uno desde el detalle de un material, marcando \"Este traslado tarda en llegar\"."
            : "Todavía no hay traslados en tránsito registrados."}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {filtrados.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    {t.material_nombre}
                    {t.material_sku && (
                      <span className="ml-2 text-xs text-faint">{t.material_sku}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-faint">
                    {t.codigo} · {formatQty(t.cantidad, t.unidad)} ·{" "}
                    {t.origen_nombre ?? "origen eliminado"} →{" "}
                    {t.destino_nombre ?? "destino eliminado"}
                  </p>
                  <p className="mt-0.5 text-xs text-faint">
                    {t.estado === "recibido" && t.recibido_at
                      ? `Recibido ${formatDate(t.recibido_at)} por ${t.recibido_por_nombre ?? "—"}`
                      : `Iniciado ${formatDate(t.created_at)}${t.creado_por_nombre ? ` por ${t.creado_por_nombre}` : ""}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={ESTADO_META[t.estado].tone}>{ESTADO_META[t.estado].label}</Badge>
                  {t.estado === "en_transito" && (
                    <>
                      <Button
                        variant="secondary"
                        className="px-2.5 py-1 text-xs"
                        disabled={procesando === t.id}
                        onClick={() => accion(cancelarTraslado, t.id)}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Cancelar
                      </Button>
                      <Button
                        className="px-2.5 py-1 text-xs"
                        disabled={procesando === t.id}
                        onClick={() => accion(recibirTraslado, t.id)}
                      >
                        <PackageCheck className="h-3.5 w-3.5" />
                        {procesando === t.id ? "Recibiendo..." : "Marcar recibido"}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
