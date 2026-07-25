"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { NuevoConteoForm } from "@/components/nuevo-conteo-form";
import { ConteoDetalleModal } from "@/components/conteo-detalle-modal";
import { formatDate } from "@/lib/utils";
import type { Categoria, Conteo, Ubicacion } from "@/lib/types";
import { ClipboardList, Plus } from "lucide-react";

const ESTADO_META: Record<
  Conteo["estado"],
  { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "accent" }
> = {
  abierto: { label: "Abierto", tone: "warn" },
  contado: { label: "Contado", tone: "accent" },
  aplicado: { label: "Aplicado", tone: "ok" },
  cancelado: { label: "Cancelado", tone: "neutral" },
};

export function ConteosView({
  conteos,
  categorias,
  ubicaciones,
  esGestor,
}: {
  conteos: Conteo[];
  categorias: Categoria[];
  ubicaciones: Ubicacion[];
  esGestor: boolean;
}) {
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [detalle, setDetalle] = useState<Conteo | null>(null);

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-accent" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
              Conteo cíclico
            </h1>
            <p className="mt-1 text-sm text-muted">
              Cuenta a ciegas y confirma que el sistema coincide con la realidad.
            </p>
          </div>
        </div>
        {esGestor && (
          <Button onClick={() => setNuevoAbierto(true)}>
            <Plus className="h-4 w-4" /> Nuevo conteo
          </Button>
        )}
      </div>

      {conteos.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          {esGestor
            ? 'Aún no hay conteos. Dale a "Nuevo conteo" para empezar.'
            : "Aún no hay conteos que capturar."}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {conteos.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setDetalle(c)}
                    className="cursor-pointer text-left text-sm font-medium text-fg hover:text-accent hover:underline"
                  >
                    {c.titulo}
                  </button>
                  <p className="mt-0.5 text-xs text-faint">
                    {c.codigo} · {formatDate(c.created_at)}
                    {c.creado_por_nombre && <> · {c.creado_por_nombre}</>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={ESTADO_META[c.estado].tone}>{ESTADO_META[c.estado].label}</Badge>
                  <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setDetalle(c)}>
                    {c.estado === "abierto" ? "Capturar" : c.estado === "contado" ? "Revisar" : "Ver"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <NuevoConteoForm
        open={nuevoAbierto}
        onClose={() => setNuevoAbierto(false)}
        categorias={categorias}
        ubicaciones={ubicaciones}
      />
      <ConteoDetalleModal conteo={detalle} esGestor={esGestor} onClose={() => setDetalle(null)} />
    </div>
  );
}
