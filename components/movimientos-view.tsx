"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui";
import { MovimientoForm } from "@/components/movimiento-form";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import { formatDate, formatQty } from "@/lib/utils";
import type { MovimientoConRelaciones, Ubicacion } from "@/lib/types";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowRight,
  PackageCheck,
  Plus,
  Settings2,
} from "lucide-react";

const TIPO_META = {
  entrada: { label: "Entrada", tone: "ok" as const, Icon: ArrowDownCircle },
  salida: { label: "Salida", tone: "warn" as const, Icon: ArrowUpCircle },
  ajuste: { label: "Ajuste", tone: "neutral" as const, Icon: Settings2 },
};

type MaterialOpcion = {
  id: string;
  nombre: string;
  sku: string | null;
  unidad: string;
  stock_actual: number;
  ubicacion_id: string | null;
};

export function MovimientosView({
  movimientos,
  materiales,
  ubicaciones,
  pendientesCount = 0,
}: {
  movimientos: MovimientoConRelaciones[];
  materiales: MaterialOpcion[];
  ubicaciones: Ubicacion[];
  pendientesCount?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
            Movimientos
          </h1>
          <p className="mt-1 text-sm text-muted">
            Registra entradas, salidas y ajustes.
          </p>
        </div>
        <div className="flex gap-2">
          <BotonExportarCSV
            filename="movimientos"
            filas={movimientos.map((m) => ({
              Fecha: m.created_at,
              Material: m.materiales?.nombre ?? m.material_nombre ?? "",
              SKU: m.materiales?.sku ?? m.material_sku ?? "",
              Tipo: m.tipo,
              Cantidad: m.cantidad,
              "Costo unitario": m.costo_unitario ?? "",
              Referencia: m.referencia ?? "",
              Usuario: m.profiles?.nombre ?? "",
              Nota: m.nota ?? "",
            }))}
            label="CSV"
          />
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo
          </Button>
        </div>
      </div>

      {pendientesCount > 0 && (
        <Card className="mb-4 flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5 text-sm text-fg">
            <PackageCheck className="h-4 w-4 shrink-0 text-accent" />
            <span>
              <span className="font-semibold">{pendientesCount}</span>{" "}
              {pendientesCount === 1
                ? "salida pendiente por confirmar"
                : "salidas pendientes por confirmar"}
            </span>
          </div>
          <Link
            href="/clientes"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent hover:underline"
          >
            Ir al portal de clientes <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      )}

      <Card className="overflow-hidden">
        {movimientos.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">
            Aún no hay movimientos.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {movimientos.map((m) => {
              const meta = TIPO_META[m.tipo];
              const Icon = meta.Icon;
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-2/60"
                >
                  <Icon className="h-5 w-5 shrink-0 text-faint" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {m.materiales ? (
                        <Link
                          href={`/materiales/${m.materiales.id}`}
                          className="transition-colors hover:text-accent"
                        >
                          {m.materiales.nombre}
                        </Link>
                      ) : (
                        <span>
                          {m.material_nombre ?? "Material"}
                          <span className="ml-1.5 text-xs text-faint">
                            (eliminado)
                          </span>
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-faint">
                      {m.materiales?.sku ?? m.material_sku
                        ? `${m.materiales?.sku ?? m.material_sku} · `
                        : ""}
                      {formatDate(m.created_at)}
                      {m.referencia ? ` · ${m.referencia}` : ""}
                      {m.profiles?.nombre ? ` · ${m.profiles.nombre}` : ""}
                      {m.nota ? ` · ${m.nota}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <p className="mt-0.5 text-sm font-semibold text-fg">
                      {formatQty(m.cantidad, m.materiales?.unidad)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <MovimientoForm
        open={open}
        onClose={() => setOpen(false)}
        materiales={materiales}
        ubicaciones={ubicaciones}
      />
    </div>
  );
}
