"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Card } from "@/components/ui";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import { formatMoney } from "@/lib/utils";
import type { HistorialPrecio, MaterialConRelaciones } from "@/lib/types";
import { TrendingUp } from "lucide-react";

const COLOR_COSTO = "#C2703D"; // terracota
const COLOR_VENTA = "#2E6B4E"; // verde

export function construirSerie(historial: HistorialPrecio[]) {
  const ordenado = [...historial].sort((a, b) =>
    a.created_at < b.created_at ? -1 : 1
  );
  let costo: number | null = null;
  let venta: number | null = null;
  // Si costo y precio de venta se capturan en el mismo instante (típico al
  // crear un material con ambos valores desde el inicio), dos puntos
  // quedarían con la MISMA fecha exacta. Recharts entonces intenta dibujar
  // dos "ticks" del eje X en la misma posición y genera keys duplicadas
  // (error de React). Se garantiza que cada punto avance al menos 1ms para
  // que el eje siempre tenga valores únicos — imperceptible visualmente.
  let fechaAnterior = -Infinity;
  const puntos: { fecha: number; costo: number | null; venta: number | null }[] =
    [];
  for (const h of ordenado) {
    if (h.tipo === "costo") costo = h.valor;
    else venta = h.valor;
    let fecha = new Date(h.created_at).getTime();
    if (fecha <= fechaAnterior) fecha = fechaAnterior + 1;
    fechaAnterior = fecha;
    puntos.push({ fecha, costo, venta });
  }
  return puntos;
}

export function PrecioHistorial({
  material,
  historial,
}: {
  material: MaterialConRelaciones;
  historial: HistorialPrecio[];
}) {
  const costo = material.costo_unitario;
  const venta = material.precio_venta;
  const margen = venta - costo;
  const margenPct = venta > 0 ? (margen / venta) * 100 : 0;
  const serie = construirSerie(historial);

  const fmtFecha = (t: number) =>
    new Date(t).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });

  return (
    <Card className="mt-4 p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" />
          <h2 className="font-semibold text-fg">Costos y precios</h2>
        </div>
        <BotonExportarCSV
          filename={`historial-precios-${material.sku ?? material.nombre}`}
          filas={historial.map((h) => ({
            Fecha: h.created_at,
            Tipo: h.tipo,
            Valor: h.valor,
            Fuente: h.fuente,
            Cantidad: h.cantidad ?? "",
          }))}
          label="CSV"
        />
      </div>

      {/* Resumen: costo (WAC), precio, margen */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Costo promedio (WAC)" value={formatMoney(costo)} />
        <Stat label="Precio de venta" value={formatMoney(venta)} />
        <Stat
          label="Margen"
          value={formatMoney(margen)}
          tone={margen >= 0 ? "ok" : "danger"}
        />
        <Stat
          label="Margen %"
          value={`${margenPct.toFixed(1)}%`}
          tone={margen >= 0 ? "ok" : "danger"}
        />
      </div>

      {serie.length < 2 ? (
        <p className="py-8 text-center text-sm text-muted">
          Aún no hay suficiente historial para graficar. Se irá construyendo con
          cada compra y cambio de precio.
        </p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={serie}
              margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="currentColor"
                className="text-line"
              />
              <XAxis
                dataKey="fecha"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={fmtFecha}
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-faint"
              />
              <YAxis
                tickFormatter={(v) => `$${v}`}
                tick={{ fontSize: 11 }}
                width={52}
                stroke="currentColor"
                className="text-faint"
              />
              <Tooltip
                labelFormatter={(t) => fmtFecha(Number(t))}
                formatter={(v: number, name) => [
                  formatMoney(v),
                  name === "costo" ? "Costo" : "Precio venta",
                ]}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid rgb(var(--line))",
                  background: "rgb(var(--surface))",
                  fontSize: 12,
                }}
              />
              <Line
                type="stepAfter"
                dataKey="costo"
                name="costo"
                stroke={COLOR_COSTO}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
              />
              <Line
                type="stepAfter"
                dataKey="venta"
                name="venta"
                stroke={COLOR_VENTA}
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 flex justify-center gap-5 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: COLOR_COSTO }}
              />
              Costo
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: COLOR_VENTA }}
              />
              Precio de venta
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "danger";
}) {
  const color =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "danger"
        ? "text-red-600 dark:text-red-400"
        : "text-fg";
  return (
    <div className="rounded-xl border border-line bg-surface-2/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 text-lg font-semibold tracking-tight ${color}`}>
        {value}
      </p>
    </div>
  );
}
