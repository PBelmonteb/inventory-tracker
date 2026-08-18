"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card, Input, Select } from "@/components/ui";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import { InfoTooltip } from "@/components/info-tooltip";
import { formatMoney } from "@/lib/utils";
import type { MaterialClasificado } from "@/lib/data";
import type { ClaseABC, ClaseXYZ } from "@/lib/clasificacion-abc-xyz";
import { Boxes, TrendingDown } from "lucide-react";

// Debajo de esto, un producto se marca "candidato a reconsiderar": pesa
// mucho en ventas pero regresa mucho menos de lo que le tocaría en
// utilidad (índice = %utilidad ÷ %ingreso). 0.5 = se queda con menos de la
// mitad de la utilidad "justa" para su tamaño -- umbral elegido a ojo, no
// una convención estándar como los cortes de Pareto de ABC.
const UMBRAL_INDICE_BAJO = 0.5;
// Ignora ruido de productos con ventas mínimas -- un producto con 0.5% de
// las ventas no merece la etiqueta aunque su índice salga bajo.
const UMBRAL_PARTICIPACION_MINIMA = 0.03;

const TONO_ABC: Record<ClaseABC, "ok" | "warn" | "neutral"> = {
  A: "ok",
  B: "warn",
  C: "neutral",
};

const TONO_XYZ: Record<ClaseXYZ, "ok" | "warn" | "danger" | "neutral"> = {
  X: "ok",
  Y: "warn",
  Z: "danger",
  "sin datos": "neutral",
};

const EXPLICACION_ABC: Record<ClaseABC, string> = {
  A: "Primer 80% del valor consumido — pocos materiales, la mayoría del dinero.",
  B: "Siguiente 15% (hasta 95% acumulado).",
  C: "El resto — o sin consumo medible.",
};

const EXPLICACION_XYZ: Record<ClaseXYZ, string> = {
  X: "Demanda estable — fácil de prever.",
  Y: "Demanda variable.",
  Z: "Demanda errática — difícil de prever.",
  "sin datos": "No hay suficiente historial de salidas todavía.",
};

export function ClasificacionView({ items }: { items: MaterialClasificado[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroABC, setFiltroABC] = useState<ClaseABC | "">("");
  const [filtroXYZ, setFiltroXYZ] = useState<ClaseXYZ | "">("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return items.filter((it) => {
      if (filtroABC && it.claseABC !== filtroABC) return false;
      if (filtroXYZ && it.claseXYZ !== filtroXYZ) return false;
      if (q && !it.nombre.toLowerCase().includes(q) && !it.sku?.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [items, busqueda, filtroABC, filtroXYZ]);

  // Conteo por combinación ABC×XYZ, para la matriz resumen.
  const matriz = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const it of items) {
      const clave = `${it.claseABC}${it.claseXYZ === "sin datos" ? "?" : it.claseXYZ}`;
      mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
    }
    return mapa;
  }, [items]);

  // Pesan mucho en ventas pero regresan poca utilidad para su tamaño --
  // peor índice primero, es la lista que responde "¿qué dejo de comprar?".
  const candidatos = useMemo(
    () =>
      items
        .filter(
          (it) =>
            it.indiceEficiencia !== null &&
            it.indiceEficiencia < UMBRAL_INDICE_BAJO &&
            it.pctIngreso >= UMBRAL_PARTICIPACION_MINIMA
        )
        .sort((a, b) => a.indiceEficiencia! - b.indiceEficiencia!),
    [items]
  );

  const clasesABC: ClaseABC[] = ["A", "B", "C"];
  const clasesXYZ: (ClaseXYZ | "sin datos")[] = ["X", "Y", "Z", "sin datos"];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Sin h1 propio: vive como tab dentro de Análisis. */}

      {/* Candidatos a reconsiderar: participación de ventas vs. utilidad */}
      {candidatos.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-fg">
            <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Candidatos a reconsiderar
            <InfoTooltip>
              <p className="mb-1.5 font-semibold text-fg">Índice de eficiencia</p>
              <p>Índice = % de la utilidad ÷ % de las ventas, de ventas ya entregadas.</p>
              <p className="mt-1.5">
                Cerca de 1 = el producto gana lo que le toca por su tamaño. Muy por debajo de
                1 = pesa mucho en ventas pero regresa poca utilidad — vale la pena preguntarse
                si conviene seguir comprándolo.
              </p>
            </InfoTooltip>
          </h2>
          <p className="mb-3 text-sm text-muted">
            Mucha participación en ventas, poca utilidad para su tamaño — de las ventas
            entregadas en los últimos 90 días.
          </p>
          <ul className="divide-y divide-line">
            {candidatos.slice(0, 8).map((it) => (
              <li key={it.materialId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link
                  href={`/materiales/${it.materialId}`}
                  className="min-w-0 truncate font-medium text-fg hover:text-accent"
                >
                  {it.nombre}
                  {it.sku && <span className="ml-2 text-xs text-faint">{it.sku}</span>}
                </Link>
                <span className="shrink-0 text-xs text-muted">
                  {(it.pctIngreso * 100).toFixed(1)}% de ventas ·{" "}
                  {(it.pctUtilidad * 100).toFixed(1)}% de utilidad · índice{" "}
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {it.indiceEficiencia!.toFixed(2)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Matriz resumen */}
      <Card className="overflow-x-auto p-5">
        <h2 className="mb-3 font-semibold text-fg">Matriz ABC × XYZ</h2>
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr>
              <th className="w-16 py-1.5 pr-3 text-left text-[11px] font-medium uppercase tracking-wide text-faint" />
              {clasesXYZ.map((xyz) => (
                <th
                  key={xyz}
                  className="py-1.5 px-2 text-center text-[11px] font-medium uppercase tracking-wide text-faint"
                >
                  {xyz === "sin datos" ? "? (sin datos)" : xyz}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clasesABC.map((abc) => (
              <tr key={abc}>
                <th className="py-1.5 pr-3 text-left text-[11px] font-medium uppercase tracking-wide text-faint">
                  {abc}
                </th>
                {clasesXYZ.map((xyz) => {
                  const clave = `${abc}${xyz === "sin datos" ? "?" : xyz}`;
                  const n = matriz.get(clave) ?? 0;
                  return (
                    <td key={xyz} className="p-1 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setFiltroABC(abc);
                          setFiltroXYZ(xyz === "sin datos" ? "sin datos" : xyz);
                        }}
                        className="w-full cursor-pointer rounded-lg bg-surface-2 py-2 text-sm font-semibold text-fg transition-colors hover:bg-accent/12 hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={n === 0}
                      >
                        {n}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-faint">
          Click en un cuadro para filtrar la tabla por esa combinación. AX es
          lo más valioso y predecible (conteo de rutina); CZ es lo menos
          valioso y más errático (no vale la pena perseguirlo).
        </p>
      </Card>

      {/* Filtros + tabla */}
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por nombre o SKU..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="max-w-xs"
          />
          <Select
            value={filtroABC}
            onChange={(e) => setFiltroABC(e.target.value as ClaseABC | "")}
            className="w-auto"
          >
            <option value="">Todas las clases ABC</option>
            {clasesABC.map((c) => (
              <option key={c} value={c}>
                Clase {c}
              </option>
            ))}
          </Select>
          <Select
            value={filtroXYZ}
            onChange={(e) => setFiltroXYZ(e.target.value as ClaseXYZ | "")}
            className="w-auto"
          >
            <option value="">Todas las clases XYZ</option>
            {clasesXYZ.map((c) => (
              <option key={c} value={c}>
                {c === "sin datos" ? "Sin datos" : `Clase ${c}`}
              </option>
            ))}
          </Select>
          {(filtroABC || filtroXYZ || busqueda) && (
            <button
              type="button"
              onClick={() => {
                setFiltroABC("");
                setFiltroXYZ("");
                setBusqueda("");
              }}
              className="cursor-pointer text-sm text-accent hover:underline"
            >
              Limpiar filtros
            </button>
          )}
          <div className="ml-auto">
            <BotonExportarCSV
              filename="clasificacion-abc-xyz"
              filas={filtrados.map((it) => ({
                Material: it.nombre,
                SKU: it.sku ?? "",
                "Valor anual estimado": Math.round(it.valorAnual * 100) / 100,
                "% del valor": Math.round(it.pctValor * 1000) / 10,
                "% acumulado": Math.round(it.pctAcumulado * 1000) / 10,
                Clase_ABC: it.claseABC,
                "Coef. variación": it.coeficienteVariacion
                  ? Math.round(it.coeficienteVariacion * 100) / 100
                  : "",
                Clase_XYZ: it.claseXYZ,
                "% de las ventas": Math.round(it.pctIngreso * 1000) / 10,
                "% de la utilidad": Math.round(it.pctUtilidad * 1000) / 10,
                "Índice de eficiencia": it.indiceEficiencia?.toFixed(2) ?? "",
              }))}
              label="CSV"
            />
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted">
            <Boxes className="h-8 w-8 text-faint" />
            {items.length === 0 ? "No hay materiales activos." : "Nada coincide con el filtro."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="py-2 pr-3 font-medium">Material</th>
                  <th className="py-2 pr-3 text-right font-medium">Valor anual</th>
                  <th className="py-2 pr-3 text-right font-medium">% acum.</th>
                  <th className="py-2 pr-3 text-center font-medium">ABC</th>
                  <th className="py-2 pr-3 text-center font-medium">XYZ</th>
                  <th className="py-2 pr-3 text-right font-medium">Historial</th>
                  <th className="py-2 pr-3 text-right font-medium">% ventas</th>
                  <th className="py-2 text-right font-medium">Índice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtrados.map((it) => (
                  <tr key={it.materialId}>
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/materiales/${it.materialId}`}
                        className="font-medium text-fg transition-colors hover:text-accent"
                      >
                        {it.nombre}
                      </Link>
                      {it.sku && (
                        <span className="ml-2 text-xs text-faint">{it.sku}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-fg">
                      {formatMoney(it.valorAnual)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-muted">
                      {(it.pctAcumulado * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 pr-3 text-center" title={EXPLICACION_ABC[it.claseABC]}>
                      <Badge tone={TONO_ABC[it.claseABC]}>{it.claseABC}</Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-center" title={EXPLICACION_XYZ[it.claseXYZ]}>
                      <Badge tone={TONO_XYZ[it.claseXYZ]}>
                        {it.claseXYZ === "sin datos" ? "?" : it.claseXYZ}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-right text-xs text-faint">
                      {it.disponible
                        ? `${it.diasHistorial} días`
                        : it.razonNoDisponible}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-muted">
                      {it.ventasDisponibles ? `${(it.pctIngreso * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      {it.indiceEficiencia === null ? (
                        <span className="text-xs text-faint">sin ventas</span>
                      ) : (
                        <span
                          className={
                            it.indiceEficiencia < UMBRAL_INDICE_BAJO
                              ? "font-semibold text-amber-600 dark:text-amber-400"
                              : "text-fg"
                          }
                        >
                          {it.indiceEficiencia.toFixed(2)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
