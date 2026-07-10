import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN } from "@/lib/config";

// Sin DSN (por defecto hoy), esto no hace nada — ver lib/config.ts.
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    // No manda cookies/headers de request automáticamente — este proyecto
    // maneja datos de negocio reales (costos, clientes), mejor pecar de
    // conservador con lo que sale del servidor.
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
}
