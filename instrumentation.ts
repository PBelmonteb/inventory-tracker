// Next.js llama a register() una vez al arrancar el servidor (o el worker de
// Edge). Cada runtime tiene su propio archivo de init porque corren en
// entornos distintos (Node vs Edge) y no comparten todo el SDK.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captura errores de Server Components/Server Actions que Next.js atrapa
// internamente (no llegan a un try/catch normal). Sin DSN configurado,
// Sentry.captureRequestError no hace nada (ver sentry.server.config.ts).
export async function onRequestError(...args: Parameters<
  typeof import("@sentry/nextjs").captureRequestError
>) {
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
}
