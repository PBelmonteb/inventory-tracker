"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Card } from "@/components/ui";
import { ComparativaPrecios } from "@/components/comparativa-precios";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import { formatMoney, formatQty } from "@/lib/utils";
import type { Reportes } from "@/lib/reportes";
import type { HistorialPrecio, MaterialConRelaciones } from "@/lib/types";
import { AlertTriangle, Snowflake, Wallet, Boxes } from "lucide-react";

// Tintes monocromáticos verdes (minimalismo: un acento con variaciones).
const VERDES = ["#2E6B4E", "#3C8160", "#4F9874", "#69AD8C", "#8BC4A8", "#A9D4BF"];

export function ReportesView({
  reportes,
  diasParado,
  materiales,
  historial,
}: {
  reportes: Reportes;
  diasParado: number;
  materiales: MaterialConRelaciones[];
  historial: HistorialPrecio[];
}) {
  const {
    valorTotal,
    comprarAhora,
    dineroParado,
    valorParado,
    porCategoria,
    porUbicacion,
    margenes,
  } = reportes;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
          Reportes
        </h1>
        <p className="mt-1 text-sm text-muted">
          Qué comprar y dónde está el dinero parado.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={<Wallet className="h-5 w-5" />}
          label="Valor total en inventario"
          value={formatMoney(valorTotal)}
        />
        <Kpi
          icon={<Boxes className="h-5 w-5" />}
          label="Materiales"
          value={String(reportes.totalMateriales)}
        />
        <Kpi
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Por comprar (stock bajo)"
          value={String(comprarAhora.length)}
          tone="warn"
        />
        <Kpi
          icon={<Snowflake className="h-5 w-5" />}
          label="Dinero parado"
          value={formatMoney(valorParado)}
          tone="danger"
        />
      </div>

      {/* Gráfica por categoría */}
      {porCategoria.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-4 font-semibold text-fg">
            Valor de inventario por categoría
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={porCategoria} layout="vertical" margin={{ left: 20 }}>
              <XAxis
                type="number"
                tickFormatter={(v) => formatMoney(v).replace(/\.00$/, "")}
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={{ stroke: "rgb(var(--line))" }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="nombre"
                width={120}
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgb(var(--surface-2))" }}
                contentStyle={{
                  background: "rgb(var(--surface))",
                  border: "1px solid rgb(var(--line))",
                  borderRadius: 10,
                  color: "rgb(var(--fg))",
                  fontSize: 13,
                }}
                formatter={(v: number) => [formatMoney(v), "Valor"]}
              />
              <Bar dataKey="valor" radius={[0, 5, 5, 0]} maxBarSize={26}>
                {porCategoria.map((_, i) => (
                  <Cell key={i} fill={VERDES[i % VERDES.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Gráfica por ubicación */}
      {porUbicacion.length > 0 && (
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-fg">
              Valor de inventario por ubicación
            </h2>
            <BotonExportarCSV
              filename="valor-por-ubicacion"
              filas={porUbicacion.map((u) => ({
                Ubicación: u.nombre,
                Valor: Math.round(u.valor * 100) / 100,
              }))}
              label="CSV"
            />
          </div>
          <ResponsiveContainer width="100%" height={Math.max(140, porUbicacion.length * 44)}>
            <BarChart data={porUbicacion} layout="vertical" margin={{ left: 20 }}>
              <XAxis
                type="number"
                tickFormatter={(v) => formatMoney(v).replace(/\.00$/, "")}
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={{ stroke: "rgb(var(--line))" }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="nombre"
                width={120}
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgb(var(--surface-2))" }}
                contentStyle={{
                  background: "rgb(var(--surface))",
                  border: "1px solid rgb(var(--line))",
                  borderRadius: 10,
                  color: "rgb(var(--fg))",
                  fontSize: 13,
                }}
                formatter={(v: number) => [formatMoney(v), "Valor"]}
              />
              <Bar dataKey="valor" radius={[0, 5, 5, 0]} maxBarSize={26}>
                {porUbicacion.map((_, i) => (
                  <Cell key={i} fill={VERDES[i % VERDES.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <ComparativaPrecios materiales={materiales} historial={historial} />

      {/* Margen por material */}
      {margenes.length > 0 && (
        <Card className="p-5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-fg">Margen por material</h2>
            <BotonExportarCSV
              filename="margen-por-material"
              filas={margenes.map((m) => ({
                Material: m.nombre,
                SKU: m.sku ?? "",
                "Costo (WAC)": m.costo,
                "Precio venta": m.precio,
                Margen: m.margen,
                "Margen %": Math.round(m.margenPct * 10) / 10,
              }))}
              label="CSV"
            />
          </div>
          <p className="mb-4 text-sm text-muted">
            Margen % (precio de venta vs. costo promedio). Los de menor margen
            aparecen primero.
          </p>
          <ResponsiveContainer width="100%" height={Math.max(140, margenes.length * 38)}>
            <BarChart data={margenes} layout="vertical" margin={{ left: 20 }}>
              <XAxis
                type="number"
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={{ stroke: "rgb(var(--line))" }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="nombre"
                width={120}
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgb(var(--surface-2))" }}
                contentStyle={{
                  background: "rgb(var(--surface))",
                  border: "1px solid rgb(var(--line))",
                  borderRadius: 10,
                  color: "rgb(var(--fg))",
                  fontSize: 13,
                }}
                formatter={(v: number, _n, p) => [
                  `${v.toFixed(1)}% · ${formatMoney(p.payload.margen)}`,
                  "Margen",
                ]}
              />
              <Bar dataKey="margenPct" radius={[0, 5, 5, 0]} maxBarSize={26}>
                {margenes.map((m, i) => (
                  <Cell
                    key={i}
                    fill={m.margen >= 0 ? VERDES[i % VERDES.length] : "#DC2626"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Dinero parado — el reporte estrella */}
      <Card className="p-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-red-500" />
            <h2 className="font-semibold text-fg">Dinero parado</h2>
          </div>
          <BotonExportarCSV
            filename="dinero-parado"
            filas={dineroParado.map((m) => ({
              Material: m.nombre,
              SKU: m.sku ?? "",
              Categoría: m.categorias?.nombre ?? "",
              Ubicación: m.ubicaciones?.nombre ?? "",
              Stock: m.stock_actual,
              "Días sin consumo": m.diasSinConsumo ?? "",
              Valor: m.valor,
            }))}
            label="CSV"
          />
        </div>
        <p className="mb-4 text-sm text-muted">
          Material con stock pero sin consumo en {diasParado}+ días. Antes de
          comprar, revisa si ya lo tienes aquí.
        </p>
        <TablaMateriales
          items={dineroParado}
          columnaExtra="diasSinConsumo"
          vacio="No hay material parado."
        />
      </Card>

      {/* Comprar ahora */}
      <Card className="p-5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h2 className="font-semibold text-fg">Comprar ahora (stock bajo)</h2>
          </div>
          <BotonExportarCSV
            filename="comprar-ahora"
            filas={comprarAhora.map((m) => ({
              Material: m.nombre,
              SKU: m.sku ?? "",
              Categoría: m.categorias?.nombre ?? "",
              Ubicación: m.ubicaciones?.nombre ?? "",
              Stock: m.stock_actual,
              Mínimo: m.stock_minimo,
              Valor: m.valor,
            }))}
            label="CSV"
          />
        </div>
        <p className="mb-4 text-sm text-muted">
          Material en o por debajo del mínimo.
        </p>
        <TablaMateriales
          items={comprarAhora}
          columnaExtra="minimo"
          vacio="Todo el stock está por encima del mínimo."
        />
      </Card>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone = "accent",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "accent" | "warn" | "danger";
}) {
  const tones = {
    accent: "bg-accent/12 text-accent",
    warn: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    danger: "bg-red-500/12 text-red-600 dark:text-red-400",
  };
  return (
    <Card className="p-4">
      <div className={`mb-2.5 inline-flex rounded-lg p-2 ${tones[tone]}`}>
        {icon}
      </div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tracking-tight text-fg">
        {value}
      </p>
    </Card>
  );
}

function TablaMateriales({
  items,
  columnaExtra,
  vacio,
}: {
  items: import("@/lib/reportes").MaterialReporte[];
  columnaExtra: "diasSinConsumo" | "minimo";
  vacio: string;
}) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{vacio}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wide text-faint">
          <tr>
            <th className="py-2 pr-3 font-medium">Material</th>
            <th className="py-2 pr-3 text-right font-medium">Stock</th>
            <th className="py-2 pr-3 text-right font-medium">
              {columnaExtra === "diasSinConsumo" ? "Sin consumo" : "Mínimo"}
            </th>
            <th className="py-2 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.slice(0, 25).map((m) => (
            <tr key={m.id}>
              <td className="py-2.5 pr-3">
                <Link
                  href={`/materiales/${m.id}`}
                  className="font-medium text-fg transition-colors hover:text-accent"
                >
                  {m.nombre}
                </Link>
                {m.sku && (
                  <span className="ml-2 text-xs text-faint">{m.sku}</span>
                )}
              </td>
              <td className="py-2.5 pr-3 text-right text-fg">
                {formatQty(m.stock_actual, m.unidad)}
              </td>
              <td className="py-2.5 pr-3 text-right">
                {columnaExtra === "diasSinConsumo" ? (
                  m.diasSinConsumo === null ? (
                    <Badge tone="danger">Nunca</Badge>
                  ) : (
                    <span className="text-muted">{m.diasSinConsumo} días</span>
                  )
                ) : (
                  <span className="text-muted">
                    {formatQty(m.stock_minimo, m.unidad)}
                  </span>
                )}
              </td>
              <td className="py-2.5 text-right font-medium text-fg">
                {formatMoney(m.valor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
