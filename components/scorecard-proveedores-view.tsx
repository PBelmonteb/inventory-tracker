"use client";

import { useMemo, useState } from "react";
import { Badge, Card, Select } from "@/components/ui";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import { formatMoney } from "@/lib/utils";
import type { ScorecardProveedorConNombre } from "@/lib/data";
import { Truck } from "lucide-react";

type Orden = "score" | "valor" | "nombre";

function tonoPct(pct: number): "ok" | "warn" | "danger" {
  if (pct >= 90) return "ok";
  if (pct >= 70) return "warn";
  return "danger";
}

function CeldaCumplimiento({
  metrica,
}: {
  metrica: { pct: number; cumplidos: number; conDato: number } | null;
}) {
  if (!metrica) return <span className="text-xs text-faint">Sin dato de referencia</span>;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Badge tone={tonoPct(metrica.pct)}>{metrica.pct.toFixed(0)}%</Badge>
      <span className="text-[11px] text-faint">
        {metrica.cumplidos}/{metrica.conDato} pedidos
      </span>
    </div>
  );
}

export function ScorecardProveedoresView({
  proveedores,
}: {
  proveedores: ScorecardProveedorConNombre[];
}) {
  const [orden, setOrden] = useState<Orden>("score");

  const ordenados = useMemo(() => {
    const copia = [...proveedores];
    if (orden === "nombre") return copia.sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (orden === "valor") return copia.sort((a, b) => b.valorTotalRecibido - a.valorTotalRecibido);
    // "score": mejor desempeño primero, los que no tienen score (sin datos
    // de referencia) van al final sin importar cuántos pedidos tengan.
    return copia.sort((a, b) => {
      if (a.scoreGeneral === null && b.scoreGeneral === null) return b.valorTotalRecibido - a.valorTotalRecibido;
      if (a.scoreGeneral === null) return 1;
      if (b.scoreGeneral === null) return -1;
      return b.scoreGeneral - a.scoreGeneral;
    });
  }, [proveedores, orden]);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Sin h1 propio: vive como tab dentro de Proveedores. */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select
            value={orden}
            onChange={(e) => setOrden(e.target.value as Orden)}
            className="w-auto"
          >
            <option value="score">Mejor desempeño primero</option>
            <option value="valor">Mayor valor comprado primero</option>
            <option value="nombre">Nombre (A-Z)</option>
          </Select>
          <div className="ml-auto">
            <BotonExportarCSV
              filename="scorecard-proveedores"
              filas={ordenados.map((p) => ({
                Proveedor: p.nombre,
                "Pedidos recibidos": p.numPedidosRecibidos,
                "Valor total comprado": Math.round(p.valorTotalRecibido * 100) / 100,
                "Lead time promedio (días)": p.leadTimePromedioDias
                  ? Math.round(p.leadTimePromedioDias * 10) / 10
                  : "",
                "Cumplimiento entrega %": p.cumplimientoEntrega
                  ? Math.round(p.cumplimientoEntrega.pct * 10) / 10
                  : "",
                "Cumplimiento precio %": p.cumplimientoPrecio
                  ? Math.round(p.cumplimientoPrecio.pct * 10) / 10
                  : "",
                "Cumplimiento calidad %": p.cumplimientoCalidad
                  ? Math.round(p.cumplimientoCalidad.pct * 10) / 10
                  : "",
                "Score general": p.scoreGeneral ? Math.round(p.scoreGeneral * 10) / 10 : "",
              }))}
              label="CSV"
            />
          </div>
        </div>

        {ordenados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted">
            <Truck className="h-8 w-8 text-faint" />
            No hay proveedores registrados todavía.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="py-2 pr-3 font-medium">Proveedor</th>
                  <th className="py-2 pr-3 text-right font-medium">Pedidos recibidos</th>
                  <th className="py-2 pr-3 text-right font-medium">Valor comprado</th>
                  <th className="py-2 pr-3 text-right font-medium">Lead time real</th>
                  <th className="py-2 pr-3 text-center font-medium">Cumple entrega</th>
                  <th className="py-2 pr-3 text-center font-medium">Cumple precio</th>
                  <th className="py-2 text-center font-medium">Cumple calidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ordenados.map((p) => (
                  <tr key={p.proveedorId}>
                    <td className="py-2.5 pr-3 font-medium text-fg">
                      {p.nombre}
                      {p.scoreGeneral !== null && (
                        <Badge tone={tonoPct(p.scoreGeneral)} className="ml-2">
                          {p.scoreGeneral.toFixed(0)}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-muted">
                      {p.numPedidosRecibidos}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-fg">
                      {formatMoney(p.valorTotalRecibido)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-muted">
                      {p.leadTimePromedioDias !== null
                        ? `${p.leadTimePromedioDias.toFixed(1)} días`
                        : p.numPedidosRecibidos === 0
                          ? "Sin compras recibidas"
                          : "—"}
                    </td>
                    <td className="py-2.5 pr-3 text-center">
                      <CeldaCumplimiento metrica={p.cumplimientoEntrega} />
                    </td>
                    <td className="py-2.5 pr-3 text-center">
                      <CeldaCumplimiento metrica={p.cumplimientoPrecio} />
                    </td>
                    <td className="py-2.5 text-center">
                      <CeldaCumplimiento metrica={p.cumplimientoCalidad} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-faint">
          Cumple entrega: el pedido llegó dentro de lo pactado en convenio (o,
          si no hay convenio, lo declarado por el proveedor). Cumple precio: el
          precio pagado no superó el precio pactado en convenio. Cumple
          calidad: de lo que se recibió con bloqueo de calidad activo y ya se
          revisó, no se rechazó nada. Las tres solo se calculan sobre pedidos
          con un dato de referencia — sin convenio, tiempo declarado o
          inspección resuelta, no hay "cumplió o no".
        </p>
      </Card>
    </div>
  );
}
