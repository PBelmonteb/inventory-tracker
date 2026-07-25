"use client";

// Tarjeta de caso de compra compartida entre las pestañas del Portal de
// Proveedores — mismo layout, solo cambian los botones de acción que le
// pasa cada pestaña (children).

import { Badge } from "@/components/ui";
import { ResponsableSelect } from "@/components/responsable-select";
import { InfoTooltip } from "@/components/info-tooltip";
import { formatDate, formatMoney, formatQty } from "@/lib/utils";
import type { UsuarioAsignable } from "@/lib/actions/usuarios";
import type {
  CasoCompraConRelaciones,
  EstadoCasoCompra,
  NivelRiesgoStock,
  OrigenCasoCompra,
} from "@/lib/types";
import { BellRing, Eye, Mail, PencilLine, TriangleAlert } from "lucide-react";

const ESTADO_META: Record<
  EstadoCasoCompra,
  { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "accent" }
> = {
  pendiente: { label: "Pendiente", tone: "warn" },
  cotizando: { label: "Pendiente", tone: "warn" },
  por_autorizar: { label: "Por autorizar", tone: "warn" },
  ordenado: { label: "Ordenado", tone: "accent" },
  rechazado: { label: "Rechazado", tone: "danger" },
  recibido: { label: "Recibido", tone: "ok" },
  cancelado: { label: "Cancelado", tone: "neutral" },
};

const ORIGEN_META: Record<OrigenCasoCompra, { label: string; Icon: typeof Mail }> = {
  manual: { label: "Manual", Icon: PencilLine },
  stock_bajo: { label: "Reposición automática", Icon: BellRing },
  correo: { label: "Correo entrante", Icon: Mail },
};

const NIVEL_RIESGO_META: Record<
  NivelRiesgoStock,
  { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "accent" }
> = {
  critico: { label: "Riesgo crítico", tone: "danger" },
  alto: { label: "Riesgo alto", tone: "warn" },
  medio: { label: "Riesgo medio", tone: "neutral" },
};

export function CasoCompraCard({
  caso,
  usuarios,
  onAsignarResponsable,
  onVerDetalle,
  actions,
}: {
  caso: CasoCompraConRelaciones;
  usuarios: UsuarioAsignable[];
  onAsignarResponsable?: (casoId: string, usuarioId: string) => void;
  onVerDetalle: (caso: CasoCompraConRelaciones) => void;
  actions?: React.ReactNode;
}) {
  const origenMeta = ORIGEN_META[caso.origen];
  const OrigenIcon = origenMeta.Icon;
  const titulo = caso.materiales?.nombre ?? caso.titulo;

  // "Creado por" para casos manuales: si no se capturó (caso viejo, de
  // antes de esta feature), no se inventa un nombre.
  const bulletOrigen =
    caso.origen === "manual"
      ? caso.creado_por_nombre
        ? `Creado por ${caso.creado_por_nombre}`
        : null
      : origenMeta.label;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
          {titulo}
          {caso.referencia && (
            <span className="text-xs font-normal text-faint">{caso.referencia}</span>
          )}
          {caso.solicitudes_compra && (
            <span
              title="Cotización comparativa — hay más de un proveedor para esta necesidad"
              className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent"
            >
              {caso.solicitudes_compra.codigo}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {caso.proveedores?.nombre ??
            (caso.proveedor_nombre ? `${caso.proveedor_nombre} (eliminado)` : "Proveedor eliminado")}
          {caso.materiales && caso.titulo !== caso.materiales.nombre && <> · {caso.titulo}</>}
        </p>
        <p className="mt-1 text-xs text-muted">
          {caso.cantidad_estimada != null && (
            <>Cantidad: {formatQty(caso.cantidad_estimada, caso.materiales?.unidad)} · </>
          )}
          Monto: {formatMoney(caso.monto_estimado)} · {formatDate(caso.created_at)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {bulletOrigen && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
              <OrigenIcon className="h-3 w-3" />
              {bulletOrigen}
            </span>
          )}
          {caso.origen === "stock_bajo" && caso.nivel_riesgo && (
            <>
              <Badge tone={NIVEL_RIESGO_META[caso.nivel_riesgo].tone}>
                <TriangleAlert className="h-3 w-3" />
                {NIVEL_RIESGO_META[caso.nivel_riesgo].label}
              </Badge>
              <InfoTooltip>
                {caso.descripcion ? (
                  <p>{caso.descripcion}</p>
                ) : (
                  <p>Caso generado automáticamente por la reposición de stock.</p>
                )}
                {(caso.dias_cobertura_restante != null || caso.lead_time_dias_usado != null) && (
                  <p className="mt-1.5 border-t border-line pt-1.5">
                    {caso.dias_cobertura_restante != null && (
                      <>Cobertura al crear el caso: ~{caso.dias_cobertura_restante.toFixed(1)} días. </>
                    )}
                    {caso.lead_time_dias_usado != null && (
                      <>Tiempo de entrega usado: ~{caso.lead_time_dias_usado.toFixed(1)} días.</>
                    )}
                  </p>
                )}
              </InfoTooltip>
            </>
          )}
          {caso.correo_enviado_at && (
            <span
              title={`Correo enviado el ${formatDate(caso.correo_enviado_at)}`}
              className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted"
            >
              <Mail className="h-3 w-3" /> Correo enviado
            </span>
          )}
          {caso.estado === "rechazado" && caso.motivo_rechazo && (
            <span
              title={caso.motivo_rechazo}
              className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400"
            >
              Motivo: {caso.motivo_rechazo}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onVerDetalle(caso)}
          title="Ver detalle y timeline"
          aria-label="Ver detalle y timeline"
          className="cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <Eye className="h-4 w-4" />
        </button>
        <Badge tone={ESTADO_META[caso.estado].tone}>{ESTADO_META[caso.estado].label}</Badge>
        {onAsignarResponsable && (
          <ResponsableSelect
            usuarios={usuarios}
            value={caso.responsable_id ?? ""}
            onChange={(usuarioId) => onAsignarResponsable(caso.id, usuarioId)}
            className="w-auto py-1 text-xs"
            ariaLabel="Responsable del caso"
          />
        )}
        {actions}
      </div>
    </li>
  );
}
