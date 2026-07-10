import { describe, expect, it } from "vitest";
import { store } from "@/lib/mock/store";
import type { Material } from "@/lib/types";

// Cada material de prueba se crea desde cero en cada test (id nuevo vía
// store.crearMaterial) para no depender del estado del seed de demo ni de
// otros tests — pero el store en sí es un singleton en globalThis, así que
// estos tests SÍ comparten proceso entre ellos (ver nota en store.ts).
function crearMaterialPrueba(overrides: Partial<Material> = {}): Material {
  return store.crearMaterial({
    sku: null,
    nombre: "Material de prueba " + Math.random(),
    descripcion: null,
    categoria_id: null,
    ubicacion_id: null,
    proveedor_id: null,
    unidad: "pza",
    stock_minimo: 0,
    aviso_valor: 20,
    aviso_modo: "porcentaje",
    costo_unitario: 0,
    ...overrides,
  });
}

describe("aplicarMovimiento — costo promedio ponderado (WAC)", () => {
  it("una entrada con costo recalcula el WAC combinando existencia previa y nueva", () => {
    const m = crearMaterialPrueba({ costo_unitario: 10 });
    // 0 unidades a $10 (ninguna, costo inicial nada más) -> entra 100 @ $10
    store.aplicarMovimiento(m.id, "entrada", 100, { costo: 10 });
    // entra 50 más @ $16 -> WAC = (100*10 + 50*16) / 150 = 12
    store.aplicarMovimiento(m.id, "entrada", 50, { costo: 16 });

    const actualizado = store.getMaterial(m.id)!;
    expect(actualizado.stock_actual).toBe(150);
    expect(actualizado.costo_unitario).toBe(12);
  });

  it("una entrada sin costo no mueve el WAC, solo la cantidad", () => {
    const m = crearMaterialPrueba({ costo_unitario: 10 });
    store.aplicarMovimiento(m.id, "entrada", 100, { costo: 10 });
    store.aplicarMovimiento(m.id, "entrada", 20); // sin costo (ej. traslado)

    const actualizado = store.getMaterial(m.id)!;
    expect(actualizado.stock_actual).toBe(120);
    expect(actualizado.costo_unitario).toBe(10);
  });

  it("una salida no toca el costo unitario", () => {
    const m = crearMaterialPrueba({ costo_unitario: 10 });
    store.aplicarMovimiento(m.id, "entrada", 100, { costo: 10 });
    store.aplicarMovimiento(m.id, "salida", 30);

    const actualizado = store.getMaterial(m.id)!;
    expect(actualizado.stock_actual).toBe(70);
    expect(actualizado.costo_unitario).toBe(10);
  });
});

describe("aplicarMovimiento — bloqueo de sobreventa", () => {
  it("rechaza una salida mayor al disponible", () => {
    const m = crearMaterialPrueba();
    store.aplicarMovimiento(m.id, "entrada", 50, { costo: 5 });

    expect(() => store.aplicarMovimiento(m.id, "salida", 999)).toThrow(
      /stock insuficiente/i
    );
    // El intento fallido no debe alterar el stock.
    expect(store.getMaterial(m.id)!.stock_actual).toBe(50);
  });

  it("permite una salida que deja el disponible exactamente en cero", () => {
    const m = crearMaterialPrueba();
    store.aplicarMovimiento(m.id, "entrada", 50, { costo: 5 });
    store.aplicarMovimiento(m.id, "salida", 50);
    expect(store.getMaterial(m.id)!.stock_actual).toBe(0);
  });

  it("rechaza cantidades <= 0 en entrada/salida", () => {
    const m = crearMaterialPrueba();
    expect(() => store.aplicarMovimiento(m.id, "entrada", 0)).toThrow();
    expect(() => store.aplicarMovimiento(m.id, "salida", -5)).toThrow();
  });
});

describe("aplicarMovimiento — stock por ubicación", () => {
  it("valida el disponible de la ubicación específica, no el total del material", () => {
    const m = crearMaterialPrueba({ ubicacion_id: "almacen-a" });
    store.aplicarMovimiento(m.id, "entrada", 100, { costo: 5 }); // todo en almacen-a
    // Traslada 20 a otra ubicación.
    store.aplicarMovimiento(m.id, "salida", 20, { ubicacion_id: "almacen-a" });
    store.aplicarMovimiento(m.id, "entrada", 20, { ubicacion_id: "almacen-b" });

    // almacen-b solo tiene 20 — no puede salir más que eso desde ahí,
    // aunque el material en total tenga 80 disponibles en otro lado.
    expect(() =>
      store.aplicarMovimiento(m.id, "salida", 50, { ubicacion_id: "almacen-b" })
    ).toThrow(/stock insuficiente/i);
  });

  it("un ajuste fija el valor absoluto de esa ubicación (no suma/resta)", () => {
    const m = crearMaterialPrueba({ ubicacion_id: "almacen-a" });
    store.aplicarMovimiento(m.id, "entrada", 100, { costo: 5 });
    store.aplicarMovimiento(m.id, "ajuste", 280, { ubicacion_id: "almacen-a" });

    const filas = store.getStockPorUbicacion(m.id);
    expect(filas).toHaveLength(1);
    expect(filas[0].stock).toBe(280);
  });
});

describe("crearMaterial", () => {
  it("arranca en stock_actual 0 y activo, sin importar el stockInicial hasta aplicarlo", () => {
    const m = crearMaterialPrueba();
    expect(m.stock_actual).toBe(0);
    expect(m.activo).toBe(true);
  });

  it("con stockInicial > 0 genera automáticamente la entrada correspondiente", () => {
    const m = store.crearMaterial(
      {
        sku: null,
        nombre: "Con stock inicial " + Math.random(),
        descripcion: null,
        categoria_id: null,
        ubicacion_id: null,
        proveedor_id: null,
        unidad: "pza",
        stock_minimo: 0,
        aviso_valor: 20,
        aviso_modo: "porcentaje",
        costo_unitario: 8,
      },
      40
    );
    expect(store.getMaterial(m.id)!.stock_actual).toBe(40);
  });
});

describe("guardarBom", () => {
  it("rechaza que un material se consuma a sí mismo", () => {
    const producto = crearMaterialPrueba();
    expect(() =>
      store.guardarBom(producto.id, [
        { componente_id: producto.id, cantidad_por_unidad: 1 },
      ])
    ).toThrow(/no puede consumirse a sí mismo/i);
  });

  it("rechaza un componente repetido en la misma receta", () => {
    const producto = crearMaterialPrueba();
    const c = crearMaterialPrueba();
    expect(() =>
      store.guardarBom(producto.id, [
        { componente_id: c.id, cantidad_por_unidad: 1 },
        { componente_id: c.id, cantidad_por_unidad: 2 },
      ])
    ).toThrow(/repetido/i);
  });

  it("guardar reemplaza la receta anterior por completo", () => {
    const producto = crearMaterialPrueba();
    const c1 = crearMaterialPrueba();
    const c2 = crearMaterialPrueba();
    store.guardarBom(producto.id, [{ componente_id: c1.id, cantidad_por_unidad: 5 }]);
    store.guardarBom(producto.id, [{ componente_id: c2.id, cantidad_por_unidad: 3 }]);

    const receta = store.getBom(producto.id);
    expect(receta).toHaveLength(1);
    expect(receta[0].componente_id).toBe(c2.id);
    expect(receta[0].cantidad_por_unidad).toBe(3);
  });
});

describe("producir", () => {
  it("consume los componentes y genera el producto con el WAC de la receta", () => {
    const bisagra = crearMaterialPrueba({ costo_unitario: 0 });
    store.aplicarMovimiento(bisagra.id, "entrada", 100, { costo: 30 }); // WAC bisagra = 30
    const tornillo = crearMaterialPrueba({ costo_unitario: 0 });
    store.aplicarMovimiento(tornillo.id, "entrada", 100, { costo: 200 }); // WAC tornillo = 200

    const producto = crearMaterialPrueba({ costo_unitario: 0 });
    store.guardarBom(producto.id, [
      { componente_id: bisagra.id, cantidad_por_unidad: 4 },
      { componente_id: tornillo.id, cantidad_por_unidad: 0.1 },
    ]);

    store.producir(producto.id, 10);

    // Consumo: 4*10=40 bisagras, 0.1*10=1 tornillo.
    expect(store.getMaterial(bisagra.id)!.stock_actual).toBe(60);
    expect(store.getMaterial(tornillo.id)!.stock_actual).toBe(99);

    // Costo de producir 1 unidad = 4*30 + 0.1*200 = 140. Como el producto
    // partía de stock 0 y costo 0, el WAC nuevo es ese mismo costo.
    const actualizado = store.getMaterial(producto.id)!;
    expect(actualizado.stock_actual).toBe(10);
    expect(actualizado.costo_unitario).toBe(140);
  });

  it("rechaza producir si falta cualquier insumo, sin dejar estado a medias", () => {
    const escaso = crearMaterialPrueba({ costo_unitario: 10 });
    store.aplicarMovimiento(escaso.id, "entrada", 5, { costo: 10 }); // solo 5 disponibles

    const abundante = crearMaterialPrueba({ costo_unitario: 5 });
    store.aplicarMovimiento(abundante.id, "entrada", 1000, { costo: 5 });

    const producto = crearMaterialPrueba();
    store.guardarBom(producto.id, [
      { componente_id: escaso.id, cantidad_por_unidad: 1 }, // pide 10, solo hay 5
      { componente_id: abundante.id, cantidad_por_unidad: 1 },
    ]);

    expect(() => store.producir(producto.id, 10)).toThrow(/sin disponible/i);

    // Nada debió moverse — ni el insumo abundante (que se procesa primero
    // en el loop) ni el producto.
    expect(store.getMaterial(escaso.id)!.stock_actual).toBe(5);
    expect(store.getMaterial(abundante.id)!.stock_actual).toBe(1000);
    expect(store.getMaterial(producto.id)!.stock_actual).toBe(0);
  });

  it("rechaza producir un material sin receta configurada", () => {
    const sinReceta = crearMaterialPrueba();
    expect(() => store.producir(sinReceta.id, 1)).toThrow(
      /no tiene una receta de producción configurada/i
    );
  });

  it("rechaza cantidad <= 0", () => {
    const producto = crearMaterialPrueba();
    const c = crearMaterialPrueba({ costo_unitario: 10 });
    store.aplicarMovimiento(c.id, "entrada", 10, { costo: 10 });
    store.guardarBom(producto.id, [{ componente_id: c.id, cantidad_por_unidad: 1 }]);

    expect(() => store.producir(producto.id, 0)).toThrow(/mayor a cero/i);
  });
});
