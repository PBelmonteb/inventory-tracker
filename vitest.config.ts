import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // "server-only" lanza un error fuera del bundling de Next.js — bajo
    // Vitest no aplica, se sustituye por un no-op (ver tests/stubs/).
    alias: { "server-only": "/tests/stubs/server-only.ts" },
  },
  test: {
    environment: "node",
    // Los tests de componentes (*.test.tsx) declaran su propio
    // `// @vitest-environment jsdom` — el resto (lib/**) corre en "node",
    // más rápido y sin necesidad de DOM.
    setupFiles: ["./tests/setup-rtl.ts"],
    // Los tests de integración (tests/integration/**) tienen su propio
    // config (vitest.integration.config.ts) porque hablan por red con
    // Supabase real — no deben correr como parte de `npm test`.
    exclude: [...configDefaults.exclude, "tests/integration/**"],
  },
});
