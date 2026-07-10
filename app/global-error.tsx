"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import "./globals.css";

// Red de seguridad final: captura errores que escapan a cualquier boundary
// normal (incluida la falla del propio root layout). Sentry.captureException
// no hace nada si no hay DSN configurado (ver lib/config.ts).
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body className="flex min-h-screen items-center justify-center bg-canvas p-4 font-sans text-fg antialiased">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold">Algo salió mal</h1>
          <p className="mt-2 text-sm text-muted">
            Ya se registró el error. Intenta recargar la página.
          </p>
        </div>
      </body>
    </html>
  );
}
