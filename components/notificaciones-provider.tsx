"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { obtenerNotificaciones } from "@/lib/actions/notificaciones";
import { descartarNotificacion } from "@/lib/actions/compras";
import type {
  NotificacionConRelaciones,
  NivelNotificacion,
  TipoNotificacion,
} from "@/lib/types";
import { X, AlertTriangle, PackageX, UserCheck } from "lucide-react";

// Evento que dispara cualquier acción que mueva el stock (movimientos) o
// asigne un responsable, para que las notificaciones se actualicen al
// instante (en vez de esperar el polling).
export const NOTIF_REFRESH_EVENT = "notificaciones:refresh";

type Toast = {
  id: string;
  tipo: TipoNotificacion;
  nivel: NivelNotificacion | null;
  mensaje: string;
};

type Ctx = {
  abiertas: NotificacionConRelaciones[];
  limpiar: (id: string) => void;
};

const NotificacionesCtx = createContext<Ctx>({ abiertas: [], limpiar: () => {} });

export function useNotificaciones() {
  return useContext(NotificacionesCtx);
}

const NIVEL_TOAST = {
  bajo: { Icon: PackageX, dot: "bg-red-500", text: "text-red-600 dark:text-red-400", label: "Stock bajo" },
  aviso: { Icon: AlertTriangle, dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", label: "Por agotarse" },
} as const;

const META_ASIGNACION = {
  Icon: UserCheck,
  dot: "bg-accent",
  text: "text-accent",
  label: "Asignación",
} as const;

function metaDe(t: Pick<Toast, "tipo" | "nivel">) {
  if (t.tipo === "asignacion") return META_ASIGNACION;
  return NIVEL_TOAST[t.nivel ?? "bajo"];
}

/**
 * Proveedor único de notificaciones: hace UN solo fetch/polling y lo comparte
 * con todas las campanas (escritorio + móvil), evitando trabajo duplicado.
 * También renderiza la pila de toasts una sola vez.
 */
export function NotificacionesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [lista, setLista] = useState<NotificacionConRelaciones[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const vistos = useRef<Set<string> | null>(null);

  const abiertas = lista.filter((n) => n.estado === "abierta");

  const cargar = useCallback(async (conToast: boolean) => {
    const data = await obtenerNotificaciones();
    const activas = data.filter((n) => n.estado === "abierta");
    if (vistos.current === null) {
      vistos.current = new Set(activas.map((n) => n.id));
    } else if (conToast) {
      const nuevos = activas.filter((n) => !vistos.current!.has(n.id));
      if (nuevos.length > 0) {
        setToasts((prev) => [
          ...prev,
          ...nuevos.map((n) => ({
            id: n.id,
            tipo: n.tipo,
            nivel: n.nivel,
            mensaje: n.mensaje,
          })),
        ]);
      }
      vistos.current = new Set(activas.map((n) => n.id));
    }
    setLista(data);
  }, []);

  // Carga inicial + al cambiar de página.
  useEffect(() => {
    cargar(true);
  }, [pathname, cargar]);

  // Refresco tras un movimiento + polling de respaldo (30s).
  useEffect(() => {
    const onRefresh = () => cargar(true);
    window.addEventListener(NOTIF_REFRESH_EVENT, onRefresh);
    const t = setInterval(() => cargar(true), 60000);
    return () => {
      window.removeEventListener(NOTIF_REFRESH_EVENT, onRefresh);
      clearInterval(t);
    };
  }, [cargar]);

  // Auto-ocultar cada toast a los 6 segundos.
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(
        () => setToasts((prev) => prev.filter((x) => x.id !== t.id)),
        6000
      )
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  const limpiar = useCallback((id: string) => {
    setLista((prev) => prev.filter((n) => n.id !== id));
    vistos.current?.delete(id);
    void descartarNotificacion(id);
  }, []);

  return (
    <NotificacionesCtx.Provider value={{ abiertas, limpiar }}>
      {children}

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {toasts.map((t) => {
            const meta = metaDe(t);
            const Icon = meta.Icon;
            return (
              <div
                key={t.id}
                className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-soft"
              >
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.text}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold ${meta.text}`}>{meta.label}</p>
                  <p className="mt-0.5 text-sm text-fg">{t.mensaje}</p>
                </div>
                <button
                  onClick={() =>
                    setToasts((prev) => prev.filter((x) => x.id !== t.id))
                  }
                  aria-label="Cerrar"
                  className="shrink-0 cursor-pointer rounded p-1 text-faint hover:bg-surface-2 hover:text-fg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </NotificacionesCtx.Provider>
  );
}
