"use client";

// Mirror de components/scorecard-proveedores-view.tsx del lado de venta —
// mide valor/confiabilidad del cliente, no "cumplimiento" (eso solo aplica
// a proveedores, que nos entregan a nosotros).

import { useMemo, useState } from "react";
import { Badge, Card, Select } from "@/components/ui";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import { formatMoney } from "@/lib/utils";
import type { ScorecardClienteConNombre } from "@/lib/data";
import { Users } from "lucide-react";

type Orden = "valor" | "cancelacion" | "nombre";

function tonoPct(pct: number): "ok" | "warn" | "danger" {
  if (pct >= 90) return "ok";
  if (pct >= 70) return "warn";
  return "danger";
}

function CeldaCumplimiento({
  metrica,
  etiqueta,
}: {
  metrica: { pct: number; cumplidos: number; conDato: number } | null;
  etiqueta: string;
}) {
  if (!metrica) return <span className="text-xs text-faint">Sin dato de referencia</span>;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Badge tone={tonoPct(metrica.pct)}>{metrica.pct.toFixed(0)}%</Badge>
      <span className="text-[11px] text-faint">
        {metrica.cumplidos}/{metrica.conDato} {etiqueta}
      </span>
    </div>
  );
}

export function ScorecardClientesView({
  clientes,
}: {
  clientes: ScorecardClienteConNombre[];
}) {
  const [orden, setOrden] = useState<Orden>("valor");

  const ordenados = useMemo(() => {
    const copia = [...clientes];
    if (orden === "nombre") return copia.sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (orden === "cancelacion") {
      return copia.sort((a, b) => {
        if (a.tasaCancelacion === null && b.tasaCancelacion === null) return 0;
        if (a.tasaCancelacion === null) return 1;
        if (b.tasaCancelacion === null) return -1;
        return b.tasaCancelacion.pct - a.tasaCancelacion.pct;
      });
    }
    return copia.sort((a, b) => b.valorTotalVendido - a.valorTotalVendido);
  }, [clientes, orden]);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Sin h1 propio: vive como tab dentro de Clientes. */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select
            value={orden}
            onChange={(e) => setOrden(e.target.value as Orden)}
            className="w-auto"
          >
            <option value="valor">Mayor valor vendido primero</option>
            <option value="cancelacion">Menor cancelación primero</option>
            <option value="nombre">Nombre (A-Z)</option>
          </Select>
          <div className="ml-auto">
            <BotonExportarCSV
              filename="scorecard-clientes"
              filas={ordenados.map((c) => ({
                Cliente: c.nombre,
                Casos: c.numCasos,
                "Valor total vendido": Math.round(c.valorTotalVendido * 100) / 100,
                "Ticket promedio": c.ticketPromedio ? Math.round(c.ticketPromedio * 100) / 100 : "",
                "Cancelación %": c.tasaCancelacion
                  ? Math.round((100 - c.tasaCancelacion.pct) * 10) / 10
                  : "",
                "Devolución %": c.tasaDevolucion
                  ? Math.round((100 - c.tasaDevolucion.pct) * 10) / 10
                  : "",
                "Margen estimado": c.margenEstimado !== null ? Math.round(c.margenEstimado * 100) / 100 : "",
              }))}
              label="CSV"
            />
          </div>
        </div>

        {ordenados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted">
            <Users className="h-8 w-8 text-faint" />
            No hay clientes registrados todavía.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 text-right font-medium">Casos</th>
                  <th className="py-2 pr-3 text-right font-medium">Valor vendido</th>
                  <th className="py-2 pr-3 text-right font-medium">Ticket promedio</th>
                  <th className="py-2 pr-3 text-center font-medium">Sin cancelar</th>
                  <th className="py-2 pr-3 text-center font-medium">Sin devolución</th>
                  <th className="py-2 text-right font-medium">Margen estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ordenados.map((c) => (
                  <tr key={c.clienteId}>
                    <td className="py-2.5 pr-3 font-medium text-fg">{c.nombre}</td>
                    <td className="py-2.5 pr-3 text-right text-muted">{c.numCasos}</td>
                    <td className="py-2.5 pr-3 text-right text-fg">
                      {formatMoney(c.valorTotalVendido)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-muted">
                      {c.ticketPromedio !== null ? formatMoney(c.ticketPromedio) : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-center">
                      <CeldaCumplimiento metrica={c.tasaCancelacion} etiqueta="casos" />
                    </td>
                    <td className="py-2.5 pr-3 text-center">
                      <CeldaCumplimiento metrica={c.tasaDevolucion} etiqueta="entregas" />
                    </td>
                    <td className="py-2.5 text-right text-muted">
                      {c.margenEstimado !== null ? formatMoney(c.margenEstimado) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-faint">
          Casos: cotizaciones/órdenes que no se cancelaron. Sin cancelar:
          porcentaje del total de casos (incluye cancelados) que sí siguió
          adelante. Sin devolución: porcentaje de lo entregado que el cliente
          no devolvió. Margen estimado: valor vendido menos el costo actual
          (WAC) de los materiales — aproximado, no histórico.
        </p>
      </Card>
    </div>
  );
}
