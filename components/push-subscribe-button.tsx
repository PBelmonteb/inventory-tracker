"use client";

import { useEffect, useState } from "react";
import { guardarSuscripcionPush } from "@/lib/actions/autorizacion";
import { BellPlus } from "lucide-react";

// Convierte la llave pública VAPID (base64url) al formato que
// pushManager.subscribe espera (Uint8Array).
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Botón para activar notificaciones push reales (Web Push) en este
// dispositivo, además de la campana in-app que ya funciona sin esto. No se
// muestra si el navegador no soporta push, si no hay HTTPS (mismo requisito
// que la cámara/PWA — ver components/pwa-register.tsx), si falta la llave
// pública VAPID, o si ya está suscrito.
export function PushSubscribeButton() {
  const [soportado, setSoportado] = useState(false);
  const [suscrito, setSuscrito] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    setSoportado(true);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSuscrito(!!sub))
      .catch(() => {});
  }, []);

  async function activar() {
    setError(null);
    setCargando(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setError("No se concedió permiso de notificaciones.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ) as BufferSource,
      });
      const json = sub.toJSON();
      const res = await guardarSuscripcionPush({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuscrito(true);
    } catch {
      setError("No se pudo activar. Revisa los permisos de notificaciones del navegador.");
    } finally {
      setCargando(false);
    }
  }

  if (!soportado || suscrito) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={activar}
        disabled={cargando}
        title="Recibe un aviso en este dispositivo cuando autoricen o rechacen tus casos"
        className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      >
        <BellPlus className="h-3.5 w-3.5" />
        {cargando ? "Activando..." : "Activar notificaciones en este dispositivo"}
      </button>
      {error && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
