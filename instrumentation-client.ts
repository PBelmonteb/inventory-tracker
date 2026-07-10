import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN } from "@/lib/config";

// Init del lado del navegador. Sin DSN, no hace nada — ver lib/config.ts.
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
}

// Requerido por Next.js para instrumentar la navegación entre rutas.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
