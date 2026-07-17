// Autenticación compartida de webhooks (correo entrante, reposición
// automática): comparación en tiempo constante contra un secreto de
// entorno, para no depender de === (vulnerable a timing attacks).

import { createHash, timingSafeEqual } from "node:crypto";

export function secretoValido(recibido: string | null, esperado: string): boolean {
  if (!recibido) return false;
  const a = createHash("sha256").update(recibido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}
