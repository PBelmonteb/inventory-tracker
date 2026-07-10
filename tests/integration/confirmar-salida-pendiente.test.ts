// RPC confirmar_salida_pendiente(p_id, p_cantidad default null):
// - sin p_cantidad: confirma todo lo pendiente -> movimiento de salida +
//   salida_pendiente pasa a "registrada".
// - con p_cantidad < cantidad pendiente: entrega parcial -> resta la
//   cantidad y la salida SIGUE "pendiente" por el resto.
// - valida contra el stock real vía el trigger trg_validar_movimiento de
//   la tabla movimientos (no confía solo en la cantidad "reservada").
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient, tieneCredenciales } from "./helpers";

describe.skipIf(!tieneCredenciales)("RPC confirmar_salida_pendiente", () => {
  let admin: SupabaseClient;
  let clienteId: string;
  let materialId: string;
  let casoVentaId: string;

  beforeAll(() => {
    admin = getAdminClient();
  });

  // Cada test arma su propio material + cliente + caso_venta desde cero
  // (el stock inicial varía por test), y afterEach limpia por ID exacto.
  async function crearFixture(stockInicial: number) {
    const { data: material, error: mErr } = await admin
      .from("materiales")
      .insert({ nombre: "[test] material salida pendiente", stock_actual: stockInicial })
      .select()
      .single();
    expect(mErr).toBeNull();
    materialId = material!.id;

    const { data: cliente, error: cErr } = await admin
      .from("clientes")
      .insert({ nombre: `[test] cliente salida ${Date.now()}` })
      .select()
      .single();
    expect(cErr).toBeNull();
    clienteId = cliente!.id;

    const { data: caso, error: casoErr } = await admin
      .from("casos_venta")
      .insert({ cliente_id: clienteId, titulo: "[test] caso salida pendiente" })
      .select()
      .single();
    expect(casoErr).toBeNull();
    casoVentaId = caso!.id;
    return { materialId, casoVentaId: caso!.id as string };
  }

  async function crearSalidaPendiente(casoVentaId: string, cantidad: number) {
    const { data, error } = await admin
      .from("salidas_pendientes")
      .insert({ caso_venta_id: casoVentaId, material_id: materialId, cantidad })
      .select()
      .single();
    expect(error).toBeNull();
    return data!.id as string;
  }

  afterEach(async () => {
    // OJO: casos_venta.cliente_id y movimientos.material_id son "on delete
    // SET NULL" (historial autónomo), no cascade -- hay que borrar el caso
    // y los movimientos generados por la RPC explícitamente, no asumir que
    // se van solos al borrar cliente/material.
    if (materialId)
      await admin.from("movimientos").delete().eq("material_id", materialId);
    if (casoVentaId)
      await admin.from("casos_venta").delete().eq("id", casoVentaId);
    if (clienteId) await admin.from("clientes").delete().eq("id", clienteId);
    if (materialId) await admin.from("materiales").delete().eq("id", materialId);
  });

  it("confirmación total: crea el movimiento de salida y descuenta el stock", async () => {
    const { casoVentaId } = await crearFixture(100);
    const spId = await crearSalidaPendiente(casoVentaId, 30);

    const { error: rpcErr } = await admin.rpc("confirmar_salida_pendiente", {
      p_id: spId,
    });
    expect(rpcErr).toBeNull();

    const { data: material } = await admin
      .from("materiales")
      .select("stock_actual")
      .eq("id", materialId)
      .single();
    expect(Number(material?.stock_actual)).toBe(70);

    const { data: sp } = await admin
      .from("salidas_pendientes")
      .select("estado, movimiento_id, cantidad")
      .eq("id", spId)
      .single();
    expect(sp?.estado).toBe("registrada");
    expect(sp?.movimiento_id).not.toBeNull();
    expect(Number(sp?.cantidad)).toBe(30);
  });

  it("confirmación parcial: descuenta solo lo confirmado y deja el resto pendiente", async () => {
    const { casoVentaId } = await crearFixture(100);
    const spId = await crearSalidaPendiente(casoVentaId, 30);

    const { error: rpcErr } = await admin.rpc("confirmar_salida_pendiente", {
      p_id: spId,
      p_cantidad: 10,
    });
    expect(rpcErr).toBeNull();

    const { data: material } = await admin
      .from("materiales")
      .select("stock_actual")
      .eq("id", materialId)
      .single();
    expect(Number(material?.stock_actual)).toBe(90);

    const { data: sp } = await admin
      .from("salidas_pendientes")
      .select("estado, movimiento_id, cantidad")
      .eq("id", spId)
      .single();
    expect(sp?.estado).toBe("pendiente");
    expect(sp?.movimiento_id).toBeNull();
    expect(Number(sp?.cantidad)).toBe(20);
  });

  it("rechaza confirmar más de lo pendiente", async () => {
    const { casoVentaId } = await crearFixture(100);
    const spId = await crearSalidaPendiente(casoVentaId, 30);

    const { error: rpcErr } = await admin.rpc("confirmar_salida_pendiente", {
      p_id: spId,
      p_cantidad: 50,
    });
    expect(rpcErr).not.toBeNull();
    expect(rpcErr?.message).toMatch(/no puede confirmar más de lo pendiente/i);

    const { data: sp } = await admin
      .from("salidas_pendientes")
      .select("estado, cantidad")
      .eq("id", spId)
      .single();
    expect(sp?.estado).toBe("pendiente");
    expect(Number(sp?.cantidad)).toBe(30);
  });

  it("rechaza confirmar una salida que ya fue resuelta", async () => {
    const { casoVentaId } = await crearFixture(100);
    const spId = await crearSalidaPendiente(casoVentaId, 30);

    const { error: primeraErr } = await admin.rpc("confirmar_salida_pendiente", {
      p_id: spId,
    });
    expect(primeraErr).toBeNull();

    const { error: segundaErr } = await admin.rpc("confirmar_salida_pendiente", {
      p_id: spId,
    });
    expect(segundaErr).not.toBeNull();
    expect(segundaErr?.message).toMatch(/ya fue resuelta/i);
  });

  it("respeta el stock real vigente, no solo la cantidad reservada (trg_validar_movimiento)", async () => {
    // La salida pendiente reservó 30, pero el stock real bajó a 5 después
    // (p.ej. otro movimiento lo consumió) — el trigger de movimientos debe
    // rechazar la salida aunque la "reserva" diga que hay 30.
    const { casoVentaId } = await crearFixture(30);
    const spId = await crearSalidaPendiente(casoVentaId, 30);

    await admin.from("materiales").update({ stock_actual: 5 }).eq("id", materialId);

    const { error: rpcErr } = await admin.rpc("confirmar_salida_pendiente", {
      p_id: spId,
    });
    expect(rpcErr).not.toBeNull();
    expect(rpcErr?.message).toMatch(/stock insuficiente/i);

    const { data: sp } = await admin
      .from("salidas_pendientes")
      .select("estado")
      .eq("id", spId)
      .single();
    expect(sp?.estado).toBe("pendiente");
  });
});
