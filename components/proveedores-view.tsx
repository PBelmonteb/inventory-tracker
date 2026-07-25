"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import {
  CasoCompraForm,
  type PrefillCasoCompra,
} from "@/components/caso-compra-form";
import { CasoCompraCard } from "@/components/caso-compra-card";
import { NOTIF_REFRESH_EVENT } from "@/components/notificaciones-provider";
import { SimuladorEmail } from "@/components/simulador-email";
import { RecibirCompraForm } from "@/components/recibir-compra-form";
import { MarcarOrdenadoForm } from "@/components/marcar-ordenado-form";
import { AutorizarCasoForm } from "@/components/autorizar-caso-form";
import { EditarCasoRechazadoForm } from "@/components/editar-caso-rechazado-form";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import { SolicitudCotizacionForm } from "@/components/solicitud-cotizacion-form";
import { CasoDetalleModal } from "@/components/caso-detalle-modal";
import { NuevoProveedorModal } from "@/components/nuevo-proveedor-modal";
import {
  asignarResponsableCasoCompra,
  cambiarEstadoCasoCompra,
  descartarNotificacion,
} from "@/lib/actions/compras";
import { eliminarCasoCompra } from "@/lib/actions/autorizacion";
import { revisarReposicionAutomatica } from "@/lib/actions/casos-automaticos";
import { esConvenioVigente } from "@/lib/convenios";
import { DEMO } from "@/lib/config";
import { formatDate, formatMoney, formatQty, normalizarTexto } from "@/lib/utils";
import type { UsuarioAsignable } from "@/lib/actions/usuarios";
import type {
  CasoCompraConRelaciones,
  ConvenioConRelaciones,
  EstadoCasoCompra,
  MaterialConRelaciones,
  NotificacionConRelaciones,
  OrigenCasoCompra,
  Proveedor,
} from "@/lib/types";
import {
  Ban,
  BellRing,
  Mail,
  PackageCheck,
  Pencil,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

type MaterialOpcion = { id: string; nombre: string; sku: string | null };

const ORIGEN_META: Record<
  OrigenCasoCompra,
  { label: string; Icon: typeof Mail; barra: string }
> = {
  manual: { label: "Manual", Icon: PencilLine, barra: "bg-faint/50" },
  stock_bajo: { label: "Alerta de stock", Icon: BellRing, barra: "bg-amber-500/70" },
  correo: { label: "Correo", Icon: Mail, barra: "bg-accent" },
};

const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;
// "cotizando" es un estado legado (ver lib/types.ts) — se trata igual que
// "pendiente" en todas partes de esta vista.
const PENDIENTE_ESTADOS: EstadoCasoCompra[] = ["pendiente", "cotizando"];
const ABIERTOS: EstadoCasoCompra[] = [
  "pendiente",
  "cotizando",
  "por_autorizar",
  "ordenado",
];

type TabId = "pendientes" | "por_autorizar" | "en_espera" | "rechazados" | "casos_del_mes";

export function ProveedoresView({
  notificaciones,
  casos,
  proveedores,
  materiales,
  materialesCompletos,
  convenios,
  usuarios,
  esGestor,
  esAdmin,
  umbralAdmin,
}: {
  notificaciones: NotificacionConRelaciones[];
  casos: CasoCompraConRelaciones[];
  proveedores: Proveedor[];
  materiales: MaterialOpcion[];
  materialesCompletos: MaterialConRelaciones[];
  convenios: ConvenioConRelaciones[];
  usuarios: UsuarioAsignable[];
  esGestor: boolean;
  // Arriba de umbralAdmin, un gerente ya no puede autorizar por su cuenta
  // — solo un admin (lib/actions/autorizacion.ts). Rechazar sigue abierto
  // a cualquier gestor, no compromete dinero.
  esAdmin: boolean;
  umbralAdmin: number;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("pendientes");
  const [formAbierto, setFormAbierto] = useState(false);
  const [proveedorAbierto, setProveedorAbierto] = useState(false);
  const [simuladorAbierto, setSimuladorAbierto] = useState(false);
  const [prefill, setPrefill] = useState<PrefillCasoCompra | null>(null);
  const [recibiendo, setRecibiendo] = useState<CasoCompraConRelaciones | null>(null);
  const [ordenando, setOrdenando] = useState<CasoCompraConRelaciones | null>(null);
  const [autorizando, setAutorizando] = useState<CasoCompraConRelaciones | null>(null);
  const [editandoRechazado, setEditandoRechazado] =
    useState<CasoCompraConRelaciones | null>(null);
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [cotizacionCaso, setCotizacionCaso] =
    useState<CasoCompraConRelaciones | null>(null);
  const [detalleCaso, setDetalleCaso] = useState<CasoCompraConRelaciones | null>(null);

  // Esta vista solo maneja alertas de stock; las de asignación (personales)
  // viven en la campana global (NotificacionesProvider/Bell), no aquí.
  // Excluye las que ya tienen un caso enlazado: la reposición automática
  // deja una notificación "abierta" para que la campana avise, pero ya no
  // necesita el botón "Crear caso" (crearía un duplicado del automático).
  const abiertas = notificaciones.filter(
    (n) => n.estado === "abierta" && n.tipo === "stock" && !n.caso_compra_id
  );
  const casosAbiertos = casos.filter((c) => ABIERTOS.includes(c.estado));
  const montoPipeline = casosAbiertos.reduce((sum, c) => sum + c.monto_estimado, 0);
  const porCorreo7d = casos.filter(
    (c) =>
      c.origen === "correo" &&
      Date.now() - new Date(c.created_at).getTime() < SIETE_DIAS
  ).length;
  const porOrigen = (Object.keys(ORIGEN_META) as OrigenCasoCompra[]).map((origen) => ({
    origen,
    total: casos.filter((c) => c.origen === origen).length,
  }));

  function tieneConvenio(c: CasoCompraConRelaciones): boolean {
    if (!c.material_id || !c.proveedor_id) return false;
    return convenios.some(
      (cv) =>
        cv.material_id === c.material_id &&
        cv.proveedor_id === c.proveedor_id &&
        esConvenioVigente(cv)
    );
  }

  const casosPendientes = casos.filter((c) => PENDIENTE_ESTADOS.includes(c.estado));
  const pendientesConConvenio = casosPendientes.filter(tieneConvenio);
  const pendientesSinConvenio = casosPendientes.filter((c) => !tieneConvenio(c));
  const casosPorAutorizar = casos.filter((c) => c.estado === "por_autorizar");
  const casosEnEspera = casos.filter((c) => c.estado === "ordenado");
  const casosRechazados = casos.filter((c) => c.estado === "rechazado");

  const q = normalizarTexto(busqueda);
  const casosDelMes = casos.filter((c) => {
    if (filtroProveedor && c.proveedor_id !== filtroProveedor) return false;
    if (!q) return true;
    const texto = normalizarTexto(
      `${c.titulo} ${c.materiales?.nombre ?? ""} ${c.proveedores?.nombre ?? c.proveedor_nombre ?? ""} ${c.referencia ?? ""}`
    );
    return texto.includes(q);
  });

  // El operario también ve esta pestaña (para saber qué casos mandó a
  // revisión), pero de solo lectura — el botón "Revisar" (autorizar/
  // rechazar) solo aparece para gestor, más abajo.
  const TABS: { id: TabId; label: string; count: number }[] = [
    { id: "pendientes", label: "Pendientes", count: casosPendientes.length },
    { id: "por_autorizar", label: "Pendientes de Autorizar", count: casosPorAutorizar.length },
    { id: "en_espera", label: "Pendientes de llegar", count: casosEnEspera.length },
    { id: "rechazados", label: "Rechazados", count: casosRechazados.length },
    { id: "casos_del_mes", label: "Casos del mes", count: casos.length },
  ];

  function abrirDesdeNotificacion(n: NotificacionConRelaciones) {
    setPrefill({
      notificacion_id: n.id,
      proveedor_id: n.proveedor_id ?? "",
      material_id: n.material_id ?? "",
      titulo: n.materiales ? `Reabasto: ${n.materiales.nombre}` : "Reabasto",
    });
    setFormAbierto(true);
  }

  // Abre el formulario de correo (mailto) directo desde el caso, sin tener
  // que ir a buscar el material en su detalle. Solo tiene sentido si el
  // caso apunta a un material puntual (no los de varios ítems).
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

  // Único punto que todavía cambia el estado "a mano" (Marcar ordenado /
  // Confirmar recepción / Cancelar) — Autorizar/Rechazar/Editar tienen sus
  // propias acciones dedicadas que nunca dejan elegir un estado libremente.
  async function cambiarEstado(caso: CasoCompraConRelaciones, estado: EstadoCasoCompra) {
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
    if (estado === "ordenado" && !caso.cantidad_estimada && caso.material_id) {
      setOrdenando(caso);
      return;
    }
    if (estado === "cancelado" && !confirm("¿Cancelar este caso de compra?")) return;
    const res = await cambiarEstadoCasoCompra(caso.id, estado);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  async function eliminar(casoId: string) {
    if (!confirm("¿Eliminar este caso rechazado? No se puede deshacer.")) return;
    const res = await eliminarCasoCompra(casoId);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  function renderLista(
    lista: CasoCompraConRelaciones[],
    actionsFor: (c: CasoCompraConRelaciones) => React.ReactNode
  ) {
    if (lista.length === 0)
      return <p className="py-2 text-sm text-faint">No hay casos aquí.</p>;
    return (
      <ul className="divide-y divide-line">
        {lista.map((c) => (
          <CasoCompraCard
            key={c.id}
            caso={c}
            usuarios={usuarios}
            onAsignarResponsable={asignarResponsable}
            onVerDetalle={setDetalleCaso}
            actions={actionsFor(c)}
          />
        ))}
      </ul>
    );
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
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={revisarReposicion} disabled={revisando}>
            <RefreshCw className={`h-4 w-4 ${revisando ? "animate-spin" : ""}`} />
            Revisar reposición ahora
          </Button>
          {DEMO && (
            <Button variant="secondary" onClick={() => setSimuladorAbierto(true)}>
              <Mail className="h-4 w-4" /> Simular correo
            </Button>
          )}
          <Button variant="secondary" onClick={() => setProveedorAbierto(true)}>
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

      {/* KPIs + origen de los casos: solo gestor — el operario solo necesita
          las pestañas y las alertas de stock, sin cifras de negocio. */}
      {esGestor && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Notificaciones activas" value={String(abiertas.length)} alerta={abiertas.length > 0} />
            <Kpi label="Casos abiertos" value={String(casosAbiertos.length)} />
            <Kpi label="Monto en pipeline" value={formatMoney(montoPipeline)} />
            <Kpi label="Casos por correo (7 días)" value={String(porCorreo7d)} />
          </div>

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
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${barra}`}>
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
        </>
      )}

      {/* Notificaciones de stock bajo */}
      <Card className="mb-6 p-4 md:p-5">
        <div className="mb-3 flex items-center gap-2">
          <BellRing className="h-4 w-4 text-accent" />
          <h2 className="font-semibold text-fg">Notificaciones de stock bajo</h2>
        </div>
        {abiertas.length === 0 ? (
          <p className="py-2 text-sm text-faint">Sin alertas de stock. Todo arriba del mínimo.</p>
        ) : (
          <ul className="divide-y divide-line">
            {abiertas.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
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
                        {formatQty(n.materiales.stock_actual)} / {formatQty(n.materiales.stock_minimo, n.materiales.unidad)}
                      </span>
                    )}
                    {n.proveedores && <> · Proveedor: {n.proveedores.nombre}</>}
                    {" · "}
                    {formatDate(n.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button className="px-3 py-1.5 text-xs" onClick={() => abrirDesdeNotificacion(n)}>
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

      {/* Pestañas */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors " +
              (tab === t.id ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-fg")
            }
          >
            {t.label}
            <span
              className={
                "rounded-full px-1.5 py-0.5 text-[11px] font-semibold " +
                (tab === t.id ? "bg-accent-fg/20" : "bg-surface-2 text-faint")
              }
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {tab === "pendientes" && (
        <div className="space-y-4">
          <Card className="p-4 md:p-5">
            <h2 className="mb-3 font-semibold text-fg">Con convenio</h2>
            {renderLista(pendientesConConvenio, (c) => (
              <>
                <Button className="px-2.5 py-1 text-xs" onClick={() => cambiarEstado(c, "ordenado")}>
                  <PackageCheck className="h-3.5 w-3.5" /> Marcar ordenado
                </Button>
                <button
                  onClick={() => cambiarEstado(c, "cancelado")}
                  aria-label="Cancelar caso"
                  title="Cancelar"
                  className="cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-red-600 dark:hover:text-red-400"
                >
                  <Ban className="h-4 w-4" />
                </button>
              </>
            ))}
          </Card>
          <Card className="p-4 md:p-5">
            <h2 className="mb-3 font-semibold text-fg">Necesitan cotización</h2>
            {renderLista(pendientesSinConvenio, (c) => (
              <>
                {materialDeCaso(c) && (
                  <Button
                    variant="secondary"
                    className="px-2.5 py-1 text-xs"
                    onClick={() => abrirCotizacionDesdeCaso(c)}
                  >
                    <Mail className="h-3.5 w-3.5" /> Cotizar
                  </Button>
                )}
                <Button className="px-2.5 py-1 text-xs" onClick={() => cambiarEstado(c, "ordenado")}>
                  <PackageCheck className="h-3.5 w-3.5" /> Marcar ordenado
                </Button>
                <button
                  onClick={() => cambiarEstado(c, "cancelado")}
                  aria-label="Cancelar caso"
                  title="Cancelar"
                  className="cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-red-600 dark:hover:text-red-400"
                >
                  <Ban className="h-4 w-4" />
                </button>
              </>
            ))}
          </Card>
        </div>
      )}

      {tab === "por_autorizar" && (
        <Card className="p-4 md:p-5">
          {renderLista(casosPorAutorizar, (c) => {
            const requiereAdmin = c.monto_estimado > umbralAdmin;
            if (!esGestor || (requiereAdmin && !esAdmin)) {
              return requiereAdmin ? (
                <span className="text-xs text-faint">Requiere autorización de un administrador</span>
              ) : null;
            }
            return (
              <Button className="px-2.5 py-1 text-xs" onClick={() => setAutorizando(c)}>
                <ShieldCheck className="h-3.5 w-3.5" /> Revisar
              </Button>
            );
          })}
        </Card>
      )}

      {tab === "en_espera" && (
        <Card className="p-4 md:p-5">
          {renderLista(casosEnEspera, (c) => (
            <>
              <Button className="px-2.5 py-1 text-xs" onClick={() => cambiarEstado(c, "recibido")}>
                <PackageCheck className="h-3.5 w-3.5" /> Confirmar recepción
              </Button>
              <button
                onClick={() => cambiarEstado(c, "cancelado")}
                aria-label="Cancelar caso"
                title="Cancelar"
                className="cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-red-600 dark:hover:text-red-400"
              >
                <Ban className="h-4 w-4" />
              </button>
            </>
          ))}
        </Card>
      )}

      {tab === "rechazados" && (
        <Card className="p-4 md:p-5">
          {renderLista(casosRechazados, (c) => (
            <>
              <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => setEditandoRechazado(c)}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
              <button
                onClick={() => eliminar(c.id)}
                aria-label="Eliminar caso"
                title="Eliminar"
                className="cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-red-600 dark:hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          ))}
        </Card>
      )}

      {tab === "casos_del_mes" && (
        <Card className="p-4 md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <Input
                className="pl-9"
                placeholder="Buscar por título, material, proveedor..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <BotonExportarCSV
                filename="casos-compra"
                filas={casosDelMes.map((c) => ({
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
            </div>
          </div>
          {renderLista(casosDelMes, () => null)}
        </Card>
      )}

      <CasoCompraForm
        open={formAbierto}
        onClose={() => setFormAbierto(false)}
        proveedores={proveedores}
        materiales={materiales}
        usuarios={usuarios}
        prefill={prefill}
        esGestor={esGestor}
      />
      <NuevoProveedorModal open={proveedorAbierto} onClose={() => setProveedorAbierto(false)} />
      <SimuladorEmail
        open={simuladorAbierto}
        onClose={() => setSimuladorAbierto(false)}
        proveedores={proveedores}
        casos={casos}
      />
      <RecibirCompraForm caso={recibiendo} onClose={() => setRecibiendo(null)} />
      <MarcarOrdenadoForm caso={ordenando} onClose={() => setOrdenando(null)} />
      <AutorizarCasoForm
        caso={autorizando}
        esAdmin={esAdmin}
        umbralAdmin={umbralAdmin}
        onClose={() => setAutorizando(null)}
      />
      <EditarCasoRechazadoForm
        caso={editandoRechazado}
        proveedores={proveedores}
        materiales={materiales}
        onClose={() => setEditandoRechazado(null)}
      />
      {cotizacionCaso &&
        (() => {
          const material = materialDeCaso(cotizacionCaso);
          if (!material) return null;
          const proveedorDelMaterial = proveedores.find((p) => p.id === material.proveedor_id);
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
