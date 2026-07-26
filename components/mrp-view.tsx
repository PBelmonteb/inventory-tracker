"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card, Select } from "@/components/ui";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import { formatQty } from "@/lib/utils";
import type { RequerimientoMRPConNombre } from "@/lib/data";
import { AlertTriangle, Factory, ShoppingCart, GitBranch } from "lucide-react";

type FiltroAccion = "todas" | "producir" | "comprar" | "ninguna";

const TONO_ACCION: Record<RequerimientoMRPConNombre["accion"], "warn" | "accent" | "neutral"> = {
  producir: "accent",
  comprar: "warn",
  ninguna: "neutral",
};

const LABEL_ACCION: Record<RequerimientoMRPConNombre["accion"], string> = {
  producir: "Producir",
  comprar: "Comprar",
  ninguna: "Cubierto",
};

function fuentesTexto(r: RequerimientoMRPConNombre): string {
  return r.fuentes
    .map((f) =>
      f.tipo === "venta_directa"
        ? `${formatQty(f.cantidad, r.unidad)} de venta directa`
        : `${formatQty(f.cantidad, r.unidad)} para producir ${f.productoOrigenNombre}`
    )
    .join(" + ");
}

export function MRPView({
  requerimientos,
  materialesConCicloBOM,
}: {
  requerimientos: RequerimientoMRPConNombre[];
  materialesConCicloBOM: string[];
}) {
  const [filtroAccion, setFiltroAccion] = useState<FiltroAccion>("todas");
  const [busqueda, setBusqueda] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return requerimientos.filter((r) => {
      if (filtroAccion !== "todas" && r.accion !== filtroAccion) return false;
      if (q && !r.nombre.toLowerCase().includes(q) && !r.sku?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [requerimientos, filtroAccion, busqueda]);

  const totalProducir = requerimientos.filter((r) => r.accion === "producir").length;
  const totalComprar = requerimientos.filter((r) => r.accion === "comprar").length;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
          MRP — planeación de requerimientos
        </h1>
        <p className="mt-1 text-sm text-muted">
          Toda la demanda (ventas directas + producción vía receta) neteada
          contra stock y lo que ya está en camino, en una sola corrida — para
          que un producto compuesto no se coma el insumo de otro sin que
          nadie se entere a tiempo.
        </p>
      </div>

      {materialesConCicloBOM.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-fg">
              <span className="font-medium">Ciclo detectado en la receta de {materialesConCicloBOM.length} material(es).</span>{" "}
              Un material que se necesita a sí mismo (directa o indirectamente)
              no se puede explotar de forma confiable — revisa la receta de:{" "}
              {materialesConCicloBOM.join(", ")}.
            </p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="mb-2 inline-flex rounded-lg bg-accent/12 p-2 text-accent">
            <Factory className="h-5 w-5" />
          </div>
          <p className="text-xs text-muted">Por producir</p>
          <p className="mt-0.5 text-xl font-semibold tracking-tight text-fg">{totalProducir}</p>
        </Card>
        <Card className="p-4">
          <div className="mb-2 inline-flex rounded-lg bg-amber-500/12 p-2 text-amber-600 dark:text-amber-400">
            <ShoppingCart className="h-5 w-5" />
          </div>
          <p className="text-xs text-muted">Por comprar</p>
          <p className="mt-0.5 text-xl font-semibold tracking-tight text-fg">{totalComprar}</p>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Select
            value={filtroAccion}
            onChange={(e) => setFiltroAccion(e.target.value as FiltroAccion)}
            className="w-auto"
          >
            <option value="todas">Todas las acciones</option>
            <option value="producir">Producir</option>
            <option value="comprar">Comprar</option>
            <option value="ninguna">Cubierto (sin acción)</option>
          </Select>
          <input
            type="text"
            placeholder="Buscar por nombre o SKU..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="max-w-xs rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <div className="ml-auto">
            <BotonExportarCSV
              filename="mrp"
              filas={filtrados.map((r) => ({
                Material: r.nombre,
                SKU: r.sku ?? "",
                Acción: LABEL_ACCION[r.accion],
                "Demanda directa": r.demandaDirecta,
                "Demanda derivada (BOM)": r.demandaDerivada,
                "Demanda bruta": r.demandaBruta,
                "Stock actual": r.stockActual,
                "Por llegar": r.porLlegar,
                Disponible: r.disponible,
                "Requerimiento neto": r.requerimientoNeto,
              }))}
              label="CSV"
            />
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted">
            <GitBranch className="h-8 w-8 text-faint" />
            {requerimientos.length === 0
              ? "No hay demanda pendiente (ventas ni producción) que netear ahorita."
              : "Nada coincide con el filtro."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="py-2 pr-3 font-medium">Material</th>
                  <th className="py-2 pr-3 text-center font-medium">Acción</th>
                  <th className="py-2 pr-3 text-right font-medium">Demanda bruta</th>
                  <th className="py-2 pr-3 text-right font-medium">Disponible</th>
                  <th className="py-2 pr-3 text-right font-medium">Requerimiento neto</th>
                  <th className="py-2 font-medium">Por qué</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtrados.map((r) => (
                  <tr key={r.materialId}>
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/materiales/${r.materialId}`}
                        className="font-medium text-fg transition-colors hover:text-accent"
                      >
                        {r.nombre}
                      </Link>
                      {r.sku && <span className="ml-2 text-xs text-faint">{r.sku}</span>}
                      {r.cicloDetectado && (
                        <Badge tone="danger" className="ml-2">
                          Ciclo
                        </Badge>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-center">
                      <Badge tone={TONO_ACCION[r.accion]}>{LABEL_ACCION[r.accion]}</Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-right text-fg">
                      {formatQty(r.demandaBruta, r.unidad)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-muted">
                      {formatQty(r.disponible, r.unidad)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-medium text-fg">
                      {r.requerimientoNeto > 0 ? formatQty(r.requerimientoNeto, r.unidad) : "—"}
                    </td>
                    <td className="py-2.5 text-xs text-faint">{fuentesTexto(r) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-faint">
          Demanda bruta = ventas confirmadas/en producción + salidas
          pendientes + lo que se necesita explotado de la receta de
          productos con demanda propia. Requerimiento neto = demanda bruta -
          stock actual - lo que ya está en camino (órdenes ya colocadas).
        </p>
      </Card>
    </div>
  );
}
