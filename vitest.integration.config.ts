import { defineConfig } from "vitest/config";

// Config separada de vitest.config.ts a propósito: estos tests hablan por
// red con el proyecto de Supabase real (leen SUPABASE_SERVICE_ROLE_KEY de
// .env.local), así que NO deben correr como parte de `npm test` normal.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["./tests/setup-env.ts"],
    testTimeout: 20_000,
    // Todos estos archivos pegan contra el MISMO proyecto de Supabase real
    // (no una base aislada por archivo) — correrlos en paralelo (default de
    // Vitest) deja una ventana real donde el afterEach de un archivo borra
    // filas que otro archivo, corriendo al mismo tiempo, todavía necesita
    // (visto dos veces en auditoría: casos-automaticos y sincronizar-
    // notificaciones fallaron sueltos, pero pasaron siempre en aislado).
    fileParallelism: false,
  },
});
