// RPC sincronizar_notificaciones(): genera/actualiza/resuelve alertas de
// stock bajo o "por agotarse". Es la lógica que ya tuvo una regresión real
// (stock_minimo = 0 tratado como "el mínimo es cero" en vez de "sin
// configurar") — ver lib/utils.test.ts para el equivalente del lado cliente.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient, tieneCredenciales } from "./helpers";

describe.skipIf(!tieneCredenciales)("RPC sincronizar_notificaciones", () => {
  let admin: SupabaseClient;
  let materialId: string | null;
  let proveedorId: string | null;
  // OJO: casos_compra.proveedor_id/material_id son "on delete SET NULL"
  // (migración 0009, historial autónomo), NO cascade — hay que borrar el
  // caso por su propio ID, no asumir que se va solo con el proveedor.
  let casoCompraId: string | null;

  beforeAll(() => {
    admin = getAdminClient();
  });

  afterEach(async () => {
    // materiales sí cascada -> notificaciones (no tocado por 0009).
    if (casoCompraId) {
      await admin.from("casos_compra").delete().eq("id", casoCompraId);
      casoCompraId = null;
    }
    if (materialId) {
      await admin.from("materiales").delete().eq("id", materialId);
      materialId = null;
    }
    if (proveedorId) {
      await admin.from("proveedores").delete().eq("id", proveedorId);
      proveedorId = null;
    }
  });

  async function crearMaterialBajo(overrides: Record<string, unknown> = {}) {
    const { data, error } = await admin
      .from("materiales")
      .insert({
        nombre: "[test] material notificaciones " + Date.now(),
        stock_minimo: 100,
        stock_actual: 50, // <= stock_minimo -> nivel "bajo"
        aviso_valor: 20,
        aviso_modo: "porcentaje",
        ...overrides,
      })
      .select()
      .single();
    expect(error).toBeNull();
    materialId = data!.id;
    return data!.id as string;
  }

  it("genera una notificación nueva para un material con stock bajo", async () => {
    const id = await crearMaterialBajo();

    const { error: rpcErr } = await admin.rpc("sincronizar_notificaciones");
    expect(rpcErr).toBeNull();

    const { data: notifs } = await admin
      .from("notificaciones")
      .select("estado, nivel")
      .eq("material_id", id);
    expect(notifs).toHaveLength(1);
    expect(notifs![0].estado).toBe("abierta");
    expect(notifs![0].nivel).toBe("bajo");
  });

  it("es idempotente: correrla otra vez no duplica la notificación", async () => {
    const id = await crearMaterialBajo();

    await admin.rpc("sincronizar_notificaciones");
    await admin.rpc("sincronizar_notificaciones");

    const { data: notifs } = await admin
      .from("notificaciones")
      .select("id")
      .eq("material_id", id);
    expect(notifs).toHaveLength(1);
  });

  it("auto-resuelve la notificación cuando el stock vuelve a subir", async () => {
    const id = await crearMaterialBajo();
    await admin.rpc("sincronizar_notificaciones");

    await admin.from("materiales").update({ stock_actual: 500 }).eq("id", id);
    const { error: rpcErr } = await admin.rpc("sincronizar_notificaciones");
    expect(rpcErr).toBeNull();

    const { data: notifs } = await admin
      .from("notificaciones")
      .select("estado, resuelta_at")
      .eq("material_id", id);
    expect(notifs).toHaveLength(1);
    expect(notifs![0].estado).toBe("atendida");
    expect(notifs![0].resuelta_at).not.toBeNull();
  });

  it("stock_minimo <= 0 ('sin configurar') nunca genera notificación, aunque el stock sea 0", async () => {
    // Regresión: antes de la migración 0013 esto se trataba como "el
    // mínimo real es cero" y sí disparaba una alerta.
    const id = await crearMaterialBajo({ stock_minimo: 0, stock_actual: 0 });

    const { error: rpcErr } = await admin.rpc("sincronizar_notificaciones");
    expect(rpcErr).toBeNull();

    const { data: notifs } = await admin
      .from("notificaciones")
      .select("id")
      .eq("material_id", id);
    expect(notifs).toHaveLength(0);
  });

  it("no genera notificación si ya hay un caso de compra abierto para ese material", async () => {
    const id = await crearMaterialBajo();

    const { data: proveedor, error: pErr } = await admin
      .from("proveedores")
      .insert({ nombre: `[test] proveedor notificaciones ${Date.now()}` })
      .select()
      .single();
    expect(pErr).toBeNull();
    proveedorId = proveedor!.id;

    const { data: caso, error: casoErr } = await admin
      .from("casos_compra")
      .insert({
        proveedor_id: proveedorId,
        material_id: id,
        titulo: "[test] cotización ya en curso",
        estado: "cotizando",
      })
      .select()
      .single();
    expect(casoErr).toBeNull();
    casoCompraId = caso!.id;

    const { error: rpcErr } = await admin.rpc("sincronizar_notificaciones");
    expect(rpcErr).toBeNull();

    const { data: notifs } = await admin
      .from("notificaciones")
      .select("id")
      .eq("material_id", id);
    expect(notifs).toHaveLength(0);
  });
});
