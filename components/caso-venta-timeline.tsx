"use client";

// Timeline de un caso de venta (estilo Salesforce) — gemelo de
// components/caso-timeline.tsx, mismo idioma de icono/color por tipo;
// tabla propia (casos_venta_eventos) porque la FK es a casos_venta.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { agregarNotaCasoVenta } from "@/lib/actions/ventas";
import { formatDate } from "@/lib/utils";
import type { CasoVentaEvento, TipoEventoCaso } from "@/lib/types";
import {
  FilePlus,
  Mail,
  MailOpen,
  MessageSquare,
  RefreshCw,
  UserRound,
} from "lucide-react";

const EVENTO_META: Record<
  TipoEventoCaso,
  { label: string; Icon: typeof FilePlus; clase: string }
> = {
  creado: {
    label: "Caso creado",
    Icon: FilePlus,
    clase: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  correo_enviado: {
    label: "Correo enviado",
    Icon: Mail,
    clase: "bg-accent/10 text-accent",
  },
  correo_recibido: {
    label: "Correo recibido",
    Icon: MailOpen,
    clase: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  estado_cambiado: {
    label: "Cambio de estado",
    Icon: RefreshCw,
    clase: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  responsable_asignado: {
    label: "Responsable",
    Icon: UserRound,
    clase: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  nota: {
    label: "Nota",
    Icon: MessageSquare,
    clase: "bg-surface-2 text-muted",
  },
};

export function CasoVentaTimeline({
  casoId,
  eventos,
  onNotaAgregada,
}: {
  casoId: string;
  eventos: CasoVentaEvento[];
  onNotaAgregada?: () => void;
}) {
  const router = useRouter();
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agregarNota() {
    if (!nota.trim()) return;
    setEnviando(true);
    setError(null);
    const res = await agregarNotaCasoVenta(casoId, nota);
    setEnviando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNota("");
    onNotaAgregada?.();
    router.refresh();
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-fg">Timeline</h3>

      <div className="mb-3 flex gap-2">
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Agregar una nota... (ej. llamé al cliente, confirma en 2 días)"
          className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              agregarNota();
            }
          }}
        />
        <Button
          type="button"
          onClick={agregarNota}
          disabled={enviando || !nota.trim()}
          className="shrink-0 px-3 py-1.5 text-xs"
        >
          Agregar
        </Button>
      </div>
      {error && (
        <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {eventos.length === 0 ? (
        <p className="py-4 text-center text-sm text-faint">Sin actividad todavía.</p>
      ) : (
        <ul className="divide-y divide-line">
          {eventos.map((e) => {
            const meta = EVENTO_META[e.tipo];
            const Icon = meta.Icon;
            return (
              <li key={e.id} className="flex items-start gap-3 py-2.5">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.clase}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">
                    <span className="font-medium">
                      {e.usuario_nombre ?? "Sistema"}
                    </span>{" "}
                    <span className="text-muted">
                      {e.tipo === "nota" ? "escribió una nota" : meta.label.toLowerCase()}
                    </span>
                  </p>
                  {e.detalle && (e.tipo === "correo_enviado" || e.tipo === "correo_recibido") ? (
                    <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-2/60 p-2 font-sans text-xs text-muted">
                      {e.detalle}
                    </pre>
                  ) : (
                    e.detalle && <p className="text-xs text-muted">{e.detalle}</p>
                  )}
                  <p className="text-xs text-faint">{formatDate(e.created_at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
