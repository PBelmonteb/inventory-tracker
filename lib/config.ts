// Modo demo: activo cuando NO hay credenciales de Supabase configuradas.
// Permite correr y desarrollar el frontend con datos en memoria.
// Al llenar .env.local con las credenciales reales, se usa Supabase
// automáticamente (sin cambios de código).
//
// Nota: process.env.NEXT_PUBLIC_* se reemplaza en build, por lo que esta
// constante funciona tanto en el servidor como en el cliente.
export const DEMO = !process.env.NEXT_PUBLIC_SUPABASE_URL;

// Sentry solo se activa si hay DSN configurado — sin esta variable, todos
// los archivos sentry.*.config.ts no llaman a Sentry.init() y la app corre
// exactamente igual que hoy (mismo patrón que DEMO).
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
