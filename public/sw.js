// Service worker mínimo: habilita la instalación como app (PWA).
// Pasa las peticiones tal cual (sin caché agresivo) para no servir datos viejos
// de inventario. La capa offline se puede ampliar después.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
);
self.addEventListener("fetch", () => {
  // Passthrough: el navegador maneja la red normalmente.
});
