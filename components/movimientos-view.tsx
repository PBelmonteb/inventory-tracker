"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { MovimientoForm } from "@/components/movimiento-form";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import { VistasGuardadas } from "@/components/vistas-guardadas";
import { formatDate, formatQty } from "@/lib/utils";
import type { MovimientoConRelaciones, Ubicacion, VistaGuardada } from "@/lib/types";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowRight,
  PackageCheck,
  Plus,
  Search,
  Settings2,
  X,
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

type UsuarioOpcion = { id: string; nombre: string };

export function MovimientosView({
  movimientos,
  materiales,
  ubicaciones,
  usuarios,
  pendientesCount = 0,
  vistas,
}: {
  movimientos: MovimientoConRelaciones[];
  materiales: MaterialOpcion[];
  ubicaciones: Ubicacion[];
  usuarios: UsuarioOpcion[];
  pendientesCount?: number;
  vistas: VistaGuardada[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Texto/cantidad se escriben con debounce (evita una búsqueda por cada
  // tecla); usuario/ubicación/fecha aplican de inmediato (son selects, no
  // hay "a medio escribir"). Todo vive en la URL, no en estado ajeno —
  // así el filtro sobrevive un refresh y se puede compartir el link.
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [referencia, setReferencia] = useState(searchParams.get("referencia") ?? "");
  const [cantidad, setCantidad] = useState(searchParams.get("cantidad") ?? "");
  const primerRender = useRef(true);

  function aplicarFiltro(cambios: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) params.set(clave, valor);
      else params.delete(clave);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      return;
    }
    const t = setTimeout(() => {
      aplicarFiltro({ q: q || null, referencia: referencia || null, cantidad: cantidad || null });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, referencia, cantidad]);

  const hayFiltros =
    !!searchParams.get("q") ||
    !!searchParams.get("referencia") ||
    !!searchParams.get("cantidad") ||
    !!searchParams.get("usuario") ||
    !!searchParams.get("ubicacion") ||
    !!searchParams.get("fecha");

  function limpiarFiltros() {
    setQ("");
    setReferencia("");
    setCantidad("");
    router.push(pathname);
  }

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
          <VistasGuardadas pagina="movimientos" vistas={vistas} />
          <BotonExportarCSV
            filename="movimientos"
            filas={movimientos.map((m) => ({
              Fecha: m.created_at,
              Material: m.materiales?.nombre ?? m.material_nombre ?? "",
              SKU: m.materiales?.sku ?? m.material_sku ?? "",
              Tipo: m.tipo,
              Cantidad: m.cantidad,
              "Costo unitario": m.costo_unitario ?? "",
              Ubicación: m.ubicaciones?.nombre ?? "Ubicación por defecto",
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

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              className="pl-9"
              placeholder="Material o SKU..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Input
            className="w-40"
            placeholder="Caso / referencia"
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
          <Input
            className="w-28"
            type="number"
            step="any"
            placeholder="Cantidad"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
          <Select
            className="w-auto"
            value={searchParams.get("usuario") ?? ""}
            onChange={(e) => aplicarFiltro({ usuario: e.target.value || null })}
          >
            <option value="">Todos los usuarios</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </Select>
          <Select
            className="w-auto"
            value={searchParams.get("ubicacion") ?? ""}
            onChange={(e) => aplicarFiltro({ ubicacion: e.target.value || null })}
          >
            <option value="">Todas las ubicaciones</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </Select>
          <Input
            className="w-auto"
            type="date"
            value={searchParams.get("fecha") ?? ""}
            onChange={(e) => aplicarFiltro({ fecha: e.target.value || null })}
          />
          {hayFiltros && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="inline-flex cursor-pointer items-center gap-1 text-sm text-accent hover:underline"
            >
              <X className="h-3.5 w-3.5" />
              Limpiar
            </button>
          )}
        </div>
      </Card>

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
            {hayFiltros
              ? "Nada coincide con estos filtros."
              : "Aún no hay movimientos."}
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
                      {` · ${m.ubicaciones?.nombre ?? "Ubicación por defecto"}`}
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
