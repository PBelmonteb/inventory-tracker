// Lógica pura (sin XLSX ni File API) para exportar un conteo a una hoja
// imprimible y para interpretar de vuelta el archivo ya contado a mano —
// separada de components/conteo-detalle-modal.tsx para poder probarla con
// Vitest sin simular un <input type="file"> real. Reemplaza el escaneo QR
// para el conteo cíclico completo: es "situacional y mucho trabajo manual"
// para contar todo un alcance, mejor una hoja lista con lo que toca contar.

import { parseNumero } from "@/lib/utils";
import type { ConteoItemVista } from "@/lib/types";

export const COL_MATERIAL = "Material";
export const COL_SKU = "SKU";
export const COL_UBICACION = "Ubicación";
export const COL_CANTIDAD = "Cantidad contada";
// Al final y marcada "no editar": es lo único que liga cada fila de vuelta
// a su conteo_item -- nombre/SKU/ubicación son solo para que la persona
// sepa qué está contando, no se usan para reconocer la fila al importar.
export const COL_ID = "ID interno (no editar)";

export const normalizarEncabezado = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

export interface OpcionesExportConteo {
  incluirSku: boolean;
  incluirUbicacion: boolean;
}

/** Arma las filas (objetos planos) para XLSX.utils.json_to_sheet -- el
 *  conteo sigue siendo a ciegas: nunca incluye stock_esperado. */
export function construirFilasExportConteo(
  items: ConteoItemVista[],
  opciones: OpcionesExportConteo
): Record<string, unknown>[] {
  return items.map((it) => {
    const fila: Record<string, unknown> = { [COL_MATERIAL]: it.material_nombre };
    if (opciones.incluirSku) fila[COL_SKU] = it.material_sku ?? "";
    if (opciones.incluirUbicacion) fila[COL_UBICACION] = it.ubicacion_nombre ?? "";
    fila[COL_CANTIDAD] = "";
    fila[COL_ID] = it.id;
    return fila;
  });
}

export interface FilaImportadaConteo {
  itemId: string;
  material: string;
  cantidad: number;
}

export type ResultadoInterpretarImport =
  | {
      ok: true;
      encontrados: FilaImportadaConteo[];
      sinReconocer: number;
      sinCantidad: number;
    }
  | { ok: false; error: string };

/** Toma las filas ya leídas de la hoja (XLSX.utils.sheet_to_json) y las liga
 *  de vuelta a los conteo_items reales -- reconoce columnas por nombre
 *  (tolera reordenar/agregar columnas), nunca por posición. */
export function interpretarFilasImportadasConteo(
  filas: Record<string, unknown>[],
  items: ConteoItemVista[]
): ResultadoInterpretarImport {
  if (filas.length === 0) return { ok: false, error: "El archivo no tiene filas." };

  const encabezados = Object.keys(filas[0]);
  const colId = encabezados.find(
    (h) => normalizarEncabezado(h) === normalizarEncabezado(COL_ID)
  );
  const colCantidad = encabezados.find(
    (h) => normalizarEncabezado(h) === normalizarEncabezado(COL_CANTIDAD)
  );
  if (!colId || !colCantidad) {
    return {
      ok: false,
      error: `No se reconocen las columnas "${COL_ID}" y "${COL_CANTIDAD}" -- usa el archivo exportado desde aquí, sin cambiarles el nombre.`,
    };
  }

  const porId = new Map(items.map((it) => [it.id, it]));
  const encontrados: FilaImportadaConteo[] = [];
  let sinReconocer = 0;
  let sinCantidad = 0;

  for (const fila of filas) {
    const itemId = String(fila[colId] ?? "").trim();
    if (!itemId) continue;
    const item = porId.get(itemId);
    if (!item) {
      sinReconocer++;
      continue;
    }
    const crudo = String(fila[colCantidad] ?? "").trim();
    if (!crudo) {
      sinCantidad++;
      continue;
    }
    encontrados.push({ itemId, material: item.material_nombre, cantidad: parseNumero(crudo) });
  }

  if (encontrados.length === 0) {
    return { ok: false, error: "No hay ninguna fila con cantidad capturada y reconocida de este conteo." };
  }

  return { ok: true, encontrados, sinReconocer, sinCantidad };
}
