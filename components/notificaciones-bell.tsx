"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useNotificaciones } from "@/components/notificaciones-provider";
import { PushSubscribeButton } from "@/components/push-subscribe-button";
import type { NotificacionConRelaciones } from "@/lib/types";
import { Bell, X, AlertTriangle, PackageX, UserCheck, ShieldCheck } from "lucide-react";

const NIVEL = {
  bajo: {
    Icon: PackageX,
    text: "text-red-600 dark:text-red-400",
    chip: "bg-red-500/10 text-red-600 dark:text-red-400",
    label: "Stock bajo",
  },
  aviso: {
    Icon: AlertTriangle,
    text: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    label: "Por agotarse",
  },
} as const;

const ASIGNACION = {
  Icon: UserCheck,
  text: "text-accent",
  chip: "bg-accent/10 text-accent",
  label: "Asignación",
} as const;

const AUTORIZACION = {
  Icon: ShieldCheck,
  text: "text-accent",
  chip: "bg-accent/10 text-accent",
  label: "Autorización",
} as const;

function metaDe(n: NotificacionConRelaciones) {
  if (n.tipo === "asignacion") return ASIGNACION;
  if (n.tipo === "autorizacion") return AUTORIZACION;
  return NIVEL[n.nivel ?? "bajo"];
}

// A dónde lleva el link de una notificación sin material (asignación o
// autorización — ambas siempre apuntan a un caso, no a un material).
function hrefSinMaterial(n: NotificacionConRelaciones): string | null {
  if (n.caso_compra_id) return "/proveedores";
  if (n.caso_venta_id || n.salida_pendiente_id) return "/clientes";
  return null;
}

export function NotificacionesBell({
  variant = "side",
}: {
  variant?: "side" | "mobile";
}) {
  const { abiertas, limpiar } = useNotificaciones();
  const [abierto, setAbierto] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const count = abiertas.length;

  // Cerrar el panel al hacer click afuera.
  useEffect(() => {
    if (!abierto) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [abierto]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-label={`Notificaciones${count ? ` (${count})` : ""}`}
        className={
          variant === "mobile"
            ? "relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-sidebar-muted hover:bg-sidebar-surface hover:text-sidebar-fg"
            : "relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-surface hover:text-sidebar-fg"
        }
      >
        <Bell className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {abierto && (
        <div
          className={
            "absolute z-50 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-soft " +
            (variant === "mobile" ? "right-0" : "left-0")
          }
        >
          <div className="border-b border-line px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-fg">Notificaciones</p>
              <span className="text-xs text-faint">{count} activas</span>
            </div>
            <PushSubscribeButton />
          </div>
          {abiertas.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              Todo en orden. Sin alertas de stock.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {abiertas.map((n) => {
                const meta = metaDe(n);
                const Icon = meta.Icon;
                const sinMaterial = n.tipo === "asignacion" || n.tipo === "autorizacion";
                const href = sinMaterial
                  ? hrefSinMaterial(n)
                  : n.materiales
                    ? `/materiales/${n.materiales.id}`
                    : null;
                return (
                  <li key={n.id} className="flex gap-3 px-4 py-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.text}`} />
                    <div className="min-w-0 flex-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.chip}`}
                      >
                        {meta.label}
                      </span>
                      {href ? (
                        <Link
                          href={href}
                          onClick={() => setAbierto(false)}
                          className="mt-1 block text-sm font-medium text-fg hover:text-accent"
                        >
                          {sinMaterial ? "Ver caso" : n.materiales!.nombre}
                        </Link>
                      ) : (
                        <p className="mt-1 text-sm font-medium text-fg">
                          {sinMaterial ? meta.label : "Material"}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-muted">{n.mensaje}</p>
                    </div>
                    <button
                      onClick={() => limpiar(n.id)}
                      aria-label="Limpiar alerta"
                      className="h-fit shrink-0 cursor-pointer rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
