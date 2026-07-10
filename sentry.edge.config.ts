import * as Sentry from "@sentry/nextjs";
import { SENTRY_DSN } from "@/lib/config";

// Cubre el middleware (middleware.ts) y rutas en Edge runtime.
// Sin DSN, no hace nada — ver lib/config.ts.
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  });
}
