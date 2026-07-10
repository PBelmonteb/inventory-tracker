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
  },
});
