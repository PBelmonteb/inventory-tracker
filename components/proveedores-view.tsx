"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Select } from "@/components/ui";
import {
  CasoCompraForm,
  type PrefillCasoCompra,
} from "@/components/caso-compra-form";
import { ResponsableSelect } from "@/components/responsable-select";
import { NOTIF_REFRESH_EVENT } from "@/components/notificaciones-provider";
import { SimuladorEmail } from "@/components/simulador-email";
import { RecibirCompraForm } from "@/components/recibir-compra-form";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import {
  asignarResponsableCasoCompra,
  cambiarEstadoCasoCompra,
  descartarNotificacion,
} from "@/lib/actions/compras";
import { DEMO } from "@/lib/config";
import { formatDate, formatMoney, formatQty } from "@/lib/utils";
import type { UsuarioAsignable } from "@/lib/actions/usuarios";
import type {
  CasoCompraConRelaciones,
  EstadoCasoCompra,
  NotificacionConRelaciones,
  OrigenCasoCompra,
  Proveedor,
} from "@/lib/types";
import { BellRing, Mail, PencilLine, Plus, X } from "lucide-react";

type MaterialOpcion = { id: string; nombre: string; sku: string | null };

const ESTADO_COMPRA_META: Record<
  EstadoCasoCompra,
  { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "accent" }
> = {
  pendiente: { label: "Pendiente", tone: "warn" },
  cotizando: { label: "Cotizando", tone: "accent" },
  ordenado: { label: "Ordenado", tone: "accent" },
  recibido: { label: "Recibido", tone: "ok" },
  cancelado: { label: "Cancelado", tone: "neutral" },
};

const ORIGEN_META: Record<
  OrigenCasoCompra,
  { label: string; Icon: typeof Mail; barra: string }
> = {
  manual: { label: "Manual", Icon: PencilLine, barra: "bg-faint/50" },
  stock_bajo: { label: "Alerta de stock", Icon: BellRing, barra: "bg-amber-500/70" },
  correo: { label: "Correo", Icon: Mail, barra: "bg-accent" },
};

const ABIERTOS: EstadoCasoCompra[] = ["pendiente", "cotizando", "ordenado"];

const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;

export function ProveedoresView({
  notificaciones,
  casos,
  proveedores,
  materiales,
  usuarios,
}: {
  notificaciones: NotificacionConRelaciones[];
  casos: CasoCompraConRelaciones[];
  proveedores: Proveedor[];
  materiales: MaterialOpcion[];
  usuarios: UsuarioAsignable[];
}) {
  const router = useRouter();
  const [formAbierto, setFormAbierto] = useState(false);
  const [simuladorAbierto, setSimuladorAbierto] = useState(false);
  const [prefill, setPrefill] = useState<PrefillCasoCompra | null>(null);
  const [recibiendo, setRecibiendo] = useState<CasoCompraConRelaciones | null>(
    null
  );
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  // Esta vista solo maneja alertas de stock; las de asignación (personales)
  // viven en la campana global (NotificacionesProvider/Bell), no aquí.
  const abiertas = notificaciones.filter(
    (n) => n.estado === "abierta" && n.tipo === "stock"
  );
  const casosAbiertos = casos.filter((c) => ABIERTOS.includes(c.estado));
  const montoPipeline = casosAbiertos.reduce(
    (sum, c) => sum + c.monto_estimado,
    0
  );
  const porCorreo7d = casos.filter(
    (c) =>
      c.origen === "correo" &&
      Date.now() - new Date(c.created_at).getTime() < SIETE_DIAS
  ).length;
  const porOrigen = (Object.keys(ORIGEN_META) as OrigenCasoCompra[]).map(
    (origen) => ({
      origen,
      total: casos.filter((c) => c.origen === origen).length,
    })
  );

  const casosFiltrados = casos.filter(
    (c) =>
      (!filtroProveedor || c.proveedor_id === filtroProveedor) &&
      (!filtroEstado || c.estado === filtroEstado)
  );

  function abrirDesdeNotificacion(n: NotificacionConRelaciones) {
    setPrefill({
      notificacion_id: n.id,
      proveedor_id: n.proveedor_id ?? "",
      material_id: n.material_id ?? "",
      titulo: n.materiales ? `Reabasto: ${n.materiales.nombre}` : "Reabasto",
    });
    setFormAbierto(true);
  }

  async function asignarResponsable(casoId: string, usuarioId: string) {
    const res = await asignarResponsableCasoCompra(casoId, usuarioId);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    if (usuarioId) window.dispatchEvent(new Event(NOTIF_REFRESH_EVENT));
    router.refresh();
  }

  async function descartar(id: string) {
    if (!confirm("¿Descartar esta alerta? No volverá a aparecer mientras el stock siga bajo."))
      return;
    const res = await descartarNotificacion(id);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  async function cambiarEstado(
    caso: CasoCompraConRelaciones,
    estado: EstadoCasoCompra
  ) {
    // "Recibido" genera la entrada de stock → pide cantidad y costo.
    if (estado === "recibido" && !caso.movimiento_id) {
      if (!caso.material_id) {
        alert(
          "Este caso no tiene un material asignado, así que no puede sumar stock. Asígnale un material primero."
        );
        return;
      }
      setRecibiendo(caso);
      return;
    }
    if (estado === "cancelado" && !confirm("¿Cancelar este caso de compra?"))
      return;
    const res = await cambiarEstadoCasoCompra(caso.id, estado);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
            Portal de proveedores
          </h1>
          <p className="mt-1 text-sm text-muted">
            Casos de compra y alertas para cotizar a tiempo.
          </p>
        </div>
        <div className="flex gap-2">
          {DEMO && (
            <Button
              variant="secondary"
              onClick={() => setSimuladorAbierto(true)}
            >
              <Mail className="h-4 w-4" /> Simular correo
            </Button>
          )}
          <Button
            onClick={() => {
              setPrefill(null);
              setFormAbierto(true);
            }}
          >
            <Plus className="h-4 w-4" /> Nuevo caso
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Notificaciones activas"
          value={String(abiertas.length)}
          alerta={abiertas.length > 0}
        />
        <Kpi label="Casos abiertos" value={String(casosAbiertos.length)} />
        <Kpi label="Monto en pipeline" value={formatMoney(montoPipeline)} />
        <Kpi label="Casos por correo (7 días)" value={String(porCorreo7d)} />
      </div>

      {/* Dashboard: origen de los casos */}
      <Card className="mb-6 p-4 md:p-5">
        <h2 className="mb-3 font-semibold text-fg">Origen de los casos</h2>
        {casos.length === 0 ? (
          <p className="py-2 text-sm text-faint">Aún no hay casos.</p>
        ) : (
          <>
            <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-surface-2">
              {porOrigen
                .filter((o) => o.total > 0)
                .map((o) => (
                  <div
                    key={o.origen}
                    className={ORIGEN_META[o.origen].barra}
                    style={{ width: `${(o.total / casos.length) * 100}%` }}
                  />
                ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {porOrigen.map(({ origen, total }) => {
                const { label, Icon, barra } = ORIGEN_META[origen];
                return (
                  <div key={origen} className="flex items-center gap-2.5">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${barra}`}
                    >
                      <Icon className="h-4 w-4 text-accent-fg" />
                    </span>
                    <div className="min-w-0 leading-tight">
                      <p className="text-lg font-semibold text-fg">{total}</p>
                      <p className="truncate text-xs text-muted">{label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Notificaciones de stock bajo */}
      <Card className="mb-6 p-4 md:p-5">
        <div className="mb-3 flex items-center gap-2">
          <BellRing className="h-4 w-4 text-accent" />
          <h2 className="font-semibold text-fg">Notificaciones de stock bajo</h2>
        </div>
        {abiertas.length === 0 ? (
          <p className="py-2 text-sm text-faint">
            Sin alertas de stock. Todo arriba del mínimo.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {abiertas.map((n) => (
              <li
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  {n.materiales ? (
                    <Link
                      href={`/materiales/${n.materiales.id}`}
                      className="text-sm font-medium text-fg hover:text-accent hover:underline"
                    >
                      {n.materiales.nombre}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium text-fg">Material eliminado</p>
                  )}
                  <p className="mt-0.5 text-xs text-muted">
                    {n.materiales && (
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        {formatQty(n.materiales.stock_actual)} /{" "}
                        {formatQty(n.materiales.stock_minimo, n.materiales.unidad)}
                      </span>
                    )}
                    {n.proveedores && <> · Proveedor: {n.proveedores.nombre}</>}
                    {" · "}
                    {formatDate(n.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    className="px-3 py-1.5 text-xs"
                    onClick={() => abrirDesdeNotificacion(n)}
                  >
                    Crear caso
                  </Button>
                  <button
                    onClick={() => descartar(n.id)}
                    aria-label="Descartar alerta"
                    className="cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Casos de compra */}
      <Card className="p-4 md:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-fg">Casos de compra</h2>
          <div className="flex flex-wrap gap-2">
            <BotonExportarCSV
              filename="casos-compra"
              filas={casosFiltrados.map((c) => ({
                Título: c.titulo,
                Proveedor: c.proveedores?.nombre ?? c.proveedor_nombre ?? "",
                Material: c.materiales?.nombre ?? "",
                "Monto estimado": c.monto_estimado,
                Estado: c.estado,
                Origen: c.origen,
                Referencia: c.referencia ?? "",
                Fecha: c.created_at,
              }))}
              label="CSV"
            />
            <Select
              value={filtroProveedor}
              onChange={(e) => setFiltroProveedor(e.target.value)}
              className="w-auto py-1.5 text-xs"
              aria-label="Filtrar por proveedor"
            >
              <option value="">Todos los proveedores</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
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
              {Object.entries(ESTADO_COMPRA_META).map(([valor, meta]) => (
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
            {casosFiltrados.map((c) => {
              const OrigenIcon = ORIGEN_META[c.origen].Icon;
              return (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-fg">
                    {c.titulo}
                    {c.referencia && (
                      <span className="text-xs font-normal text-faint">
                        {c.referencia}
                      </span>
                    )}
                    {c.origen !== "manual" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                        <OrigenIcon className="h-3 w-3" />
                        {ORIGEN_META[c.origen].label}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {c.proveedores?.nombre ??
                      (c.proveedor_nombre
                        ? `${c.proveedor_nombre} (eliminado)`
                        : "Proveedor eliminado")}
                    {c.materiales && <> · {c.materiales.nombre}</>}
                    {" · "}
                    {formatMoney(c.monto_estimado)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={ESTADO_COMPRA_META[c.estado].tone}>
                    {ESTADO_COMPRA_META[c.estado].label}
                  </Badge>
                  <Select
                    value={c.estado}
                    onChange={(e) =>
                      cambiarEstado(c, e.target.value as EstadoCasoCompra)
                    }
                    className="w-auto py-1 text-xs"
                    aria-label="Cambiar estado del caso"
                  >
                    {Object.entries(ESTADO_COMPRA_META).map(([valor, meta]) => (
                      <option key={valor} value={valor}>
                        {meta.label}
                      </option>
                    ))}
                  </Select>
                  <ResponsableSelect
                    usuarios={usuarios}
                    value={c.responsable_id ?? ""}
                    onChange={(usuarioId) => asignarResponsable(c.id, usuarioId)}
                    className="w-auto py-1 text-xs"
                    ariaLabel="Responsable del caso"
                  />
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </Card>

      <CasoCompraForm
        open={formAbierto}
        onClose={() => setFormAbierto(false)}
        proveedores={proveedores}
        materiales={materiales}
        usuarios={usuarios}
        prefill={prefill}
      />
      <SimuladorEmail
        open={simuladorAbierto}
        onClose={() => setSimuladorAbierto(false)}
        proveedores={proveedores}
      />
      <RecibirCompraForm
        caso={recibiendo}
        onClose={() => setRecibiendo(null)}
      />
    </div>
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
            ? "mt-1 text-2xl font-semibold tracking-tight text-red-600 dark:text-red-400"
            : "mt-1 text-2xl font-semibold tracking-tight text-fg"
        }
      >
        {value}
      </p>
    </Card>
  );
}
