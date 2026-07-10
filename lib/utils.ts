import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Une clases de Tailwind resolviendo conflictos. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Exporta un arreglo de objetos como CSV (raw data) y dispara la descarga.
 * Usa las llaves del primer objeto como encabezados; escapa comillas/comas/
 * saltos de línea; agrega BOM para que Excel abra bien los acentos.
 */
export function exportarCSV(
  filename: string,
  filas: Record<string, unknown>[]
): void {
  if (filas.length === 0) return;
  const headers = Object.keys(filas[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [
    headers.join(","),
    ...filas.map((f) => headers.map((h) => escape(f[h])).join(",")),
  ];
  const BOM = String.fromCharCode(0xfeff);
  const csv = BOM + lineas.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Formatea un número como moneda en pesos mexicanos. */
export function formatMoney(value: number | null | undefined): string {
  const n = typeof value === "number" ? value : 0;
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  }).format(n);
}

/** Formatea una cantidad numérica con su unidad. */
export function formatQty(
  value: number | null | undefined,
  unidad?: string | null
): string {
  const n = typeof value === "number" ? value : 0;
  const formatted = new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 3,
  }).format(n);
  return unidad ? `${formatted} ${unidad}` : formatted;
}

/** Formatea una fecha ISO a formato legible en español. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/**
 * Normaliza texto para búsqueda: minúsculas y sin acentos/diacríticos.
 * Así "lamina" encuentra "Lámina" y "tornilleria" encuentra "Tornillería".
 */
export function normalizarTexto(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Punto de stock a partir del cual el material entra en zona de aviso
 * ("por agotarse"), según su configuración (unidades o porcentaje).
 */
export function puntoAviso(m: {
  stock_minimo: number;
  aviso_valor: number;
  aviso_modo: "unidad" | "porcentaje";
}): number {
  return m.aviso_modo === "unidad"
    ? m.stock_minimo + m.aviso_valor
    : m.stock_minimo * (1 + m.aviso_valor / 100);
}

/**
 * Nivel de un material:
 * - "bajo"   (rojo):    stock en o por debajo del mínimo
 * - "aviso"  (amarillo): por encima del mínimo pero dentro de la zona de aviso
 * - "ok"     (verde):    con holgura
 */
export function nivelStock(m: {
  stock_actual: number;
  stock_minimo: number;
  aviso_valor: number;
  aviso_modo: "unidad" | "porcentaje";
}): "ok" | "aviso" | "bajo" {
  // stock_minimo = 0 significa "todavía sin configurar" (default al crear un
  // material), no "el mínimo real es cero" — no tiene sentido avisar contra
  // un umbral que nadie definió.
  if (m.stock_minimo <= 0) return "ok";
  if (m.stock_actual <= m.stock_minimo) return "bajo";
  if (m.stock_actual <= puntoAviso(m)) return "aviso";
  return "ok";
}

/** Días transcurridos desde una fecha ISO. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
