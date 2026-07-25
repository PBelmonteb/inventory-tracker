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

// Notificaciones push reales (lib/push.ts) — el payload es el mismo JSON
// que arma enviarPush(): { title, body, url }.
self.addEventListener("push", (event) => {
  let data = { title: "Inventario", body: "Tienes una notificación nueva.", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Si no viene JSON válido, se usa el mensaje genérico de arriba.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { url: data.url },
      icon: "/icon.svg",
    })
  );
});

// Al hacer clic, enfoca una pestaña ya abierta en esa URL o abre una nueva.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
