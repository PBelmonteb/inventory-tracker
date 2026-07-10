"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { formatMoney, normalizarTexto } from "@/lib/utils";
import type { HistorialPrecio, MaterialConRelaciones } from "@/lib/types";
import {
  LineChart as LineChartIcon,
  Search,
  ChevronDown,
  X,
} from "lucide-react";

const PALETA = [
  "#2E6B4E",
  "#C2703D",
  "#3B6FA0",
  "#8A4FBF",
  "#B8860B",
  "#C23D5C",
  "#3D9970",
  "#6E4B3A",
];

// key de una serie: "<materialId>:<costo|venta>"
type Seleccion = Set<string>;

function fmtFecha(t: number) {
  return new Date(t).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}

/** Arma el dataset del LineChart con carry-forward por serie (tipo "step"). */
function construirDataset(historial: HistorialPrecio[], claves: string[]) {
  if (claves.length === 0) return [];
  const porClave = new Map<string, { t: number; v: number }[]>();
  for (const clave of claves) {
    const [materialId, tipo] = clave.split(":");
    const puntos = historial
      .filter((h) => h.material_id === materialId && h.tipo === tipo)
      .map((h) => ({ t: new Date(h.created_at).getTime(), v: h.valor }))
      .sort((a, b) => a.t - b.t);
    porClave.set(clave, puntos);
  }
  const tiempos = [
    ...new Set([...porClave.values()].flatMap((p) => p.map((x) => x.t))),
  ].sort((a, b) => a - b);

  const cursores = new Map<string, number>();
  return tiempos.map((t) => {
    const fila: Record<string, number | null> = { fecha: t };
    for (const clave of claves) {
      const puntos = porClave.get(clave)!;
      let i = cursores.get(clave) ?? 0;
      while (i < puntos.length && puntos[i].t <= t) i++;
      cursores.set(clave, i);
      fila[clave] = i > 0 ? puntos[i - 1].v : null;
    }
    return fila;
  });
}

export function ComparativaPrecios({
  materiales,
  historial,
}: {
  materiales: MaterialConRelaciones[];
  historial: HistorialPrecio[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<Seleccion>(new Set());
  const [abierto, setAbierto] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [abierto]);

  const colorDe = (materialId: string) => {
    const i = materiales.findIndex((m) => m.id === materialId);
    return PALETA[(i < 0 ? 0 : i) % PALETA.length];
  };

  function toggle(materialId: string, tipo: "costo" | "venta") {
    const clave = `${materialId}:${tipo}`;
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(clave)) next.delete(clave);
      else next.add(clave);
      return next;
    });
  }

  const claves = [...seleccion];
  const dataset = useMemo(
    () => construirDataset(historial, claves),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [historial, seleccion]
  );

  const filtrados = useMemo(() => {
    if (!busqueda) return materiales;
    const q = normalizarTexto(busqueda);
    return materiales.filter((m) =>
      normalizarTexto(`${m.nombre} ${m.sku ?? ""}`).includes(q)
    );
  }, [materiales, busqueda]);

  const leyenda = claves.map((clave) => {
    const [materialId, tipo] = clave.split(":");
    const m = materiales.find((x) => x.id === materialId);
    return {
      clave,
      color: colorDe(materialId),
      dash: tipo === "venta",
      label: `${m?.nombre ?? "Material"} — ${tipo === "costo" ? "WAC" : "Venta"}`,
    };
  });

  const filasExport = historial
    .filter((h) => claves.includes(`${h.material_id}:${h.tipo}`))
    .map((h) => ({
      Material: h.material_nombre ?? "",
      SKU: h.material_sku ?? "",
      Tipo: h.tipo,
      Valor: h.valor,
      Fuente: h.fuente,
      Fecha: h.created_at,
    }));

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LineChartIcon className="h-5 w-5 text-accent" />
          <h2 className="font-semibold text-fg">Comparativa de costo y precio</h2>
        </div>
        <BotonExportarCSV
          filename="comparativa-costo-precio"
          filas={filasExport}
          label="CSV"
        />
      </div>
      <p className="mb-4 text-sm text-muted">
        Marca el WAC y/o el precio de venta de los materiales que quieras
        superponer en la gráfica.
      </p>

      {/* Dropdown: cerrado muestra chips de lo seleccionado; abierto, la lista */}
      <div className="relative mb-5" ref={panelRef}>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-left text-sm"
        >
          {claves.length === 0 ? (
            <span className="text-faint">Selecciona materiales...</span>
          ) : (
            <span className="flex flex-wrap gap-1.5">
              {leyenda.map((l) => (
                <span
                  key={l.clave}
                  className="flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-xs text-fg"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: l.color }}
                  />
                  {l.label}
                  <X
                    className="h-3 w-3 cursor-pointer text-faint hover:text-fg"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSeleccion((prev) => {
                        const next = new Set(prev);
                        next.delete(l.clave);
                        return next;
                      });
                    }}
                  />
                </span>
              ))}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-faint transition-transform ${abierto ? "rotate-180" : ""}`}
          />
        </button>

        {abierto && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-soft">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2">
              <Search className="h-4 w-4 text-faint" />
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar material o SKU..."
                className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-faint"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface-2/80 text-[11px] uppercase tracking-wide text-faint backdrop-blur">
                <tr>
                  <th className="px-3 py-2 font-medium">Material</th>
                  <th className="px-3 py-2 text-center font-medium">WAC</th>
                  <th className="px-3 py-2 text-center font-medium">Venta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtrados.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-2/40">
                    <td className="px-3 py-2">
                      <span
                        className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                        style={{ background: colorDe(m.id) }}
                      />
                      <span className="font-medium text-fg">{m.nombre}</span>
                      {m.sku && (
                        <span className="ml-1.5 text-xs text-faint">
                          {m.sku}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer rounded border-line accent-accent"
                        checked={seleccion.has(`${m.id}:costo`)}
                        onChange={() => toggle(m.id, "costo")}
                        aria-label={`WAC de ${m.nombre}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer rounded border-line accent-accent"
                        checked={seleccion.has(`${m.id}:venta`)}
                        onChange={() => toggle(m.id, "venta")}
                        aria-label={`Precio de venta de ${m.nombre}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {claves.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          Selecciona al menos un material para ver su gráfica.
        </p>
      ) : dataset.length < 2 ? (
        <p className="py-8 text-center text-sm text-muted">
          Aún no hay suficiente historial para graficar esta selección.
        </p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dataset} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
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
                formatter={(v, clave) => {
                  const [materialId, tipo] = String(clave).split(":");
                  const m = materiales.find((x) => x.id === materialId);
                  const n = typeof v === "number" ? v : Number(v);
                  return [
                    Number.isFinite(n) ? formatMoney(n) : "—",
                    `${m?.nombre ?? ""} (${tipo === "costo" ? "WAC" : "Venta"})`,
                  ] as [string, string];
                }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid rgb(var(--line))",
                  background: "rgb(var(--surface))",
                  fontSize: 12,
                }}
              />
              {claves.map((clave) => {
                const [materialId, tipo] = clave.split(":");
                return (
                  <Line
                    key={clave}
                    type="stepAfter"
                    dataKey={clave}
                    stroke={colorDe(materialId)}
                    strokeWidth={2}
                    strokeDasharray={tipo === "venta" ? "5 4" : undefined}
                    dot={{ r: 2 }}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-muted">
            {leyenda.map((l) => (
              <span key={l.clave} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-0.5 w-4"
                  style={{
                    background: l.color,
                    ...(l.dash
                      ? {
                          backgroundImage: `linear-gradient(90deg, ${l.color} 60%, transparent 40%)`,
                          backgroundSize: "6px 2px",
                          background: "none",
                          borderTop: `2px dashed ${l.color}`,
                        }
                      : {}),
                  }}
                />
                {l.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
