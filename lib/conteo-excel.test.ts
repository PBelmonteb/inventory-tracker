import { describe, expect, it } from "vitest";
import {
  COL_CANTIDAD,
  COL_ID,
  COL_SKU,
  COL_UBICACION,
  construirFilasExportConteo,
  interpretarFilasImportadasConteo,
} from "@/lib/conteo-excel";
import type { ConteoItemVista } from "@/lib/types";

const ITEMS: ConteoItemVista[] = [
  {
    id: "item-1",
    conteo_id: "c1",
    material_id: "mat-1",
    material_nombre: "Perfil aluminio 2\"",
    material_sku: "PERF-002",
    ubicacion_id: "u1",
    ubicacion_nombre: "Almacén A",
    cantidad_contada: null,
    contado_por_id: null,
    contado_por_nombre: null,
    contado_at: null,
  } as ConteoItemVista,
  {
    id: "item-2",
    conteo_id: "c1",
    material_id: "mat-2",
    material_nombre: "Bisagra reforzada",
    material_sku: "HER-001",
    ubicacion_id: "u2",
    ubicacion_nombre: "Almacén B",
    cantidad_contada: null,
    contado_por_id: null,
    contado_por_nombre: null,
    contado_at: null,
  } as ConteoItemVista,
];

describe("construirFilasExportConteo", () => {
  it("nunca incluye stock_esperado -- el conteo sigue siendo a ciegas al exportar", () => {
    const filas = construirFilasExportConteo(ITEMS, { incluirSku: true, incluirUbicacion: true });
    for (const fila of filas) {
      expect(Object.keys(fila)).not.toContain("stock_esperado");
      expect(Object.keys(fila).some((k) => /esperado/i.test(k))).toBe(false);
    }
  });

  it("incluye SKU/ubicación solo si se piden, y siempre Material/Cantidad/ID", () => {
    const conTodo = construirFilasExportConteo(ITEMS, { incluirSku: true, incluirUbicacion: true });
    expect(Object.keys(conTodo[0])).toEqual(["Material", COL_SKU, COL_UBICACION, COL_CANTIDAD, COL_ID]);

    const sinNada = construirFilasExportConteo(ITEMS, { incluirSku: false, incluirUbicacion: false });
    expect(Object.keys(sinNada[0])).toEqual(["Material", COL_CANTIDAD, COL_ID]);
  });

  it("deja la cantidad contada en blanco (para llenarse a mano) y el ID real del item", () => {
    const filas = construirFilasExportConteo(ITEMS, { incluirSku: false, incluirUbicacion: false });
    expect(filas[0][COL_CANTIDAD]).toBe("");
    expect(filas[0][COL_ID]).toBe("item-1");
    expect(filas[1][COL_ID]).toBe("item-2");
  });
});

describe("interpretarFilasImportadasConteo", () => {
  it("liga cada fila a su conteo_item por ID y parsea la cantidad", () => {
    const filas = [
      { Material: "Perfil aluminio 2\"", [COL_CANTIDAD]: "48", [COL_ID]: "item-1" },
      { Material: "Bisagra reforzada", [COL_CANTIDAD]: "12", [COL_ID]: "item-2" },
    ];
    const res = interpretarFilasImportadasConteo(filas, ITEMS);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.encontrados).toEqual([
      { itemId: "item-1", material: "Perfil aluminio 2\"", cantidad: 48 },
      { itemId: "item-2", material: "Bisagra reforzada", cantidad: 12 },
    ]);
    expect(res.sinReconocer).toBe(0);
    expect(res.sinCantidad).toBe(0);
  });

  it("reconoce las columnas aunque se reordenen o el archivo traiga columnas extra", () => {
    const filas = [
      { Extra: "algo", [COL_ID]: "item-1", [COL_CANTIDAD]: "48", Material: "x" },
    ];
    const res = interpretarFilasImportadasConteo(filas, ITEMS);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.encontrados).toEqual([{ itemId: "item-1", material: "Perfil aluminio 2\"", cantidad: 48 }]);
  });

  it("ignora (sin tronar) filas de otro conteo y cuenta cuántas fueron", () => {
    const filas = [
      { [COL_ID]: "item-1", [COL_CANTIDAD]: "48" },
      { [COL_ID]: "item-de-otro-conteo", [COL_CANTIDAD]: "5" },
    ];
    const res = interpretarFilasImportadasConteo(filas, ITEMS);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.encontrados).toHaveLength(1);
    expect(res.sinReconocer).toBe(1);
  });

  it("ignora filas sin cantidad capturada todavía", () => {
    const filas = [
      { [COL_ID]: "item-1", [COL_CANTIDAD]: "48" },
      { [COL_ID]: "item-2", [COL_CANTIDAD]: "" },
    ];
    const res = interpretarFilasImportadasConteo(filas, ITEMS);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.encontrados).toHaveLength(1);
    expect(res.sinCantidad).toBe(1);
  });

  it("parsea números escritos a mano con coma decimal o unidades pegadas", () => {
    const filas = [{ [COL_ID]: "item-1", [COL_CANTIDAD]: "48,5 m" }];
    const res = interpretarFilasImportadasConteo(filas, ITEMS);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.encontrados[0].cantidad).toBe(48.5);
  });

  it("falla con un mensaje claro si el archivo no es el exportado (faltan las columnas)", () => {
    const filas = [{ Nombre: "algo", Cantidad: "5" }];
    const res = interpretarFilasImportadasConteo(filas, ITEMS);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/no se reconocen/i);
  });

  it("falla con un mensaje claro si no hay ninguna fila utilizable", () => {
    const filas = [{ [COL_ID]: "item-inexistente", [COL_CANTIDAD]: "5" }];
    const res = interpretarFilasImportadasConteo(filas, ITEMS);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/no hay ninguna fila/i);
  });

  it("falla si el archivo viene vacío", () => {
    const res = interpretarFilasImportadasConteo([], ITEMS);
    expect(res.ok).toBe(false);
  });
});
