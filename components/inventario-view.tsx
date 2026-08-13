"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DEMO } from "@/lib/config";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { MaterialForm } from "@/components/material-form";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import { Sparkline } from "@/components/sparkline";
import { actualizarStocksMinimos } from "@/lib/actions/materiales";
import {
  exportarCSV,
  formatMoney,
  formatQty,
  nivelStock,
  normalizarTexto,
} from "@/lib/utils";
import type {
  Categoria,
  MaterialConRelaciones,
  Proveedor,
  StockPorUbicacion,
  Ubicacion,
} from "@/lib/types";
import { Plus, Search, Pencil, AlertTriangle, Download, Save } from "lucide-react";

export function InventarioView({
  materiales,
  categorias,
  ubicaciones,
  proveedores,
  comprometido = {},
  porLlegar = {},
  enTransito = {},
  consumoDiario = {},
  stockPorUbicacion = {},
  esGestor,
}: {
  materiales: MaterialConRelaciones[];
  categorias: Categoria[];
  ubicaciones: Ubicacion[];
  proveedores: Proveedor[];
  comprometido?: Record<string, number>;
  porLlegar?: Record<string, number>;
  // Traslados propios en camino entre ubicaciones (ver /traslados) — cuenta
  // como "va a volver a estar disponible" igual que una compra por llegar,
  // por eso se suma en Proyectado; se muestra aparte solo en /traslados,
  // no aquí, para no saturar más esta tabla ya densa.
  enTransito?: Record<string, number>;
  // Salidas por día, últimos 30 días, más viejo primero — para el
  // sparkline de consumo. Materiales sin salidas no traen llave.
  consumoDiario?: Record<string, number[]>;
  // Stock real por ubicación, del ledger de movimientos (material_stock_ubicacion) —
  // distinto de materiales.ubicacion_id, que es solo la "casa" declarada del
  // material. Un material puede tener stock real en una ubicación distinta a
  // su casa (ej. una entrada se registró ahí directamente); el filtro de
  // ubicación de abajo tiene que reflejar eso, no solo el campo estático.
  stockPorUbicacion?: Record<string, StockPorUbicacion[]>;
  esGestor: boolean;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [catFiltro, setCatFiltro] = useState("");
  const [ubiFiltro, setUbiFiltro] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState<"" | "ok" | "aviso" | "bajo">(
    ""
  );
  const [orden, setOrden] = useState<
    "nombre" | "stock_desc" | "stock_asc" | "valor_desc"
  >("nombre");
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<MaterialConRelaciones | null>(null);

  // Edición en línea del stock mínimo, directo en la tabla — mismo patrón
  // de "editar todo, guardar en lote" que Precios (Administración).
  const [stocksMin, setStocksMin] = useState<Record<string, string>>(() =>
    Object.fromEntries(materiales.map((m) => [m.id, String(m.stock_minimo)]))
  );
  const [guardandoStock, setGuardandoStock] = useState(false);
  const cambiosStock = materiales.filter(
    (m) => Number(stocksMin[m.id]) !== m.stock_minimo
  );

  async function guardarStocksMinimos() {
    const updates = cambiosStock.map((m) => ({
      id: m.id,
      stock_minimo: Number(stocksMin[m.id]) || 0,
    }));
    if (updates.some((u) => u.stock_minimo < 0)) {
      alert("El stock mínimo no puede ser negativo.");
      return;
    }
    setGuardandoStock(true);
    const res = await actualizarStocksMinimos(updates);
    setGuardandoStock(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  useEffect(() => {
    if (DEMO) return;
    const supabase = createClient();
    const canal = supabase
      .channel("inventario-cambios")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "materiales" },
        () => router.refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "movimientos" },
        () => router.refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [router]);

  // Stock real de un material en una ubicación específica (del ledger),
  // no su campo "casa" estático. Los materiales sin movimiento explícito
  // por ubicación caen en la fila de respaldo que ya arma
  // getStockPorUbicacionTodos (su casa + su stock_actual completo).
  function stockEnUbicacion(materialId: string, ubicacionId: string): number {
    return (
      stockPorUbicacion[materialId]?.find((f) => f.ubicacion_id === ubicacionId)
        ?.stock ?? 0
    );
  }

  // Con un filtro de ubicación activo, "el stock de este material" pasa a
  // significar "el stock de este material EN ESA ubicación" — no su total
  // en toda la empresa. Sin filtro, sigue siendo el total (m.stock_actual).
  function stockVisible(m: MaterialConRelaciones): number {
    return ubiFiltro ? stockEnUbicacion(m.id, ubiFiltro) : m.stock_actual;
  }

  const filtrados = useMemo(() => {
    const q = normalizarTexto(busqueda);
    const lista = materiales.filter((m) => {
      if (q) {
        const texto = normalizarTexto(
          `${m.nombre} ${m.sku ?? ""} ${m.descripcion ?? ""}`
        );
        if (!texto.includes(q)) return false;
      }
      if (catFiltro && m.categoria_id !== catFiltro) return false;
      // Antes comparaba m.ubicacion_id (la "casa" declarada del material) —
      // un material con stock real en esta ubicación por un movimiento
      // explícito, pero cuya casa es otra, desaparecía del filtro aunque
      // sí hubiera piezas aquí. Ahora se filtra por stock real.
      if (ubiFiltro && stockEnUbicacion(m.id, ubiFiltro) <= 0) return false;
      if (estadoFiltro && nivelStock(m) !== estadoFiltro) return false;
      return true;
    });
    const ordenar: Record<typeof orden, (a: MaterialConRelaciones, b: MaterialConRelaciones) => number> = {
      nombre: (a, b) => a.nombre.localeCompare(b.nombre),
      stock_desc: (a, b) => stockVisible(b) - stockVisible(a),
      stock_asc: (a, b) => stockVisible(a) - stockVisible(b),
      valor_desc: (a, b) =>
        stockVisible(b) * b.costo_unitario - stockVisible(a) * a.costo_unitario,
    };
    return [...lista].sort(ordenar[orden]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materiales, busqueda, catFiltro, ubiFiltro, estadoFiltro, orden, stockPorUbicacion]);

  const bajos = materiales.filter((m) => nivelStock(m) === "bajo").length;
  const valorTotal = materiales.reduce(
    (acc, m) => acc + m.stock_actual * m.costo_unitario,
    0
  );

  // Nombre de ubicación a mostrar: con filtro activo, la ubicación filtrada
  // (es la que explica el número de stock que se está mostrando); sin
  // filtro, la casa declarada del material, como antes.
  function ubicacionMostrada(m: MaterialConRelaciones): string {
    if (ubiFiltro) return ubicaciones.find((u) => u.id === ubiFiltro)?.nombre ?? "—";
    return m.ubicaciones?.nombre ?? "—";
  }

  function filasInventario() {
    return filtrados.map((m) => ({
      SKU: m.sku ?? "",
      Nombre: m.nombre,
      Categoría: m.categorias?.nombre ?? "",
      Ubicación: ubicacionMostrada(m),
      Proveedor: m.proveedores?.nombre ?? "",
      Unidad: m.unidad,
      "Stock actual": stockVisible(m),
      "Por llegar": porLlegar[m.id] ?? 0,
      Comprometido: comprometido[m.id] ?? 0,
      Proyectado: proyectado(m),
      "Stock mínimo": m.stock_minimo,
      "Costo (WAC)": m.costo_unitario,
      "Precio venta": m.precio_venta,
      Margen: Math.round((m.precio_venta - m.costo_unitario) * 100) / 100,
      "Valor en stock":
        Math.round(stockVisible(m) * m.costo_unitario * 100) / 100,
    }));
  }

  function proyectado(m: MaterialConRelaciones): number {
    return (
      m.stock_actual +
      (porLlegar[m.id] ?? 0) +
      (enTransito[m.id] ?? 0) -
      (comprometido[m.id] ?? 0)
    );
  }

  function exportarInventarioCSV() {
    const fecha = new Date().toISOString().slice(0, 10);
    exportarCSV(`inventario-${fecha}`, filasInventario());
  }

  function exportarExcel() {
    const filas = filtrados.map((m) => ({
      SKU: m.sku ?? "",
      Nombre: m.nombre,
      Categoría: m.categorias?.nombre ?? "",
      Ubicación: ubicacionMostrada(m),
      Proveedor: m.proveedores?.nombre ?? "",
      Unidad: m.unidad,
      "Stock actual": stockVisible(m),
      "Por llegar": porLlegar[m.id] ?? 0,
      Comprometido: comprometido[m.id] ?? 0,
      Proyectado: proyectado(m),
      "Stock mínimo": m.stock_minimo,
      "Costo (WAC)": m.costo_unitario,
      "Precio venta": m.precio_venta,
      Margen: Math.round((m.precio_venta - m.costo_unitario) * 100) / 100,
      "Valor en stock": Math.round(stockVisible(m) * m.costo_unitario * 100) / 100,
    }));
    const ws = XLSX.utils.json_to_sheet(filas);

    // Anchos de columna.
    ws["!cols"] = [
      { wch: 12 }, // SKU
      { wch: 30 }, // Nombre
      { wch: 18 }, // Categoría
      { wch: 14 }, // Ubicación
      { wch: 20 }, // Proveedor
      { wch: 8 }, // Unidad
      { wch: 12 }, // Stock actual
      { wch: 12 }, // Por llegar
      { wch: 12 }, // Comprometido
      { wch: 12 }, // Proyectado
      { wch: 12 }, // Stock mínimo
      { wch: 12 }, // Costo (WAC)
      { wch: 12 }, // Precio venta
      { wch: 12 }, // Margen
      { wch: 15 }, // Valor en stock
    ];

    // Formatos numéricos: moneda en columnas de dinero, miles en stock.
    const MONEDA = '"$"#,##0.00';
    const CANTIDAD = "#,##0.###";
    const colMoneda = [11, 12, 13, 14];
    const colCantidad = [6, 7, 8, 9, 10];
    for (let r = 1; r <= filas.length; r++) {
      for (const c of colMoneda) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) ws[ref].z = MONEDA;
      }
      for (const c of colCantidad) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) ws[ref].z = CANTIDAD;
      }
    }

    // Filtros automáticos en los encabezados.
    if (ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    const fecha = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `inventario-${fecha}.xlsx`);
  }

  function abrirNuevo() {
    setEditando(null);
    setFormOpen(true);
  }
  function abrirEditar(m: MaterialConRelaciones) {
    setEditando(m);
    setFormOpen(true);
  }

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      {/* Encabezado */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
            ¿Qué tengo en inventario?
          </h1>
          <p className="mt-1 text-sm text-muted">
            Estado actual de tus materiales en tiempo real.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportarInventarioCSV}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <Button variant="secondary" onClick={exportarExcel}>
            <Download className="h-4 w-4" />
            Excel
          </Button>
          {esGestor && cambiosStock.length > 0 && (
            <Button onClick={guardarStocksMinimos} disabled={guardandoStock}>
              <Save className="h-4 w-4" />
              {guardandoStock
                ? "Guardando..."
                : `Guardar mínimos (${cambiosStock.length})`}
            </Button>
          )}
          {esGestor && (
            <Button onClick={abrirNuevo}>
              <Plus className="h-4 w-4" />
              Nuevo material
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Materiales" value={String(materiales.length)} />
        <Kpi label="Valor en stock" value={formatMoney(valorTotal)} />
        <Kpi
          label="Stock bajo"
          value={String(bajos)}
          alerta={bajos > 0}
        />
        <Kpi
          label="Categorías"
          value={String(categorias.length)}
        />
      </div>

      {/* Filtros */}
      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre, SKU o descripción..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <Select
            className="md:w-48"
            value={catFiltro}
            onChange={(e) => setCatFiltro(e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
          <Select
            className="md:w-48"
            value={ubiFiltro}
            onChange={(e) => setUbiFiltro(e.target.value)}
          >
            <option value="">Todas las ubicaciones</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </Select>
          <Select
            className="md:w-44"
            value={estadoFiltro}
            onChange={(e) =>
              setEstadoFiltro(e.target.value as typeof estadoFiltro)
            }
            aria-label="Filtrar por estado"
          >
            <option value="">Todos los estados</option>
            <option value="bajo">Stock bajo</option>
            <option value="aviso">Por agotarse</option>
            <option value="ok">OK</option>
          </Select>
          <Select
            className="md:w-48"
            value={orden}
            onChange={(e) => setOrden(e.target.value as typeof orden)}
            aria-label="Ordenar"
          >
            <option value="nombre">Nombre (A–Z)</option>
            <option value="stock_desc">Más piezas primero</option>
            <option value="stock_asc">Menos piezas primero</option>
            <option value="valor_desc">Mayor valor primero</option>
          </Select>
        </div>
      </Card>

      {filtrados.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          No se encontraron materiales.
        </Card>
      ) : (
        <>
          {/* Tabla escritorio */}
          <Card className="hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-surface-2/50 text-left text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-4 py-3 font-medium">Material</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 font-medium">Ubicación</th>
                  <th className="px-4 py-3 text-right font-medium">Stock</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Por llegar
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Comprometido
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Proyectado
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Mínimo</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                  <th className="px-4 py-3 font-medium">Consumo (30d)</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtrados.map((m) => {
                  const nivel = nivelStock(m);
                  const bajo = nivel === "bajo";
                  const aviso = nivel === "aviso";
                  const llegando = porLlegar[m.id] ?? 0;
                  const comprometidoQty = comprometido[m.id] ?? 0;
                  const proy = proyectado(m);
                  return (
                    <tr
                      key={m.id}
                      className="transition-colors hover:bg-surface-2/60"
                    >
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-muted">
                        {m.categorias?.nombre ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {ubicacionMostrada(m)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1.5">
                          {(bajo || aviso) && (
                            <AlertTriangle
                              className={
                                bajo
                                  ? "h-4 w-4 text-red-500"
                                  : "h-4 w-4 text-amber-500"
                              }
                            />
                          )}
                          <span
                            className={
                              bajo
                                ? "font-semibold text-red-600 dark:text-red-400"
                                : aviso
                                  ? "font-semibold text-amber-600 dark:text-amber-400"
                                  : "text-fg"
                            }
                          >
                            {formatQty(stockVisible(m), m.unidad)}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {llegando > 0 ? formatQty(llegando, m.unidad) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {comprometidoQty > 0
                          ? formatQty(comprometidoQty, m.unidad)
                          : "—"}
                      </td>
                      <td
                        className={
                          proy < 0
                            ? "px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400"
                            : "px-4 py-3 text-right text-fg"
                        }
                      >
                        {formatQty(proy, m.unidad)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {esGestor ? (
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={stocksMin[m.id] ?? ""}
                            onChange={(e) =>
                              setStocksMin((s) => ({
                                ...s,
                                [m.id]: e.target.value,
                              }))
                            }
                            aria-label={`Stock mínimo de ${m.nombre}`}
                            className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-right text-sm text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                          />
                        ) : (
                          <span className="text-faint">
                            {formatQty(m.stock_minimo, m.unidad)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {formatMoney(stockVisible(m) * m.costo_unitario)}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const serie = consumoDiario[m.id];
                          const total = serie?.reduce((a, b) => a + b, 0) ?? 0;
                          return (
                            <div className="flex items-center gap-2">
                              <Sparkline data={serie ?? []} />
                              {total > 0 && (
                                <span className="text-xs text-faint">
                                  {formatQty(total, m.unidad)}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {esGestor && (
                          <button
                            onClick={() => abrirEditar(m)}
                            aria-label="Editar"
                            className="cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </Card>

          {/* Tarjetas móvil */}
          <div className="space-y-2.5 md:hidden">
            {filtrados.map((m) => {
              const nivel = nivelStock(m);
              const bajo = nivel === "bajo";
              const aviso = nivel === "aviso";
              const llegando = porLlegar[m.id] ?? 0;
              const comprometidoQty = comprometido[m.id] ?? 0;
              const proy = proyectado(m);
              return (
                <Card key={m.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/materiales/${m.id}`} className="flex-1">
                      <p className="font-medium text-fg">{m.nombre}</p>
                      <p className="mt-0.5 text-xs text-faint">
                        {m.sku ? `${m.sku} · ` : ""}
                        {m.categorias?.nombre ?? "Sin categoría"} ·{" "}
                        {ubicacionMostrada(m)}
                      </p>
                    </Link>
                    {bajo ? (
                      <Badge tone="danger">Bajo</Badge>
                    ) : aviso ? (
                      <Badge tone="warn">Por agotarse</Badge>
                    ) : (
                      <Badge tone="ok">OK</Badge>
                    )}
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div>
                      <p
                        className={
                          bajo
                            ? "text-lg font-semibold text-red-600 dark:text-red-400"
                            : aviso
                              ? "text-lg font-semibold text-amber-600 dark:text-amber-400"
                              : "text-lg font-semibold text-fg"
                        }
                      >
                        {formatQty(stockVisible(m), m.unidad)}
                      </p>
                      {esGestor ? (
                        <label className="mt-0.5 flex items-center gap-1 text-xs text-faint">
                          mín.
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={stocksMin[m.id] ?? ""}
                            onChange={(e) =>
                              setStocksMin((s) => ({
                                ...s,
                                [m.id]: e.target.value,
                              }))
                            }
                            aria-label={`Stock mínimo de ${m.nombre}`}
                            className="w-16 rounded border border-line bg-surface px-1.5 py-0.5 text-right text-xs text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                          />
                        </label>
                      ) : (
                        <p className="text-xs text-faint">
                          mín. {formatQty(m.stock_minimo, m.unidad)}
                        </p>
                      )}
                    </div>
                    {esGestor && (
                      <button
                        onClick={() => abrirEditar(m)}
                        aria-label="Editar"
                        className="cursor-pointer rounded-lg p-2 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {(llegando > 0 || comprometidoQty > 0 || proy !== m.stock_actual) && (
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5 text-center">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-faint">
                          Por llegar
                        </p>
                        <p className="mt-0.5 text-sm text-fg">
                          {llegando > 0 ? formatQty(llegando, m.unidad) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-faint">
                          Comprometido
                        </p>
                        <p className="mt-0.5 text-sm text-fg">
                          {comprometidoQty > 0
                            ? formatQty(comprometidoQty, m.unidad)
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-faint">
                          Proyectado
                        </p>
                        <p
                          className={
                            proy < 0
                              ? "mt-0.5 text-sm font-semibold text-red-600 dark:text-red-400"
                              : "mt-0.5 text-sm text-fg"
                          }
                        >
                          {formatQty(proy, m.unidad)}
                        </p>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {esGestor && (
        <MaterialForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          material={editando}
          categorias={categorias}
          ubicaciones={ubicaciones}
          proveedores={proveedores}
        />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  alerta,
}: {
  label: string;
  value: string;
  alerta?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          alerta
            ? "mt-1 text-2xl font-semibold tracking-tight text-red-600 dark:text-red-400"
            : "mt-1 text-2xl font-semibold tracking-tight text-fg"
        }
      >
        {value}
      </p>
    </Card>
  );
}
