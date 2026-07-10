"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui";
import { MovimientoForm } from "@/components/movimiento-form";
import { MaterialForm } from "@/components/material-form";
import { SolicitudCotizacionForm } from "@/components/solicitud-cotizacion-form";
import { PrecioHistorial } from "@/components/precio-historial";
import { TransferenciaForm } from "@/components/transferencia-form";
import { StockPorUbicacionCard } from "@/components/stock-por-ubicacion";
import { BomEditor } from "@/components/bom-editor";
import { eliminarMaterial } from "@/lib/actions/materiales";
import { formatDate, formatMoney, formatQty, nivelStock } from "@/lib/utils";
import type {
  BomItemConMaterial,
  Categoria,
  HistorialPrecio,
  MaterialConRelaciones,
  MovimientoConRelaciones,
  Proveedor,
  StockPorUbicacion,
  Ubicacion,
} from "@/lib/types";
import {
  ArrowLeft,
  ArrowDownCircle,
  ArrowRightLeft,
  ArrowUpCircle,
  Mail,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";

const TIPO_META = {
  entrada: { label: "Entrada", tone: "ok" as const, Icon: ArrowDownCircle },
  salida: { label: "Salida", tone: "warn" as const, Icon: ArrowUpCircle },
  ajuste: { label: "Ajuste", tone: "neutral" as const, Icon: Settings2 },
};

export function MaterialDetail({
  material,
  movimientos,
  categorias,
  ubicaciones,
  proveedores,
  historial,
  comprometido,
  stockPorUbicacion,
  bom,
  materialesDisponibles,
  esGestor,
}: {
  material: MaterialConRelaciones;
  movimientos: MovimientoConRelaciones[];
  categorias: Categoria[];
  ubicaciones: Ubicacion[];
  proveedores: Proveedor[];
  historial: HistorialPrecio[];
  comprometido: number;
  stockPorUbicacion: StockPorUbicacion[];
  bom: BomItemConMaterial[];
  materialesDisponibles: MaterialConRelaciones[];
  esGestor: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [movOpen, setMovOpen] = useState(false);
  const [trasladoOpen, setTrasladoOpen] = useState(false);

  // Si llega desde el escáner (?mov=1), abre el formulario de movimiento.
  useEffect(() => {
    if (searchParams.get("mov") === "1") setMovOpen(true);
  }, [searchParams]);
  const [editOpen, setEditOpen] = useState(false);
  const [cotizOpen, setCotizOpen] = useState(false);
  const nivel = nivelStock(material);
  const bajo = nivel === "bajo";
  const aviso = nivel === "aviso";
  const proveedor =
    proveedores.find((p) => p.id === material.proveedor_id) ?? null;

  async function borrar() {
    if (
      !confirm(
        `¿Dar de baja "${material.nombre}"? Se quitará del inventario, pero su historial de movimientos se conserva.`
      )
    )
      return;
    const res = await eliminarMaterial(material.id);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.push("/inventario");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <Link
        href="/inventario"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> Inventario
      </Link>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Resumen */}
        <Card className="p-5 md:col-span-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-fg">
                {material.nombre}
              </h1>
              {material.sku && (
                <p className="text-sm text-faint">{material.sku}</p>
              )}
            </div>
            {bajo ? (
              <Badge tone="danger">Stock bajo</Badge>
            ) : aviso ? (
              <Badge tone="warn">Por agotarse</Badge>
            ) : (
              <Badge tone="ok">OK</Badge>
            )}
          </div>

          <div className="my-4 rounded-xl border border-line bg-surface-2/60 p-4 text-center">
            <p className="text-[11px] uppercase tracking-wide text-faint">
              Stock actual
            </p>
            <p
              className={
                bajo
                  ? "text-3xl font-semibold tracking-tight text-red-600 dark:text-red-400"
                  : aviso
                    ? "text-3xl font-semibold tracking-tight text-amber-600 dark:text-amber-400"
                    : "text-3xl font-semibold tracking-tight text-fg"
              }
            >
              {formatQty(material.stock_actual, material.unidad)}
            </p>
            <p className="text-xs text-faint">
              mínimo {formatQty(material.stock_minimo, material.unidad)}
            </p>
          </div>

          {comprometido > 0 && (
            <div className="my-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-line bg-surface-2/40 p-2">
                <p className="text-[10px] uppercase tracking-wide text-faint">
                  Físico
                </p>
                <p className="mt-0.5 text-sm font-semibold text-fg">
                  {formatQty(material.stock_actual, material.unidad)}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-surface-2/40 p-2">
                <p className="text-[10px] uppercase tracking-wide text-faint">
                  Comprometido
                </p>
                <p className="mt-0.5 text-sm font-semibold text-amber-600 dark:text-amber-400">
                  {formatQty(comprometido, material.unidad)}
                </p>
              </div>
              <div className="rounded-lg border border-line bg-surface-2/40 p-2">
                <p className="text-[10px] uppercase tracking-wide text-faint">
                  Disponible
                </p>
                <p
                  className={
                    material.stock_actual - comprometido < 0
                      ? "mt-0.5 text-sm font-semibold text-red-600 dark:text-red-400"
                      : "mt-0.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
                  }
                >
                  {formatQty(material.stock_actual - comprometido, material.unidad)}
                </p>
              </div>
            </div>
          )}

          {(bajo || aviso) && (
            <button
              onClick={() => setCotizOpen(true)}
              className="mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
            >
              <Mail className="h-4 w-4" />
              Solicitar cotización
              {proveedor ? ` a ${proveedor.nombre}` : ""}
            </button>
          )}

          <dl className="space-y-2.5 text-sm">
            <Row label="Categoría" value={material.categorias?.nombre} />
            <Row label="Ubicación" value={material.ubicaciones?.nombre} />
            <Row label="Proveedor" value={material.proveedores?.nombre} />
            <Row
              label="Costo unitario"
              value={formatMoney(material.costo_unitario)}
            />
            <Row
              label="Valor en stock"
              value={formatMoney(material.stock_actual * material.costo_unitario)}
            />
            {material.descripcion && (
              <Row label="Descripción" value={material.descripcion} />
            )}
          </dl>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => setMovOpen(true)}>
              <Plus className="h-4 w-4" /> Movimiento
            </Button>
            {ubicaciones.length > 1 && (
              <Button variant="secondary" onClick={() => setTrasladoOpen(true)}>
                <ArrowRightLeft className="h-4 w-4" /> Trasladar
              </Button>
            )}
            {!bajo && !aviso && (
              <Button variant="secondary" onClick={() => setCotizOpen(true)}>
                <Mail className="h-4 w-4" /> Solicitar cotización
              </Button>
            )}
            {esGestor && (
              <>
                <Button variant="secondary" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
                <Button variant="ghost" onClick={borrar} aria-label="Eliminar">
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </>
            )}
          </div>
        </Card>

        {/* Historial */}
        <Card className="p-5 md:col-span-2">
          <h2 className="mb-3 font-semibold text-fg">Historial de movimientos</h2>
          {movimientos.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              Sin movimientos todavía.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {movimientos.map((m) => {
                const meta = TIPO_META[m.tipo];
                const Icon = meta.Icon;
                return (
                  <li key={m.id} className="flex items-center gap-3 py-3">
                    <Icon className="h-5 w-5 shrink-0 text-faint" />
                    <div className="flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <span className="text-fg">
                          {formatQty(m.cantidad, material.unidad)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-faint">
                        {formatDate(m.created_at)}
                        {m.referencia ? ` · ${m.referencia}` : ""}
                        {m.profiles?.nombre ? ` · ${m.profiles.nombre}` : ""}
                        {m.nota ? ` · ${m.nota}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <PrecioHistorial material={material} historial={historial} />

      <StockPorUbicacionCard
        filas={stockPorUbicacion}
        unidad={material.unidad}
      />

      <BomEditor
        material={material}
        bom={bom}
        materialesDisponibles={materialesDisponibles}
        esGestor={esGestor}
      />

      <MovimientoForm
        open={movOpen}
        onClose={() => setMovOpen(false)}
        materiales={[]}
        materialFijo={{
          id: material.id,
          nombre: material.nombre,
          sku: material.sku,
          unidad: material.unidad,
          stock_actual: material.stock_actual,
          ubicacion_id: material.ubicacion_id,
        }}
        ubicaciones={ubicaciones}
      />
      <TransferenciaForm
        open={trasladoOpen}
        onClose={() => setTrasladoOpen(false)}
        material={{
          id: material.id,
          nombre: material.nombre,
          unidad: material.unidad,
          ubicacion_id: material.ubicacion_id,
        }}
        ubicaciones={ubicaciones}
      />
      {esGestor && (
        <MaterialForm
          open={editOpen}
          onClose={() => setEditOpen(false)}
          material={material}
          categorias={categorias}
          ubicaciones={ubicaciones}
          proveedores={proveedores}
        />
      )}
      <SolicitudCotizacionForm
        open={cotizOpen}
        onClose={() => setCotizOpen(false)}
        material={material}
        proveedorNombre={proveedor?.nombre ?? material.proveedores?.nombre ?? null}
        proveedorEmail={proveedor?.contacto ?? null}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-fg">{value ?? "—"}</dd>
    </div>
  );
}
