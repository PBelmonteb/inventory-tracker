"use client";

import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { ESTADO_META } from "@/components/caso-compra-card";
import { formatMoney, formatQty, formatDate } from "@/lib/utils";
import type { InicioGestor, InicioOperario, InicioCompras } from "@/lib/inicio";
import {
  Wallet,
  AlertTriangle,
  ClipboardCheck,
  GitBranch,
  PackageX,
  Bell,
  UserCheck,
  Send,
  CheckCircle2,
  Inbox,
  Scale,
} from "lucide-react";

function Kpi({
  icon,
  label,
  value,
  tone = "accent",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "accent" | "warn" | "danger";
}) {
  const tones = {
    accent: "bg-accent/12 text-accent",
    warn: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    danger: "bg-red-500/12 text-red-600 dark:text-red-400",
  };
  return (
    <Card className="p-4">
      <div className={`mb-2.5 inline-flex rounded-lg p-2 ${tones[tone]}`}>{icon}</div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tracking-tight text-fg">{value}</p>
    </Card>
  );
}

function CardAccion({
  titulo,
  icon,
  verTodosHref,
  vacio,
  children,
}: {
  titulo: string;
  icon: React.ReactNode;
  verTodosHref: string;
  vacio: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold text-fg">
          {icon}
          {titulo}
        </h2>
        <Link href={verTodosHref} className="text-xs font-medium text-accent hover:underline">
          Ver todos
        </Link>
      </div>
      {vacio ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          Todo al día por aquí.
        </div>
      ) : (
        <ul className="divide-y divide-line">{children}</ul>
      )}
    </Card>
  );
}

export function InicioGestorView({ nombre, datos }: { nombre: string; datos: InicioGestor }) {
  const { kpis, porAutorizar, conteosPorRevisar, mrpAcciones, stockBajo } = datos;
  const totalAprobaciones =
    kpis.casosPorAutorizar + kpis.conteosPorRevisar + kpis.solicitudesPorResolver;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
            Hola, {nombre.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted">Esto es lo que necesita tu atención hoy.</p>
        </div>
        <Link
          href="/aprobaciones"
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-accent"
        >
          <Inbox className="h-4 w-4" />
          Bandeja de aprobaciones
          {totalAprobaciones > 0 && <Badge tone="danger">{totalAprobaciones}</Badge>}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi icon={<Wallet className="h-5 w-5" />} label="Valor en inventario" value={formatMoney(kpis.valorInventario)} />
        <Kpi
          icon={<PackageX className="h-5 w-5" />}
          label="Stock bajo"
          value={String(kpis.materialesStockBajo)}
          tone={kpis.materialesStockBajo > 0 ? "warn" : "accent"}
        />
        <Kpi
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Por autorizar"
          value={String(kpis.casosPorAutorizar)}
          tone={kpis.casosPorAutorizar > 0 ? "danger" : "accent"}
        />
        <Kpi
          icon={<ClipboardCheck className="h-5 w-5" />}
          label="Conteos por revisar"
          value={String(kpis.conteosPorRevisar)}
          tone={kpis.conteosPorRevisar > 0 ? "warn" : "accent"}
        />
        <Kpi
          icon={<Scale className="h-5 w-5" />}
          label="Solicitudes por resolver"
          value={String(kpis.solicitudesPorResolver)}
          tone={kpis.solicitudesPorResolver > 0 ? "warn" : "accent"}
        />
        <Kpi
          icon={<GitBranch className="h-5 w-5" />}
          label="MRP: acciones"
          value={String(kpis.mrpAccionesPendientes)}
          tone={kpis.mrpAccionesPendientes > 0 ? "warn" : "accent"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CardAccion
          titulo="Por autorizar"
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          verTodosHref="/proveedores"
          vacio={porAutorizar.length === 0}
        >
          {porAutorizar.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <div className="min-w-0">
                <Link href="/proveedores" className="font-medium text-fg hover:text-accent">
                  {c.titulo}
                </Link>
                <p className="truncate text-xs text-faint">{c.proveedores?.nombre ?? "Sin proveedor"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {c.requiereAdmin && <Badge tone="danger">Requiere admin</Badge>}
                <span className="font-medium text-fg">{formatMoney(c.monto_estimado)}</span>
              </div>
            </li>
          ))}
        </CardAccion>

        <CardAccion
          titulo="Conteos por revisar"
          icon={<ClipboardCheck className="h-4 w-4 text-amber-500" />}
          verTodosHref="/conteos"
          vacio={conteosPorRevisar.length === 0}
        >
          {conteosPorRevisar.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <div className="min-w-0">
                <Link href="/conteos" className="font-medium text-fg hover:text-accent">
                  {c.titulo}
                </Link>
                <p className="text-xs text-faint">{c.codigo}</p>
              </div>
              <Badge tone="warn">Listo para revisar</Badge>
            </li>
          ))}
        </CardAccion>

        <CardAccion
          titulo="MRP: qué hacer"
          icon={<GitBranch className="h-4 w-4 text-accent" />}
          verTodosHref="/analisis?tab=mrp"
          vacio={mrpAcciones.length === 0}
        >
          {mrpAcciones.map((r) => (
            <li key={r.materialId} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <Link href={`/materiales/${r.materialId}`} className="min-w-0 truncate font-medium text-fg hover:text-accent">
                {r.nombre}
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge tone={r.accion === "producir" ? "accent" : "warn"}>
                  {r.accion === "producir" ? "Producir" : "Comprar"}
                </Badge>
                <span className="text-muted">{formatQty(r.requerimientoNeto, r.unidad)}</span>
              </div>
            </li>
          ))}
        </CardAccion>

        <CardAccion
          titulo="Stock bajo"
          icon={<PackageX className="h-4 w-4 text-red-500" />}
          verTodosHref="/analisis?tab=reportes"
          vacio={stockBajo.length === 0}
        >
          {stockBajo.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <Link href={`/materiales/${m.id}`} className="min-w-0 truncate font-medium text-fg hover:text-accent">
                {m.nombre}
              </Link>
              <span className="shrink-0 text-muted">
                {formatQty(m.stock_actual, m.unidad)} / mín. {formatQty(m.stock_minimo, m.unidad)}
              </span>
            </li>
          ))}
        </CardAccion>
      </div>
    </div>
  );
}

// Igual espíritu que InicioGestorView (KPIs + bandeja) pero recortado a lo
// de compras — sin valorInventario ni conteos, eso no es su trabajo.
export function InicioComprasView({ nombre, datos }: { nombre: string; datos: InicioCompras }) {
  const { kpis, porAutorizar, solicitudesPorResolver, notificaciones } = datos;
  const totalAprobaciones = kpis.casosPorAutorizar + kpis.solicitudesPorResolver;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
            Hola, {nombre.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted">Esto es lo que necesita tu atención hoy.</p>
        </div>
        <Link
          href="/aprobaciones"
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3.5 py-2 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-accent"
        >
          <Inbox className="h-4 w-4" />
          Bandeja de aprobaciones
          {totalAprobaciones > 0 && <Badge tone="danger">{totalAprobaciones}</Badge>}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-2">
        <Kpi
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Por autorizar"
          value={String(kpis.casosPorAutorizar)}
          tone={kpis.casosPorAutorizar > 0 ? "danger" : "accent"}
        />
        <Kpi
          icon={<Scale className="h-5 w-5" />}
          label="Solicitudes por resolver"
          value={String(kpis.solicitudesPorResolver)}
          tone={kpis.solicitudesPorResolver > 0 ? "warn" : "accent"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CardAccion
          titulo="Por autorizar"
          icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
          verTodosHref="/proveedores"
          vacio={porAutorizar.length === 0}
        >
          {porAutorizar.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <div className="min-w-0">
                <Link href="/proveedores" className="font-medium text-fg hover:text-accent">
                  {c.titulo}
                </Link>
                <p className="truncate text-xs text-faint">{c.proveedores?.nombre ?? "Sin proveedor"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {c.requiereAdmin && <Badge tone="danger">Requiere admin</Badge>}
                <span className="font-medium text-fg">{formatMoney(c.monto_estimado)}</span>
              </div>
            </li>
          ))}
        </CardAccion>

        <CardAccion
          titulo="Solicitudes por resolver"
          icon={<Scale className="h-4 w-4 text-amber-500" />}
          verTodosHref="/aprobaciones"
          vacio={solicitudesPorResolver.length === 0}
        >
          {solicitudesPorResolver.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <Link href="/aprobaciones" className="min-w-0 truncate font-medium text-fg hover:text-accent">
                {s.titulo}
              </Link>
              <span className="shrink-0 text-xs text-faint">{s.codigo}</span>
            </li>
          ))}
        </CardAccion>
      </div>

      <CardAccion
        titulo="Notificaciones"
        icon={<Bell className="h-4 w-4 text-accent" />}
        verTodosHref="/inventario"
        vacio={notificaciones.length === 0}
      >
        {notificaciones.map((n) => (
          <li key={n.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
            <span className="min-w-0 truncate text-fg">{n.mensaje}</span>
            <span className="shrink-0 text-xs text-faint">{formatDate(n.created_at)}</span>
          </li>
        ))}
      </CardAccion>
    </div>
  );
}

export function InicioOperarioView({ nombre, datos }: { nombre: string; datos: InicioOperario }) {
  const { misCasosEnviados, responsabilidadesCompra, responsabilidadesVenta, salidasPendientes, notificaciones } =
    datos;
  const totalResponsabilidades =
    responsabilidadesCompra.length + responsabilidadesVenta.length + salidasPendientes.length;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
          Hola, {nombre.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted">Esto es lo que te toca hoy.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CardAccion
          titulo="Tus casos enviados"
          icon={<Send className="h-4 w-4 text-accent" />}
          verTodosHref="/proveedores"
          vacio={misCasosEnviados.length === 0}
        >
          {misCasosEnviados.map((c) => {
            const meta = ESTADO_META[c.estado];
            return (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link href="/proveedores" className="font-medium text-fg hover:text-accent">
                    {c.titulo}
                  </Link>
                  <p className="truncate text-xs text-faint">{c.proveedores?.nombre ?? "Sin proveedor"}</p>
                </div>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </li>
            );
          })}
        </CardAccion>

        <CardAccion
          titulo="Tus responsabilidades"
          icon={<UserCheck className="h-4 w-4 text-accent" />}
          verTodosHref="/proveedores"
          vacio={totalResponsabilidades === 0}
        >
          {responsabilidadesCompra.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <Link href="/proveedores" className="min-w-0 truncate font-medium text-fg hover:text-accent">
                {c.titulo}
              </Link>
              <Badge tone="neutral">Compra</Badge>
            </li>
          ))}
          {responsabilidadesVenta.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <Link href="/clientes" className="min-w-0 truncate font-medium text-fg hover:text-accent">
                {c.titulo}
              </Link>
              <Badge tone="neutral">Venta</Badge>
            </li>
          ))}
          {salidasPendientes.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <Link href="/clientes" className="min-w-0 truncate font-medium text-fg hover:text-accent">
                {s.materiales?.nombre ?? "Material eliminado"}
              </Link>
              <Badge tone="neutral">Salida</Badge>
            </li>
          ))}
        </CardAccion>
      </div>

      <CardAccion
        titulo="Notificaciones"
        icon={<Bell className="h-4 w-4 text-accent" />}
        verTodosHref="/inventario"
        vacio={notificaciones.length === 0}
      >
        {notificaciones.map((n) => (
          <li key={n.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
            <span className="min-w-0 truncate text-fg">{n.mensaje}</span>
            <span className="shrink-0 text-xs text-faint">{formatDate(n.created_at)}</span>
          </li>
        ))}
      </CardAccion>
    </div>
  );
}
