import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

// withSentryConfig envuelve el build para subir source maps (traduce stack
// traces minificados de vuelta a TypeScript real). Sin SENTRY_AUTH_TOKEN
// configurado (no lo está hoy) simplemente no sube nada — el build/dev
// corre igual. `silent` evita ruido en el log mientras no esté configurado.
export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
});
