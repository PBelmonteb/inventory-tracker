// Stub de "server-only" para Vitest. El paquete real lanza un error si se
// importa fuera de un Server Component de Next.js (protección de bundling
// en build/dev) — bajo Vitest no hay bundle de cliente del que protegerse,
// así que aquí es un no-op. Sin este alias, cualquier módulo de prueba que
// importe (directo o transitivo) algo con `import "server-only"` truena con
// "This module cannot be imported from a Client Component module."
export {};
