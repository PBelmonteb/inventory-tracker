// RPC recibir_caso_compra(p_caso, p_cantidad, p_costo, p_ubicacion default
// null): recibir un caso de compra genera la entrada de stock (con costo ->
// alimenta el WAC vía trg_procesar_costo_movimiento) y cierra el ciclo
// OC -> inventario. Transaccional e idempotente (no se puede re-recibir).
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient, tieneCredenciales } from "./helpers";

describe.skipIf(!tieneCredenciales)("RPC recibir_caso_compra", () => {
  let admin: SupabaseClient;
  let materialId: string | null;
  let proveedorId: string | null;
  let ubicacionId: string | null;
  // OJO: casos_compra.proveedor_id/material_id y movimientos/historial_precios
  // .material_id son "on delete SET NULL" (historial autónomo), NO cascade —
  // hay que borrarlos explícitamente. Solo material_stock_ubicacion.material_id
  // sigue siendo cascade de verdad (migración 0011).
  let casoCompraId: string | null;

  beforeAll(() => {
    admin = getAdminClient();
  });

  afterEach(async () => {
    if (casoCompraId) await admin.from("casos_compra").delete().eq("id", casoCompraId);
    if (materialId) {
      await admin.from("historial_precios").delete().eq("material_id", materialId);
      await admin.from("movimientos").delete().eq("material_id", materialId);
    }
    if (proveedorId) await admin.from("proveedores").delete().eq("id", proveedorId);
    if (materialId) await admin.from("materiales").delete().eq("id", materialId);
    if (ubicacionId) await admin.from("ubicaciones").delete().eq("id", ubicacionId);
    proveedorId = materialId = ubicacionId = casoCompraId = null;
  });

  async function crearProveedor() {
    const { data, error } = await admin
      .from("proveedores")
      .insert({ nombre: `[test] proveedor recepción ${Date.now()}` })
      .select()
      .single();
    expect(error).toBeNull();
    proveedorId = data!.id;
    return proveedorId as string;
  }

  async function crearMaterial(overrides: Record<string, unknown> = {}) {
    const { data, error } = await admin
      .from("materiales")
      .insert({
        nombre: "[test] material recepción " + Date.now(),
        stock_actual: 100,
        costo_unitario: 10,
        ...overrides,
      })
      .select()
      .single();
    expect(error).toBeNull();
    materialId = data!.id;
    return materialId as string;
  }

  async function crearCasoCompra(
    matId: string | null,
    provId: string,
    overrides: Record<string, unknown> = {}
  ) {
    const { data, error } = await admin
      .from("casos_compra")
      .insert({
        proveedor_id: provId,
        material_id: matId,
        titulo: "[test] caso recepción",
        ...overrides,
      })
      .select()
      .single();
    expect(error).toBeNull();
    casoCompraId = data!.id;
    return data!.id as string;
  }

  it("recibe el caso: crea el movimiento, suma stock y recalcula el WAC", async () => {
    const provId = await crearProveedor();
    const matId = await crearMaterial({ stock_actual: 100, costo_unitario: 10 });
    const casoId = await crearCasoCompra(matId, provId);

    const { error: rpcErr } = await admin.rpc("recibir_caso_compra", {
      p_caso: casoId,
      p_cantidad: 50,
      p_costo: 16,
    });
    expect(rpcErr).toBeNull();

    // WAC = (100*10 + 50*16) / 150 = 12
    const { data: material } = await admin
      .from("materiales")
      .select("stock_actual, costo_unitario")
      .eq("id", matId)
      .single();
    expect(Number(material?.stock_actual)).toBe(150);
    expect(Number(material?.costo_unitario)).toBe(12);

    const { data: caso } = await admin
      .from("casos_compra")
      .select("estado, movimiento_id")
      .eq("id", casoId)
      .single();
    expect(caso?.estado).toBe("recibido");
    expect(caso?.movimiento_id).not.toBeNull();

    const { data: hist } = await admin
      .from("historial_precios")
      .select("valor, fuente")
      .eq("material_id", matId)
      .eq("tipo", "costo")
      .eq("fuente", "compra");
    expect(hist).toHaveLength(1);
    expect(Number(hist![0].valor)).toBe(16);
  });

  it("sin costo (0): no mueve el WAC, el movimiento hace snapshot del costo vigente", async () => {
    const provId = await crearProveedor();
    const matId = await crearMaterial({ stock_actual: 100, costo_unitario: 10 });
    const casoId = await crearCasoCompra(matId, provId);

    const { error: rpcErr } = await admin.rpc("recibir_caso_compra", {
      p_caso: casoId,
      p_cantidad: 50,
      p_costo: 0,
    });
    expect(rpcErr).toBeNull();

    const { data: material } = await admin
      .from("materiales")
      .select("stock_actual, costo_unitario")
      .eq("id", matId)
      .single();
    expect(Number(material?.stock_actual)).toBe(150);
    expect(Number(material?.costo_unitario)).toBe(10); // sin cambio

    const { data: caso } = await admin
      .from("casos_compra")
      .select("movimiento_id")
      .eq("id", casoId)
      .single();
    const { data: mov } = await admin
      .from("movimientos")
      .select("costo_unitario")
      .eq("id", caso!.movimiento_id)
      .single();
    expect(Number(mov?.costo_unitario)).toBe(10); // snapshot del WAC vigente
  });

  it("rechaza recibir un caso que ya fue recibido (idempotencia)", async () => {
    const provId = await crearProveedor();
    const matId = await crearMaterial();
    const casoId = await crearCasoCompra(matId, provId);

    const { error: primeraErr } = await admin.rpc("recibir_caso_compra", {
      p_caso: casoId,
      p_cantidad: 50,
      p_costo: 16,
    });
    expect(primeraErr).toBeNull();

    const { error: segundaErr } = await admin.rpc("recibir_caso_compra", {
      p_caso: casoId,
      p_cantidad: 50,
      p_costo: 16,
    });
    expect(segundaErr).not.toBeNull();
    expect(segundaErr?.message).toMatch(/ya fue recibido/i);

    // No debe haber duplicado el stock.
    const { data: material } = await admin
      .from("materiales")
      .select("stock_actual")
      .eq("id", matId)
      .single();
    expect(Number(material?.stock_actual)).toBe(150);
  });

  it("rechaza un caso sin material asignado", async () => {
    const provId = await crearProveedor();
    const casoId = await crearCasoCompra(null, provId);

    const { error: rpcErr } = await admin.rpc("recibir_caso_compra", {
      p_caso: casoId,
      p_cantidad: 50,
      p_costo: 16,
    });
    expect(rpcErr).not.toBeNull();
    expect(rpcErr?.message).toMatch(/no tiene un material asignado/i);
  });

  it("rechaza cantidad <= 0", async () => {
    const provId = await crearProveedor();
    const matId = await crearMaterial();
    const casoId = await crearCasoCompra(matId, provId);

    const { error: rpcErr } = await admin.rpc("recibir_caso_compra", {
      p_caso: casoId,
      p_cantidad: 0,
      p_costo: 16,
    });
    expect(rpcErr).not.toBeNull();
    expect(rpcErr?.message).toMatch(/cantidad debe ser mayor a cero/i);
  });

  it("con p_ubicacion: el stock recibido se atribuye a esa ubicación específica", async () => {
    const provId = await crearProveedor();
    const matId = await crearMaterial({ stock_actual: 0, costo_unitario: 10 });
    const casoId = await crearCasoCompra(matId, provId);

    const { data: ubic, error: uErr } = await admin
      .from("ubicaciones")
      .insert({ nombre: `[test] ubicación recepción ${Date.now()}` })
      .select()
      .single();
    expect(uErr).toBeNull();
    ubicacionId = ubic!.id;

    const { error: rpcErr } = await admin.rpc("recibir_caso_compra", {
      p_caso: casoId,
      p_cantidad: 40,
      p_costo: 10,
      p_ubicacion: ubicacionId,
    });
    expect(rpcErr).toBeNull();

    const { data: filaUbic } = await admin
      .from("material_stock_ubicacion")
      .select("stock")
      .eq("material_id", matId)
      .eq("ubicacion_id", ubicacionId)
      .single();
    expect(Number(filaUbic?.stock)).toBe(40);

    // El total del material también debe reflejar la suma.
    const { data: material } = await admin
      .from("materiales")
      .select("stock_actual")
      .eq("id", matId)
      .single();
    expect(Number(material?.stock_actual)).toBe(40);
  });
});
