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
  Ubicacion,
} from "@/lib/types";
import { Plus, Search, Pencil, AlertTriangle, Download } from "lucide-react";

export function InventarioView({
  materiales,
  categorias,
  ubicaciones,
  proveedores,
  comprometido = {},
  esGestor,
}: {
  materiales: MaterialConRelaciones[];
  categorias: Categoria[];
  ubicaciones: Ubicacion[];
  proveedores: Proveedor[];
  comprometido?: Record<string, number>;
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
      if (ubiFiltro && m.ubicacion_id !== ubiFiltro) return false;
      if (estadoFiltro && nivelStock(m) !== estadoFiltro) return false;
      return true;
    });
    const ordenar: Record<typeof orden, (a: MaterialConRelaciones, b: MaterialConRelaciones) => number> = {
      nombre: (a, b) => a.nombre.localeCompare(b.nombre),
      stock_desc: (a, b) => b.stock_actual - a.stock_actual,
      stock_asc: (a, b) => a.stock_actual - b.stock_actual,
      valor_desc: (a, b) =>
        b.stock_actual * b.costo_unitario - a.stock_actual * a.costo_unitario,
    };
    return [...lista].sort(ordenar[orden]);
  }, [materiales, busqueda, catFiltro, ubiFiltro, estadoFiltro, orden]);

  const bajos = materiales.filter((m) => nivelStock(m) === "bajo").length;
  const valorTotal = materiales.reduce(
    (acc, m) => acc + m.stock_actual * m.costo_unitario,
    0
  );

  function filasInventario() {
    return filtrados.map((m) => ({
      SKU: m.sku ?? "",
      Nombre: m.nombre,
      Categoría: m.categorias?.nombre ?? "",
      Ubicación: m.ubicaciones?.nombre ?? "",
      Proveedor: m.proveedores?.nombre ?? "",
      Unidad: m.unidad,
      "Stock actual": m.stock_actual,
      "Stock mínimo": m.stock_minimo,
      "Costo (WAC)": m.costo_unitario,
      "Precio venta": m.precio_venta,
      Margen: Math.round((m.precio_venta - m.costo_unitario) * 100) / 100,
      "Valor en stock":
        Math.round(m.stock_actual * m.costo_unitario * 100) / 100,
    }));
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
      Ubicación: m.ubicaciones?.nombre ?? "",
      Proveedor: m.proveedores?.nombre ?? "",
      Unidad: m.unidad,
      "Stock actual": m.stock_actual,
      "Stock mínimo": m.stock_minimo,
      "Costo (WAC)": m.costo_unitario,
      "Precio venta": m.precio_venta,
      Margen: Math.round((m.precio_venta - m.costo_unitario) * 100) / 100,
      "Valor en stock": Math.round(m.stock_actual * m.costo_unitario * 100) / 100,
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
      { wch: 12 }, // Stock mínimo
      { wch: 12 }, // Costo (WAC)
      { wch: 12 }, // Precio venta
      { wch: 12 }, // Margen
      { wch: 15 }, // Valor en stock
    ];

    // Formatos numéricos: moneda en columnas de dinero, miles en stock.
    const MONEDA = '"$"#,##0.00';
    const CANTIDAD = "#,##0.###";
    const colMoneda = [8, 9, 10, 11];
    const colCantidad = [6, 7];
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
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-surface-2/50 text-left text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-4 py-3 font-medium">Material</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 font-medium">Ubicación</th>
                  <th className="px-4 py-3 text-right font-medium">Stock</th>
                  <th className="px-4 py-3 text-right font-medium">Mínimo</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtrados.map((m) => {
                  const nivel = nivelStock(m);
                  const bajo = nivel === "bajo";
                  const aviso = nivel === "aviso";
                  const disponible = m.stock_actual - (comprometido[m.id] ?? 0);
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
                        {m.ubicaciones?.nombre ?? "—"}
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
                            {formatQty(m.stock_actual, m.unidad)}
                          </span>
                        </span>
                        {(comprometido[m.id] ?? 0) > 0 && (
                          <p
                            className={
                              disponible < 0
                                ? "mt-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400"
                                : "mt-0.5 text-[11px] text-faint"
                            }
                          >
                            disp. {formatQty(disponible, m.unidad)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-faint">
                        {formatQty(m.stock_minimo, m.unidad)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted">
                        {formatMoney(m.stock_actual * m.costo_unitario)}
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
          </Card>

          {/* Tarjetas móvil */}
          <div className="space-y-2.5 md:hidden">
            {filtrados.map((m) => {
              const nivel = nivelStock(m);
              const bajo = nivel === "bajo";
              const aviso = nivel === "aviso";
              const disponible = m.stock_actual - (comprometido[m.id] ?? 0);
              return (
                <Card key={m.id} className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/materiales/${m.id}`} className="flex-1">
                      <p className="font-medium text-fg">{m.nombre}</p>
                      <p className="mt-0.5 text-xs text-faint">
                        {m.sku ? `${m.sku} · ` : ""}
                        {m.categorias?.nombre ?? "Sin categoría"} ·{" "}
                        {m.ubicaciones?.nombre ?? "Sin ubicación"}
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
                        {formatQty(m.stock_actual, m.unidad)}
                      </p>
                      <p className="text-xs text-faint">
                        mín. {formatQty(m.stock_minimo, m.unidad)}
                        {(comprometido[m.id] ?? 0) > 0 && (
                          <>
                            {" · "}
                            <span
                              className={
                                disponible < 0
                                  ? "font-semibold text-red-600 dark:text-red-400"
                                  : undefined
                              }
                            >
                              disp. {formatQty(disponible, m.unidad)}
                            </span>
                          </>
                        )}
                      </p>
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
