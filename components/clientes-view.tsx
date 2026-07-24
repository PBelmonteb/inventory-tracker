"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { CasoVentaForm } from "@/components/caso-venta-form";
import { CasoVentaDetalleModal } from "@/components/caso-venta-detalle-modal";
import { ResponsableSelect } from "@/components/responsable-select";
import { NOTIF_REFRESH_EVENT } from "@/components/notificaciones-provider";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import {
  asignarResponsableCasoVenta,
  asignarResponsableSalidaPendiente,
  cambiarEstadoCasoVenta,
  cancelarSalidaPendiente,
  confirmarSalidaPendiente,
} from "@/lib/actions/ventas";
import { crearCatalogo, eliminarCatalogo } from "@/lib/actions/catalogos";
import { formatMoney, formatQty } from "@/lib/utils";
import type { UsuarioAsignable } from "@/lib/actions/usuarios";
import type {
  CasoVentaConRelaciones,
  Cliente,
  EstadoCasoVenta,
  SalidaPendienteConRelaciones,
} from "@/lib/types";
import { Eye, PackageCheck, Plus, Trash2 } from "lucide-react";

type MaterialOpcion = {
  id: string;
  nombre: string;
  sku: string | null;
  unidad: string;
  stock_actual: number;
};

const ESTADO_VENTA_META: Record<
  EstadoCasoVenta,
  { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "accent" }
> = {
  cotizacion: { label: "Cotización", tone: "neutral" },
  confirmado: { label: "Confirmado", tone: "accent" },
  en_produccion: { label: "En producción", tone: "warn" },
  entregado: { label: "Entregado", tone: "ok" },
  cancelado: { label: "Cancelado", tone: "danger" },
};

const ACTIVOS: EstadoCasoVenta[] = ["cotizacion", "confirmado", "en_produccion"];

export function ClientesView({
  clientes,
  casos,
  salidasPendientes,
  materiales,
  usuarios,
  verTodos,
}: {
  clientes: Cliente[];
  casos: CasoVentaConRelaciones[];
  salidasPendientes: SalidaPendienteConRelaciones[];
  materiales: MaterialOpcion[];
  usuarios: UsuarioAsignable[];
  // Por defecto la lista solo trae casos abiertos + cerrados de los
  // últimos ~90 días (lib/data.ts) — este toggle pide todo el histórico.
  verTodos: boolean;
}) {
  const router = useRouter();
  const [formAbierto, setFormAbierto] = useState(false);
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [detalleCaso, setDetalleCaso] = useState<CasoVentaConRelaciones | null>(
    null
  );
  const [errorSalida, setErrorSalida] = useState<{
    id: string;
    mensaje: string;
  } | null>(null);
  // Cantidad a confirmar por salida pendiente (editable) — permite entregas
  // parciales en vez de forzar todo-o-nada. Sin tocar = confirma todo.
  const [cantidades, setCantidades] = useState<Record<string, string>>({});

  const pendientes = salidasPendientes.filter((s) => s.estado === "pendiente");
  const casosActivos = casos.filter((c) => ACTIVOS.includes(c.estado));
  const montoPipeline = casosActivos.reduce((sum, c) => sum + c.monto, 0);

  const casosFiltrados = casos.filter(
    (c) =>
      (!filtroCliente || c.cliente_id === filtroCliente) &&
      (!filtroEstado || c.estado === filtroEstado)
  );

  async function cambiarEstado(id: string, estado: EstadoCasoVenta) {
    if (
      estado === "entregado" &&
      !confirm(
        "Se crearán salidas pendientes por cada material del caso. ¿Continuar?"
      )
    )
      return;
    if (estado === "cancelado" && !confirm("¿Cancelar este caso de venta?"))
      return;
    const res = await cambiarEstadoCasoVenta(id, estado);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  async function confirmarSalida(sp: SalidaPendienteConRelaciones) {
    setErrorSalida(null);
    const raw = cantidades[sp.id];
    const cantidad = raw !== undefined && raw !== "" ? Number(raw) : sp.cantidad;
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      setErrorSalida({ id: sp.id, mensaje: "La cantidad debe ser mayor a cero" });
      return;
    }
    if (cantidad > sp.cantidad) {
      setErrorSalida({
        id: sp.id,
        mensaje: `No puede confirmar más de lo pendiente (${sp.cantidad})`,
      });
      return;
    }
    const res = await confirmarSalidaPendiente(sp.id, cantidad);
    if (!res.ok) {
      setErrorSalida({ id: sp.id, mensaje: res.error });
      return;
    }
    setCantidades((c) => {
      const { [sp.id]: _quitar, ...resto } = c;
      return resto;
    });
    router.refresh();
  }

  async function cancelarSalida(id: string) {
    if (!confirm("¿Cancelar esta salida pendiente? No se descontará stock."))
      return;
    const res = await cancelarSalidaPendiente(id);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  async function asignarResponsableCV(casoId: string, usuarioId: string) {
    const res = await asignarResponsableCasoVenta(casoId, usuarioId);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    if (usuarioId) window.dispatchEvent(new Event(NOTIF_REFRESH_EVENT));
    router.refresh();
  }

  async function asignarResponsableSP(id: string, usuarioId: string) {
    const res = await asignarResponsableSalidaPendiente(id, usuarioId);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    if (usuarioId) window.dispatchEvent(new Event(NOTIF_REFRESH_EVENT));
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
            Portal de clientes
          </h1>
          <p className="mt-1 text-sm text-muted">
            Casos de venta y entregas por confirmar.
          </p>
        </div>
        <Button onClick={() => setFormAbierto(true)}>
          <Plus className="h-4 w-4" /> Nuevo caso de venta
        </Button>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Casos activos" value={String(casosActivos.length)} />
        <Kpi label="Monto en pipeline" value={formatMoney(montoPipeline)} />
        <Kpi
          label="Salidas por confirmar"
          value={String(pendientes.length)}
          alerta={pendientes.length > 0}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {/* Salidas pendientes */}
      <Card className="mb-6 p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-accent" />
            <h2 className="font-semibold text-fg">Salidas pendientes</h2>
          </div>
          <BotonExportarCSV
            filename="salidas-pendientes"
            filas={pendientes.map((sp) => ({
              Material: sp.materiales?.nombre ?? "",
              SKU: sp.materiales?.sku ?? "",
              Cantidad: sp.cantidad,
              Cliente: sp.casos_venta?.cliente_nombre ?? "",
              Caso: sp.casos_venta?.titulo ?? "",
              Estado: sp.estado,
              Fecha: sp.created_at,
            }))}
            label="CSV"
          />
        </div>
        {pendientes.length === 0 ? (
          <p className="py-2 text-sm text-faint">No hay salidas pendientes.</p>
        ) : (
          <ul className="divide-y divide-line">
            {pendientes.map((sp) => (
              <li key={sp.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">
                      {sp.materiales ? (
                        <Link
                          href={`/materiales/${sp.materiales.id}`}
                          className="hover:text-accent hover:underline"
                        >
                          {sp.materiales.nombre}
                        </Link>
                      ) : (
                        "Material eliminado"
                      )}{" "}
                      <span className="font-semibold text-accent">
                        × {formatQty(sp.cantidad, sp.materiales?.unidad)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {sp.casos_venta?.titulo}
                      {sp.casos_venta?.referencia && (
                        <> · {sp.casos_venta.referencia}</>
                      )}
                      {sp.casos_venta?.cliente_nombre && (
                        <> · {sp.casos_venta.cliente_nombre}</>
                      )}
                      {sp.materiales && (
                        <>
                          {" · Disponible: "}
                          {formatQty(
                            sp.materiales.stock_actual,
                            sp.materiales.unidad
                          )}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ResponsableSelect
                      usuarios={usuarios}
                      value={sp.responsable_id ?? ""}
                      onChange={(usuarioId) => asignarResponsableSP(sp.id, usuarioId)}
                      className="w-auto py-1 text-xs"
                      ariaLabel="Responsable de la salida"
                    />
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      max={sp.cantidad}
                      value={cantidades[sp.id] ?? String(sp.cantidad)}
                      onChange={(e) =>
                        setCantidades((c) => ({ ...c, [sp.id]: e.target.value }))
                      }
                      aria-label="Cantidad a confirmar"
                      className="w-20 px-2 py-1.5 text-xs"
                    />
                    <Button
                      className="px-3 py-1.5 text-xs"
                      onClick={() => confirmarSalida(sp)}
                    >
                      Confirmar salida
                    </Button>
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => cancelarSalida(sp.id)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
                {errorSalida?.id === sp.id && (
                  <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                    {errorSalida.mensaje}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Casos de venta */}
      <Card className="mb-6 p-4 md:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-fg">Casos de venta</h2>
            <Link
              href={verTodos ? "/clientes" : "/clientes?todos=1"}
              className="text-xs font-medium text-accent hover:underline"
              title={
                verTodos
                  ? "Mostrando todo el histórico"
                  : "Por defecto solo se muestran los casos abiertos y los cerrados de los últimos 90 días"
              }
            >
              {verTodos ? "Ver solo recientes" : "Ver todos (histórico)"}
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            <BotonExportarCSV
              filename="casos-venta"
              filas={casosFiltrados.map((c) => ({
                Título: c.titulo,
                Cliente: c.clientes?.nombre ?? c.cliente_nombre ?? "",
                Monto: c.monto,
                Estado: c.estado,
                Referencia: c.referencia ?? "",
                Fecha: c.created_at,
              }))}
              label="CSV"
            />
            <Select
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="w-auto py-1.5 text-xs"
              aria-label="Filtrar por cliente"
            >
              <option value="">Todos los clientes</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
            <Select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-auto py-1.5 text-xs"
              aria-label="Filtrar por estado"
            >
              <option value="">Todos los estados</option>
              {Object.entries(ESTADO_VENTA_META).map(([valor, meta]) => (
                <option key={valor} value={valor}>
                  {meta.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {casosFiltrados.length === 0 ? (
          <p className="py-2 text-sm text-faint">No hay casos con esos filtros.</p>
        ) : (
          <ul className="divide-y divide-line">
            {casosFiltrados.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    <button
                      type="button"
                      onClick={() => setDetalleCaso(c)}
                      title="Ver detalle y timeline"
                      className="cursor-pointer text-left hover:text-accent hover:underline"
                    >
                      {c.titulo}
                    </button>
                    {c.referencia && (
                      <span className="ml-2 text-xs font-normal text-faint">
                        {c.referencia}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {c.clientes?.nombre ??
                      (c.cliente_nombre
                        ? `${c.cliente_nombre} (eliminado)`
                        : "Cliente eliminado")}
                    {" · "}
                    {formatMoney(c.monto)}
                  </p>
                  {c.items.length > 0 && (
                    <p className="mt-0.5 text-xs text-faint">
                      {c.items
                        .map(
                          (i) =>
                            `${i.materiales?.nombre ?? "Material"} ×${formatQty(i.cantidad)}`
                        )
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDetalleCaso(c)}
                    title="Ver detalle y timeline"
                    aria-label="Ver detalle y timeline"
                    className="cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <Badge tone={ESTADO_VENTA_META[c.estado].tone}>
                    {ESTADO_VENTA_META[c.estado].label}
                  </Badge>
                  <Select
                    value={c.estado}
                    onChange={(e) =>
                      cambiarEstado(c.id, e.target.value as EstadoCasoVenta)
                    }
                    className="w-auto py-1 text-xs"
                    aria-label="Cambiar estado del caso"
                  >
                    {Object.entries(ESTADO_VENTA_META).map(([valor, meta]) => (
                      <option key={valor} value={valor}>
                        {meta.label}
                      </option>
                    ))}
                  </Select>
                  <ResponsableSelect
                    usuarios={usuarios}
                    value={c.responsable_id ?? ""}
                    onChange={(usuarioId) => asignarResponsableCV(c.id, usuarioId)}
                    className="w-auto py-1 text-xs"
                    ariaLabel="Responsable del caso"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Clientes */}
      <div className="grid gap-4 md:grid-cols-2">
        <ClientesCard
          clientes={clientes}
          onSelectCliente={(id) => setFiltroCliente(id)}
        />
      </div>

      <CasoVentaForm
        open={formAbierto}
        onClose={() => setFormAbierto(false)}
        clientes={clientes}
        materiales={materiales}
        usuarios={usuarios}
      />
      <CasoVentaDetalleModal
        open={!!detalleCaso}
        onClose={() => setDetalleCaso(null)}
        caso={detalleCaso}
      />
    </div>
  );
}

function ClientesCard({
  clientes,
  onSelectCliente,
}: {
  clientes: Cliente[];
  onSelectCliente: (id: string) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function agregar(formData: FormData) {
    setError(null);
    setCargando(true);
    const res = await crearCatalogo("clientes", formData);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    (document.getElementById("form-clientes") as HTMLFormElement)?.reset();
    router.refresh();
  }

  async function borrar(id: string) {
    if (!confirm("¿Eliminar este cliente? Sus casos quedarán sin cliente."))
      return;
    const res = await eliminarCatalogo("clientes", id);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card className="flex flex-col p-4">
      <h2 className="mb-3 font-semibold text-fg">Clientes</h2>

      <form id="form-clientes" action={agregar} className="mb-3 space-y-2">
        <Input name="nombre" placeholder="Nombre del cliente" required />
        <Input name="contacto" placeholder="Contacto (opcional)" />
        <Button type="submit" className="w-full" disabled={cargando}>
          <Plus className="h-4 w-4" /> Agregar
        </Button>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </form>

      <ul className="divide-y divide-line">
        {clientes.length === 0 && (
          <li className="py-2 text-sm text-faint">Sin clientes</li>
        )}
        {clientes.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2">
            <button
              type="button"
              onClick={() => onSelectCliente(c.id)}
              title="Ver casos de venta de este cliente"
              className="cursor-pointer text-left hover:text-accent"
            >
              <p className="text-sm text-fg hover:underline">{c.nombre}</p>
              {c.contacto && <p className="text-xs text-faint">{c.contacto}</p>}
            </button>
            <button
              onClick={() => borrar(c.id)}
              aria-label="Eliminar"
              className="cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Kpi({
  label,
  value,
  alerta,
  className,
}: {
  label: string;
  value: string;
  alerta?: boolean;
  className?: string;
}) {
  return (
    <Card className={`p-4 ${className ?? ""}`}>
      <p className="text-xs text-muted">{label}</p>
      <p
        className={
          alerta
            ? "mt-1 text-2xl font-semibold tracking-tight text-amber-600 dark:text-amber-400"
            : "mt-1 text-2xl font-semibold tracking-tight text-fg"
        }
      >
        {value}
      </p>
    </Card>
  );
}
