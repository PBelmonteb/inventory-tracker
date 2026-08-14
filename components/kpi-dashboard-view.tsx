"use client";

// Dashboard de KPIs gerencial — tendencia de varios periodos consecutivos
// (semanal/mensual/trimestral/anual) para lo que sí tiene historial real
// por periodo (compras/ventas/conteos), más un puñado de tarjetas "de
// hoy" para lo que no lo tiene (valor de inventario, stock bajo, MRP).
// Reemplaza el plan viejo de reportes en PDF narrados por IA — ver
// lib/reportes-gerenciales.ts. El gerente activa/desactiva KPIs del
// catálogo fijo (lib/kpis-dashboard.ts); la selección y la granularidad
// viven en la URL, igual que los filtros de Movimientos, así que
// "Vistas guardadas" (ya existente) funciona aquí sin cambios.

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Card, Button } from "@/components/ui";
import { KpiCard } from "@/components/kpi-card";
import { VistasGuardadas } from "@/components/vistas-guardadas";
import {
  CATALOGO_KPIS,
  obtenerDefinicionKPI,
  type DefinicionKPI,
  type EstadoActualKPIs,
  type FormatoKPI,
} from "@/lib/kpis-dashboard";
import { formatMoney } from "@/lib/utils";
import type { PuntoTendencia } from "@/lib/reportes-gerenciales";
import type { TipoReporte } from "@/lib/reportes-periodo";
import type { VistaGuardada } from "@/lib/types";
import { SlidersHorizontal, Wallet, PackageX, GitBranch } from "lucide-react";

const TIPOS: { id: TipoReporte; label: string }[] = [
  { id: "semanal", label: "Semanal" },
  { id: "mensual", label: "Mensual" },
  { id: "trimestral", label: "Trimestral" },
  { id: "anual", label: "Anual" },
];

const ICONO_ACTUAL: Record<string, React.ReactNode> = {
  valorInventario: <Wallet className="h-5 w-5" />,
  valorEnvejecido: <Wallet className="h-5 w-5" />,
  stockBajo: <PackageX className="h-5 w-5" />,
  mrpAcciones: <GitBranch className="h-5 w-5" />,
};

function formatearValor(formato: FormatoKPI, valor: number): string {
  if (formato === "moneda") return formatMoney(valor);
  if (formato === "horas") return `${valor.toFixed(1)} h`;
  return String(Math.round(valor));
}

function formatearPeriodoCorto(iso: string, tipo: TipoReporte): string {
  const d = new Date(`${iso}T00:00:00`);
  if (tipo === "semanal")
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
  if (tipo === "mensual")
    return d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
  if (tipo === "trimestral") return `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  return String(d.getFullYear());
}

export function KpiDashboardView({
  tipo,
  tendencia,
  estadoActual,
  kpisActivos,
  vistas,
}: {
  tipo: TipoReporte;
  tendencia: PuntoTendencia[];
  estadoActual: EstadoActualKPIs;
  kpisActivos: string[];
  vistas: VistaGuardada[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [panelAbierto, setPanelAbierto] = useState(false);

  function actualizarParam(clave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "dashboard");
    params.set(clave, valor);
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleKpi(id: string) {
    const activos = new Set(kpisActivos);
    if (activos.has(id)) activos.delete(id);
    else activos.add(id);
    actualizarParam("kpis", Array.from(activos).join(","));
  }

  const kpisSeleccionados = kpisActivos
    .map((id) => obtenerDefinicionKPI(id))
    .filter((k): k is DefinicionKPI => Boolean(k));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => actualizarParam("tipo", t.id)}
              className={
                "shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors " +
                (tipo === t.id
                  ? "bg-accent text-accent-fg"
                  : "text-muted hover:bg-surface-2 hover:text-fg")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <VistasGuardadas pagina="analisis" vistas={vistas} />
          <Button variant="secondary" onClick={() => setPanelAbierto((v) => !v)}>
            <SlidersHorizontal className="h-4 w-4" /> Personalizar KPIs
          </Button>
        </div>
      </div>

      {panelAbierto && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold text-fg">Elige qué KPIs mostrar</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CATALOGO_KPIS.map((k) => (
              <label
                key={k.id}
                className="flex cursor-pointer items-center gap-2 text-sm text-fg"
              >
                <input
                  type="checkbox"
                  checked={kpisActivos.includes(k.id)}
                  onChange={() => toggleKpi(k.id)}
                  className="cursor-pointer"
                />
                {k.label}
              </label>
            ))}
          </div>
        </Card>
      )}

      {kpisSeleccionados.length === 0 ? (
        <p className="py-10 text-center text-sm text-faint">
          No hay KPIs seleccionados. Abre &quot;Personalizar KPIs&quot; para elegir cuáles ver.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {kpisSeleccionados.map((k) =>
            k.tendenciable && k.valorTendencia ? (
              <TarjetaTendencia key={k.id} definicion={k} tendencia={tendencia} tipo={tipo} />
            ) : (
              <KpiCard
                key={k.id}
                icon={ICONO_ACTUAL[k.id] ?? <Wallet className="h-5 w-5" />}
                label={k.label}
                value={formatearValor(k.formato, k.valorActual ? k.valorActual(estadoActual) : 0)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function TarjetaTendencia({
  definicion,
  tendencia,
  tipo,
}: {
  definicion: DefinicionKPI;
  tendencia: PuntoTendencia[];
  tipo: TipoReporte;
}) {
  const datos = tendencia.map((p) => ({
    periodo: formatearPeriodoCorto(p.periodoInicio, tipo),
    valor: definicion.valorTendencia!(p),
  }));
  const ultimo = datos[datos.length - 1]?.valor ?? 0;
  const anterior = datos[datos.length - 2]?.valor;
  const variacion =
    anterior !== undefined && anterior !== 0
      ? ((ultimo - anterior) / Math.abs(anterior)) * 100
      : null;

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{definicion.label}</p>
        {variacion !== null && (
          <span
            className={
              variacion >= 0
                ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                : "text-xs font-medium text-red-600 dark:text-red-400"
            }
          >
            {variacion >= 0 ? "+" : ""}
            {variacion.toFixed(0)}%
          </span>
        )}
      </div>
      <p className="mb-2 text-xl font-semibold tracking-tight text-fg">
        {formatearValor(definicion.formato, ultimo)}
      </p>
      <div className="h-24 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-line" />
            <XAxis
              dataKey="periodo"
              tick={{ fontSize: 10 }}
              stroke="currentColor"
              className="text-faint"
            />
            <YAxis hide />
            <Tooltip
              formatter={(v: number) => [formatearValor(definicion.formato, v), definicion.label]}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid rgb(var(--line))",
                background: "rgb(var(--surface))",
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="valor"
              stroke="#2E6B4E"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
