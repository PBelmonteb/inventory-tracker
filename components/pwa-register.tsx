"use client";

import { useEffect } from "react";

/** Registra el service worker para que la app sea instalable (PWA). */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Silencioso: si falla el registro, la app sigue funcionando como web.
      });
    } else {
      // En desarrollo el SW estorba al preview y al HMR: lo desregistramos.
      navigator.serviceWorker
        .getRegistrations()
        .then((rs) => rs.forEach((r) => r.unregister()))
        .catch(() => {});
    }
  }, []);
  return null;
}
