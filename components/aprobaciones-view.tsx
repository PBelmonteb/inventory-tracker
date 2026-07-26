"use client";

import { useState } from "react";
import { Badge, Card } from "@/components/ui";
import { AutorizarCasoForm } from "@/components/autorizar-caso-form";
import { ConteoDetalleModal } from "@/components/conteo-detalle-modal";
import { CasoDetalleModal } from "@/components/caso-detalle-modal";
import { formatDate, formatMoney } from "@/lib/utils";
import type { BandejaAprobaciones, CasoPorAutorizar } from "@/lib/aprobaciones";
import type { CasoCompraConRelaciones, Conteo, SolicitudCompraConRelaciones } from "@/lib/types";
import { AlertTriangle, ClipboardCheck, Scale, CheckCircle2 } from "lucide-react";

function Seccion({
  titulo,
  icon,
  count,
  vacio,
  children,
}: {
  titulo: string;
  icon: React.ReactNode;
  count: number;
  vacio: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-fg">
        {icon}
        {titulo}
        {count > 0 && <Badge tone="danger">{count}</Badge>}
      </h2>
      {count === 0 ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          {vacio}
        </div>
      ) : (
        <ul className="divide-y divide-line">{children}</ul>
      )}
    </Card>
  );
}

export function AprobacionesView({
  bandeja,
  esAdmin,
  umbralAdmin,
}: {
  bandeja: BandejaAprobaciones;
  esAdmin: boolean;
  umbralAdmin: number;
}) {
  const [autorizando, setAutorizando] = useState<CasoPorAutorizar | null>(null);
  const [conteoAbierto, setConteoAbierto] = useState<Conteo | null>(null);
  const [detalleCaso, setDetalleCaso] = useState<CasoCompraConRelaciones | null>(null);

  function abrirSolicitud(s: SolicitudCompraConRelaciones) {
    const repr = s.casos.find((c) => c.estado !== "cancelado") ?? s.casos[0] ?? null;
    setDetalleCaso(repr);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
          Bandeja de aprobaciones
        </h1>
        <p className="mt-1 text-sm text-muted">
          Todo lo que necesita una decisión tuya, en un solo lugar — sin
          entrar módulo por módulo.
        </p>
      </div>

      <Seccion
        titulo="Casos de compra por autorizar"
        icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
        count={bandeja.porAutorizar.length}
        vacio="No hay casos esperando autorización."
      >
        {bandeja.porAutorizar.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setAutorizando(c)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 py-2.5 text-left text-sm transition-colors hover:text-accent"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-fg">{c.titulo}</p>
                <p className="truncate text-xs text-faint">
                  {c.proveedores?.nombre ?? "Sin proveedor"}
                  {c.creado_por_nombre ? ` · pedido por ${c.creado_por_nombre}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {c.requiereAdmin && <Badge tone="danger">Requiere admin</Badge>}
                <span className="font-medium text-fg">{formatMoney(c.monto_estimado)}</span>
              </div>
            </button>
          </li>
        ))}
      </Seccion>

      <Seccion
        titulo="Conteos cíclicos por revisar"
        icon={<ClipboardCheck className="h-4 w-4 text-amber-500" />}
        count={bandeja.conteosPorRevisar.length}
        vacio="No hay conteos esperando revisión."
      >
        {bandeja.conteosPorRevisar.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => setConteoAbierto(c)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 py-2.5 text-left text-sm transition-colors hover:text-accent"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-fg">{c.titulo}</p>
                <p className="text-xs text-faint">{c.codigo}</p>
              </div>
              <span className="shrink-0 text-xs text-faint">Contado {formatDate(c.updated_at)}</span>
            </button>
          </li>
        ))}
      </Seccion>

      <Seccion
        titulo="Solicitudes de compra por resolver"
        icon={<Scale className="h-4 w-4 text-amber-500" />}
        count={bandeja.solicitudesPorResolver.length}
        vacio="No hay comparaciones de cotización esperando una ganadora."
      >
        {bandeja.solicitudesPorResolver.map((s) => {
          const vivas = s.casos.filter((c) => c.estado !== "cancelado");
          const masBarata = vivas.reduce(
            (min, c) => (min === null || c.monto_estimado < min ? c.monto_estimado : min),
            null as number | null
          );
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => abrirSolicitud(s)}
                className="flex w-full cursor-pointer items-center justify-between gap-2 py-2.5 text-left text-sm transition-colors hover:text-accent"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-fg">{s.titulo}</p>
                  <p className="text-xs text-faint">
                    {s.codigo} · {vivas.length} cotizaciones
                  </p>
                </div>
                {masBarata !== null && (
                  <span className="shrink-0 text-xs text-faint">Desde {formatMoney(masBarata)}</span>
                )}
              </button>
            </li>
          );
        })}
      </Seccion>

      <AutorizarCasoForm
        caso={autorizando}
        esAdmin={esAdmin}
        umbralAdmin={umbralAdmin}
        onClose={() => setAutorizando(null)}
      />
      <ConteoDetalleModal conteo={conteoAbierto} esGestor onClose={() => setConteoAbierto(null)} />
      <CasoDetalleModal
        open={Boolean(detalleCaso)}
        onClose={() => setDetalleCaso(null)}
        caso={detalleCaso}
        esGestor
      />
    </div>
  );
}
