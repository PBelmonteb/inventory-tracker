// RPC producir(p_producto_id, p_cantidad, p_ubicacion default null): BOM /
// producción — consume los componentes de la receta (bom_items) y genera el
// producto terminado con costo = suma de costos de sus componentes,
// reutilizando los triggers de validación de stock y cálculo de WAC que ya
// existen para movimientos normales (nada de lógica de validación nueva).
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient, tieneCredenciales } from "./helpers";

describe.skipIf(!tieneCredenciales)("RPC producir (BOM)", () => {
  let admin: SupabaseClient;
  const materialIds: string[] = [];

  beforeAll(() => {
    admin = getAdminClient();
  });

  afterEach(async () => {
    // historial_precios/movimientos.material_id son "on delete SET NULL" —
    // hay que borrarlos explícitamente (ver [[historial-autonomo]]).
    for (const id of materialIds) {
      await admin.from("historial_precios").delete().eq("material_id", id);
      await admin.from("movimientos").delete().eq("material_id", id);
    }
    // bom_items.producto_id es CASCADE (se borra solo con el producto);
    // bom_items.componente_id es RESTRICT (bloquea borrar un componente
    // mientras una receta lo siga referenciando). Por eso se borra en
    // orden inverso al de creación: el producto (última fixture creada en
    // cada test) primero, así se lleva sus bom_items y libera a los
    // componentes para poder borrarlos después.
    for (const id of [...materialIds].reverse()) {
      await admin.from("materiales").delete().eq("id", id);
    }
    materialIds.length = 0;
  });

  async function crearMaterial(
    nombre: string,
    stock_actual: number,
    costo_unitario: number
  ) {
    const { data, error } = await admin
      .from("materiales")
      .insert({ nombre: `[test] ${nombre}`, stock_actual, costo_unitario })
      .select()
      .single();
    expect(error).toBeNull();
    materialIds.push(data!.id);
    return data!.id as string;
  }

  async function guardarReceta(
    producto_id: string,
    items: { componente_id: string; cantidad_por_unidad: number }[]
  ) {
    const { error } = await admin
      .from("bom_items")
      .insert(items.map((it) => ({ producto_id, ...it })));
    expect(error).toBeNull();
  }

  it("produce: consume los componentes y calcula el WAC del producto", async () => {
    const bisagra = await crearMaterial("bisagra producir", 100, 30);
    const tornillo = await crearMaterial("tornillo producir", 100, 200);
    const producto = await crearMaterial("producto BOM ok", 0, 0);
    await guardarReceta(producto, [
      { componente_id: bisagra, cantidad_por_unidad: 4 },
      { componente_id: tornillo, cantidad_por_unidad: 0.1 },
    ]);

    const { error } = await admin.rpc("producir", {
      p_producto_id: producto,
      p_cantidad: 10,
    });
    expect(error).toBeNull();

    const { data: mBisagra } = await admin
      .from("materiales")
      .select("stock_actual")
      .eq("id", bisagra)
      .single();
    expect(Number(mBisagra?.stock_actual)).toBe(60); // 100 - 4*10

    const { data: mTornillo } = await admin
      .from("materiales")
      .select("stock_actual")
      .eq("id", tornillo)
      .single();
    expect(Number(mTornillo?.stock_actual)).toBe(99); // 100 - 0.1*10

    const { data: mProducto } = await admin
      .from("materiales")
      .select("stock_actual, costo_unitario")
      .eq("id", producto)
      .single();
    expect(Number(mProducto?.stock_actual)).toBe(10);
    expect(Number(mProducto?.costo_unitario)).toBe(140); // 4*30 + 0.1*200
  });

  it("rechaza y no deja nada a medias si falta un insumo (transacción real)", async () => {
    const escaso = await crearMaterial("escaso producir", 5, 10);
    const abundante = await crearMaterial("abundante producir", 1000, 5);
    const producto = await crearMaterial("producto BOM falla", 0, 0);
    await guardarReceta(producto, [
      { componente_id: escaso, cantidad_por_unidad: 1 }, // pide 10, solo hay 5
      { componente_id: abundante, cantidad_por_unidad: 1 },
    ]);

    const { error } = await admin.rpc("producir", {
      p_producto_id: producto,
      p_cantidad: 10,
    });
    expect(error).not.toBeNull();

    // A diferencia del store DEMO (que valida a mano antes de mover nada),
    // aquí es una transacción real de Postgres: si el insumo insuficiente
    // truena, el otro insumo ya insertado en la misma función se deshace
    // solo — no hace falta pre-validar en la RPC.
    const { data: mAbundante } = await admin
      .from("materiales")
      .select("stock_actual")
      .eq("id", abundante)
      .single();
    expect(Number(mAbundante?.stock_actual)).toBe(1000);

    const { data: mProducto } = await admin
      .from("materiales")
      .select("stock_actual")
      .eq("id", producto)
      .single();
    expect(Number(mProducto?.stock_actual)).toBe(0);
  });

  it("rechaza un material sin receta configurada", async () => {
    const sinReceta = await crearMaterial("sin receta producir", 0, 0);
    const { error } = await admin.rpc("producir", {
      p_producto_id: sinReceta,
      p_cantidad: 1,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(
      /no tiene una receta de producción configurada/i
    );
  });

  it("rechaza cantidad <= 0", async () => {
    const c = await crearMaterial("componente cantidad0", 10, 10);
    const producto = await crearMaterial("producto cantidad0", 0, 0);
    await guardarReceta(producto, [{ componente_id: c, cantidad_por_unidad: 1 }]);

    const { error } = await admin.rpc("producir", {
      p_producto_id: producto,
      p_cantidad: 0,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/mayor a cero/i);
  });
});
