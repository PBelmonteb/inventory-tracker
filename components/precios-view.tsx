"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { actualizarPreciosVenta } from "@/lib/actions/materiales";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import { formatMoney, normalizarTexto } from "@/lib/utils";
import type { MaterialConRelaciones } from "@/lib/types";
import { Search, CheckCircle2, Save } from "lucide-react";

export function PreciosView({
  materiales,
}: {
  materiales: MaterialConRelaciones[];
}) {
  const router = useRouter();
  // Mapa id -> precio en edición (string para permitir vacío mientras teclea).
  const [precios, setPrecios] = useState<Record<string, string>>(() =>
    Object.fromEntries(materiales.map((m) => [m.id, String(m.precio_venta)]))
  );
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    if (!busqueda) return materiales;
    const q = normalizarTexto(busqueda);
    return materiales.filter((m) =>
      normalizarTexto(`${m.nombre} ${m.sku ?? ""}`).includes(q)
    );
  }, [materiales, busqueda]);

  // Filas cuyo precio cambió respecto al original.
  const cambios = materiales.filter(
    (m) => Number(precios[m.id]) !== m.precio_venta
  );

  async function guardar() {
    setError(null);
    setGuardado(false);
    const updates = cambios.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      precio_venta: Number(precios[m.id]) || 0,
    }));
    const negativo = updates.find((u) => u.precio_venta < 0);
    if (negativo) {
      setError(
        `El precio de venta de "${negativo.nombre}" no puede ser negativo.`
      );
      return;
    }
    setCargando(true);
    const res = await actualizarPreciosVenta(
      updates.map(({ id, precio_venta }) => ({ id, precio_venta }))
    );
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setGuardado(true);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Sin h1 propio: vive como tab dentro de Administración. */}
      <div className="mb-6 flex justify-end">
        <div className="flex gap-2">
          <BotonExportarCSV
            filename="precios-costos"
            filas={materiales.map((m) => {
              const precio = Number(precios[m.id]) || 0;
              const margen = precio - m.costo_unitario;
              return {
                Material: m.nombre,
                SKU: m.sku ?? "",
                "Costo (WAC)": m.costo_unitario,
                "Precio venta": precio,
                Margen: Math.round(margen * 100) / 100,
                "Margen %":
                  precio > 0
                    ? Math.round((margen / precio) * 1000) / 10
                    : "",
              };
            })}
            label="CSV"
          />
          <Button onClick={guardar} disabled={cargando || cambios.length === 0}>
            <Save className="h-4 w-4" />
            {cargando
              ? "Guardando..."
              : cambios.length > 0
                ? `Guardar (${cambios.length})`
                : "Guardar"}
          </Button>
        </div>
      </div>

      {guardado && cambios.length === 0 && (
        <Card className="mb-4 flex items-center gap-2 p-3 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Precios guardados.
        </Card>
      )}
      {error && (
        <Card className="mb-4 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </Card>
      )}

      <Card className="mb-4 flex items-center gap-2 p-3">
        <Search className="h-4 w-4 text-faint" />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar material o SKU..."
          className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-faint"
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-line px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-faint">
          <span>Material</span>
          <span className="text-right">Costo (WAC)</span>
          <span className="text-right">Precio venta</span>
          <span className="text-right">Margen</span>
        </div>
        <ul className="divide-y divide-line">
          {filtrados.map((m) => {
            const precio = Number(precios[m.id]) || 0;
            const margen = precio - m.costo_unitario;
            const margenPct = precio > 0 ? (margen / precio) * 100 : 0;
            const cambiado = precio !== m.precio_venta;
            return (
              <li
                key={m.id}
                className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    {m.nombre}
                    {cambiado && (
                      <span className="ml-2 text-[10px] text-accent">•</span>
                    )}
                  </p>
                  {m.sku && (
                    <p className="text-xs text-faint">{m.sku}</p>
                  )}
                </div>
                <span className="text-right text-sm text-muted">
                  {formatMoney(m.costo_unitario)}
                </span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={precios[m.id] ?? ""}
                  onChange={(e) =>
                    setPrecios((p) => ({ ...p, [m.id]: e.target.value }))
                  }
                  className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-right text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <span
                  className={
                    "w-20 text-right text-sm font-medium " +
                    (margen >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400")
                  }
                >
                  {precio > 0 ? `${margenPct.toFixed(0)}%` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
