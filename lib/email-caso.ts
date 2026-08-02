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

/**
 * ¿El remitente es externo a la organización? Compara el dominio del
 * remitente contra el dominio propio (derivado de EMAIL_FROM, ver
 * app/api/email-caso/route.ts). Sin dominio propio configurado, se trata
 * TODO como externo — por defecto hay que desconfiar, no al revés.
 *
 * Mitigación de riesgo humano (no de spoofing): el remitente de un correo
 * (`From:`) no se autentica de ninguna forma (ni aquí ni con SPF/DKIM
 * todavía) — este aviso no evita que alguien lo falsifique, solo evita que
 * el staff lo pase por alto sin darse cuenta de que viene de fuera.
 */
export function esRemitenteExterno(
  remitente: string,
  dominioPropio: string | null
): boolean {
  if (!dominioPropio) return true;
  const email = normalizarEmail(remitente);
  const dominio = email.split("@")[1] ?? "";
  return dominio.toLowerCase() !== dominioPropio.toLowerCase();
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

/**
 * Extrae el monto tipo `$24,600.00` del texto de un correo (0 si no hay).
 * Heurística, no parseo real — una cotización suele traer varios montos
 * (precio unitario, subtotal, envío, total), así que en vez de agarrar el
 * primer "$" que aparece, prioriza el que está en la misma línea que
 * "total"/"monto"/"importe" (el último de esos, por si hay un subtotal
 * antes del total final). Sin esa pista, se queda con el monto más grande
 * de todo el texto — más probable que sea el total que un precio unitario.
 * Sigue siendo una adivinanza: por eso el caller marca el resultado como
 * "sin confirmar" en vez de darlo por bueno (ver monto_confirmado).
 */
export function extraerMonto(texto: string): number {
  const regexMonto = /\$\s*([\d][\d,]*(?:\.\d{1,2})?)/g;
  const conPista: number[] = [];
  const todos: number[] = [];

  for (const linea of texto.split(/\r?\n/)) {
    const tienePista = /total|monto|importe/i.test(linea);
    for (const m of linea.matchAll(regexMonto)) {
      const n = Number(m[1].replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 0) continue;
      todos.push(n);
      if (tienePista) conPista.push(n);
    }
  }

  if (conPista.length > 0) return conPista[conPista.length - 1];
  if (todos.length > 0) return Math.max(...todos);
  return 0;
}

/** Recorta el cuerpo del correo para usarlo como descripción del caso. */
export function resumirCuerpo(cuerpo: string, max = 280): string | null {
  const limpio = cuerpo.replace(/\s+/g, " ").trim();
  if (!limpio) return null;
  return limpio.length > max ? `${limpio.slice(0, max)}…` : limpio;
}

/**
 * Formatea un correo (enviado o recibido) completo, sin recortar, para
 * guardarlo tal cual en el `detalle` de un evento del timeline — a
 * diferencia de `resumirCuerpo` (que solo deja un resumen corto para la
 * descripción del caso), aquí sí se necesita poder leer el correo entero.
 */
export function formatearCorreoEvento(asunto: string, cuerpo: string): string {
  return `Asunto: ${asunto}\n\n${cuerpo.trim()}`;
}

type CasoReferenciaMatch = { id: string; referencia: string | null };

/**
 * Busca, entre casos con código (OC-123456, OC-123456-0, SOL-123456) en su
 * `referencia`, cuál corresponde al asunto de un correo entrante — para
 * ligar una respuesta al caso correcto (evento "correo_recibido") en vez
 * de crear un caso nuevo. Mismo idioma que matchMaterial: junta todos los
 * candidatos del texto, luego los compara uno por uno.
 */
export function matchReferenciaEnAsunto<T extends CasoReferenciaMatch>(
  asunto: string,
  casos: T[]
): T | null {
  const codigos =
    asunto.toUpperCase().match(/\b(?:OC|SOL)-\d{4,8}(?:-\d{1,3})?\b/g) ?? [];
  for (const codigo of codigos) {
    const caso = casos.find((c) => c.referencia?.toUpperCase() === codigo);
    if (caso) return caso;
  }
  return null;
}
