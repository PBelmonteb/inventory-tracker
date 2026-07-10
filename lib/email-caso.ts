// Lógica de matching para correos entrantes (email-to-case).
// Funciones puras: el webhook (app/api/email-caso) las usa tanto en modo
// demo como con Supabase.

export interface EmailEntrante {
  de: string;
  asunto: string;
  cuerpo: string;
  mensajeId: string;
}

type ProveedorMatch = { id: string; nombre: string; contacto: string | null };
type MaterialMatch = { id: string; nombre: string; sku: string | null };

/** Extrae la dirección de un remitente tipo `Nombre <a@b.mx>` y normaliza. */
export function normalizarEmail(remitente: string): string {
  const match = remitente.match(/<([^>]+)>/);
  return (match ? match[1] : remitente).trim().toLowerCase();
}

/** Busca el proveedor cuyo contacto coincide con el remitente. */
export function matchProveedor<T extends ProveedorMatch>(
  remitente: string,
  proveedores: T[]
): T | null {
  const email = normalizarEmail(remitente);
  if (!email) return null;
  return (
    proveedores.find(
      (p) => p.contacto && normalizarEmail(p.contacto) === email
    ) ?? null
  );
}

function sinDiacriticos(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Busca un material en el texto: primero por SKU (PERF-001), luego por
 * nombre completo contenido en el texto.
 */
export function matchMaterial<T extends MaterialMatch>(
  texto: string,
  materiales: T[]
): T | null {
  const skus = texto.toUpperCase().match(/\b[A-Z]{2,6}-\d{2,5}\b/g) ?? [];
  for (const sku of skus) {
    const m = materiales.find((x) => x.sku?.toUpperCase() === sku);
    if (m) return m;
  }
  const textoPlano = sinDiacriticos(texto);
  return (
    materiales.find((m) => textoPlano.includes(sinDiacriticos(m.nombre))) ??
    null
  );
}

/** Extrae el primer monto tipo `$24,600.00` del texto (0 si no hay). */
export function extraerMonto(texto: string): number {
  const match = texto.match(/\$\s*([\d][\d,]*(?:\.\d{1,2})?)/);
  if (!match) return 0;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Recorta el cuerpo del correo para usarlo como descripción del caso. */
export function resumirCuerpo(cuerpo: string, max = 280): string | null {
  const limpio = cuerpo.replace(/\s+/g, " ").trim();
  if (!limpio) return null;
  return limpio.length > max ? `${limpio.slice(0, max)}…` : limpio;
}
