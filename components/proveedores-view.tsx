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
import { MarcarOrdenadoForm } from "@/components/marcar-ordenado-form";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import { InfoTooltip } from "@/components/info-tooltip";
import { SolicitudCotizacionForm } from "@/components/solicitud-cotizacion-form";
import { CasoDetalleModal } from "@/components/caso-detalle-modal";
import { NuevoProveedorModal } from "@/components/nuevo-proveedor-modal";
import {
  asignarResponsableCasoCompra,
  cambiarEstadoCasoCompra,
  descartarNotificacion,
} from "@/lib/actions/compras";
import { revisarReposicionAutomatica } from "@/lib/actions/casos-automaticos";
import { DEMO } from "@/lib/config";
import { formatDate, formatMoney, formatQty } from "@/lib/utils";
import type { UsuarioAsignable } from "@/lib/actions/usuarios";
import type {
  CasoCompraConRelaciones,
  EstadoCasoCompra,
  MaterialConRelaciones,
  NivelRiesgoStock,
  NotificacionConRelaciones,
  OrigenCasoCompra,
  Proveedor,
} from "@/lib/types";
import {
  BellRing,
  Eye,
  Mail,
  PencilLine,
  Plus,
  RefreshCw,
  TriangleAlert,
  X,
} from "lucide-react";

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

const NIVEL_RIESGO_META: Record<
  NivelRiesgoStock,
  { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "accent" }
> = {
  critico: { label: "Riesgo crítico", tone: "danger" },
  alto: { label: "Riesgo alto", tone: "warn" },
  medio: { label: "Riesgo medio", tone: "neutral" },
};

const ABIERTOS: EstadoCasoCompra[] = ["pendiente", "cotizando", "ordenado"];

const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;

export function ProveedoresView({
  notificaciones,
  casos,
  proveedores,
  materiales,
  materialesCompletos,
  usuarios,
  verTodos,
}: {
  notificaciones: NotificacionConRelaciones[];
  casos: CasoCompraConRelaciones[];
  proveedores: Proveedor[];
  materiales: MaterialOpcion[];
  materialesCompletos: MaterialConRelaciones[];
  usuarios: UsuarioAsignable[];
  // Por defecto la lista solo trae casos abiertos + cerrados de los
  // últimos ~90 días (lib/data.ts) — este toggle pide todo el histórico.
  verTodos: boolean;
}) {
  const router = useRouter();
  const [formAbierto, setFormAbierto] = useState(false);
  const [proveedorAbierto, setProveedorAbierto] = useState(false);
  const [simuladorAbierto, setSimuladorAbierto] = useState(false);
  const [prefill, setPrefill] = useState<PrefillCasoCompra | null>(null);
  const [recibiendo, setRecibiendo] = useState<CasoCompraConRelaciones | null>(
    null
  );
  const [ordenando, setOrdenando] = useState<CasoCompraConRelaciones | null>(
    null
  );
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [cotizacionCaso, setCotizacionCaso] =
    useState<CasoCompraConRelaciones | null>(null);
  const [detalleCaso, setDetalleCaso] = useState<CasoCompraConRelaciones | null>(
    null
  );

  // Esta vista solo maneja alertas de stock; las de asignación (personales)
  // viven en la campana global (NotificacionesProvider/Bell), no aquí.
  // Excluye las que ya tienen un caso enlazado: la reposición automática
  // deja una notificación "abierta" para que la campana avise, pero ya no
  // necesita el botón "Crear caso" (crearía un duplicado del automático).
  const abiertas = notificaciones.filter(
    (n) => n.estado === "abierta" && n.tipo === "stock" && !n.caso_compra_id
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

  // Abre el formulario de correo (mailto) directo desde el nombre del caso,
  // sin tener que ir a buscar el material en su detalle. Solo tiene sentido
  // si el caso apunta a un material puntual (no los de varios ítems).
  const materialDeCaso = (caso: CasoCompraConRelaciones) =>
    caso.material_id
      ? materialesCompletos.find((m) => m.id === caso.material_id)
      : undefined;

  function abrirCotizacionDesdeCaso(caso: CasoCompraConRelaciones) {
    if (!materialDeCaso(caso)) {
      alert(
        "Este caso no tiene un material puntual asignado, así que no se puede abrir el formulario de cotización desde aquí."
      );
      return;
    }
    setCotizacionCaso(caso);
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

  async function revisarReposicion() {
    setRevisando(true);
    const res = await revisarReposicionAutomatica();
    setRevisando(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    const { casosCreados, materialesRevisados } = res.resumen;
    alert(
      casosCreados > 0
        ? `Se crearon ${casosCreados} caso(s) de compra automáticos (de ${materialesRevisados} materiales revisados).`
        : `Ningún material necesita reposición ahora mismo (${materialesRevisados} revisados).`
    );
    if (casosCreados > 0) router.refresh();
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
    // "Ordenado" sin cantidad ya capturada (convenio/reposición automática/
    // cotización) quedaría invisible para "stock por llegar" en Inventario —
    // se pide antes de completar la transición, mismo criterio que "Recibido".
    if (estado === "ordenado" && !caso.cantidad_estimada && caso.material_id) {
      setOrdenando(caso);
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
          <Button
            variant="secondary"
            onClick={revisarReposicion}
            disabled={revisando}
          >
            <RefreshCw className={`h-4 w-4 ${revisando ? "animate-spin" : ""}`} />
            Revisar reposición ahora
          </Button>
          {DEMO && (
            <Button
              variant="secondary"
              onClick={() => setSimuladorAbierto(true)}
            >
              <Mail className="h-4 w-4" /> Simular correo
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => setProveedorAbierto(true)}
          >
            <Plus className="h-4 w-4" /> Nuevo proveedor
          </Button>
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
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-fg">Casos de compra</h2>
            <Link
              href={verTodos ? "/proveedores" : "/proveedores?todos=1"}
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
                    {ABIERTOS.includes(c.estado) && materialDeCaso(c) ? (
                      <button
                        type="button"
                        onClick={() => abrirCotizacionDesdeCaso(c)}
                        title="Abrir formulario de cotización por correo"
                        className="cursor-pointer text-left hover:text-accent hover:underline"
                      >
                        {c.titulo}
                      </button>
                    ) : (
                      c.titulo
                    )}
                    {c.referencia && (
                      <span className="text-xs font-normal text-faint">
                        {c.referencia}
                      </span>
                    )}
                    {c.solicitudes_compra && (
                      <span
                        title="Cotización comparativa — hay más de un proveedor para esta necesidad"
                        className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent"
                      >
                        {c.solicitudes_compra.codigo}
                      </span>
                    )}
                    {c.origen !== "manual" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                        <OrigenIcon className="h-3 w-3" />
                        {ORIGEN_META[c.origen].label}
                      </span>
                    )}
                    {c.origen === "stock_bajo" && c.nivel_riesgo && (
                      <>
                        <Badge tone={NIVEL_RIESGO_META[c.nivel_riesgo].tone}>
                          <TriangleAlert className="h-3 w-3" />
                          {NIVEL_RIESGO_META[c.nivel_riesgo].label}
                        </Badge>
                        <InfoTooltip>
                          {c.descripcion ? (
                            <p>{c.descripcion}</p>
                          ) : (
                            <p>Caso generado automáticamente por la reposición de stock.</p>
                          )}
                          {(c.dias_cobertura_restante != null ||
                            c.lead_time_dias_usado != null) && (
                            <p className="mt-1.5 border-t border-line pt-1.5">
                              {c.dias_cobertura_restante != null && (
                                <>Cobertura al crear el caso: ~{c.dias_cobertura_restante.toFixed(1)} días. </>
                              )}
                              {c.lead_time_dias_usado != null && (
                                <>Tiempo de entrega usado: ~{c.lead_time_dias_usado.toFixed(1)} días.</>
                              )}
                            </p>
                          )}
                        </InfoTooltip>
                      </>
                    )}
                    {c.correo_enviado_at && (
                      <span
                        title={`Correo enviado automáticamente el ${formatDate(c.correo_enviado_at)}`}
                        className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted"
                      >
                        <Mail className="h-3 w-3" /> Correo enviado
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
                  <button
                    type="button"
                    onClick={() => setDetalleCaso(c)}
                    title="Ver detalle y timeline"
                    aria-label="Ver detalle y timeline"
                    className="cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
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
      <NuevoProveedorModal
        open={proveedorAbierto}
        onClose={() => setProveedorAbierto(false)}
      />
      <SimuladorEmail
        open={simuladorAbierto}
        onClose={() => setSimuladorAbierto(false)}
        proveedores={proveedores}
        casos={casos}
      />
      <RecibirCompraForm
        caso={recibiendo}
        onClose={() => setRecibiendo(null)}
      />
      <MarcarOrdenadoForm
        caso={ordenando}
        onClose={() => setOrdenando(null)}
      />
      {cotizacionCaso &&
        (() => {
          const material = materialDeCaso(cotizacionCaso);
          if (!material) return null;
          const proveedorDelMaterial = proveedores.find(
            (p) => p.id === material.proveedor_id
          );
          return (
            <SolicitudCotizacionForm
              open={Boolean(cotizacionCaso)}
              onClose={() => setCotizacionCaso(null)}
              material={material}
              proveedorNombre={
                proveedorDelMaterial?.nombre ??
                cotizacionCaso.proveedores?.nombre ??
                cotizacionCaso.proveedor_nombre ??
                null
              }
              proveedorEmail={proveedorDelMaterial?.contacto ?? null}
              casoExistente={{ id: cotizacionCaso.id, referencia: cotizacionCaso.referencia }}
            />
          );
        })()}
      <CasoDetalleModal
        open={Boolean(detalleCaso)}
        onClose={() => setDetalleCaso(null)}
        caso={detalleCaso}
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
