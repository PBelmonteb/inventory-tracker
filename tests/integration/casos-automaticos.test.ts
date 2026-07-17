// generarCasosAutomaticosPorStockBajo (lib/casos-automaticos.ts): crea
// automáticamente un caso de compra "pendiente" cuando el stock cruza su
// punto de reposición, sin depender de que alguien abra la app. Se prueba
// contra Supabase real (como recibir-caso-compra.test.ts) porque ejercita
// RLS/columnas reales; se acota siempre con `materialIds` para no barrer
// el catálogo completo del proyecto de pruebas.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient, tieneCredenciales } from "./helpers";
import { generarCasosAutomaticosPorStockBajo } from "@/lib/casos-automaticos";

describe.skipIf(!tieneCredenciales)("generarCasosAutomaticosPorStockBajo", () => {
  let admin: SupabaseClient;
  let proveedorId: string | null;
  let materialId: string | null;

  beforeAll(() => {
    admin = getAdminClient();
  });

  afterEach(async () => {
    if (materialId) {
      await admin.from("casos_compra").delete().eq("material_id", materialId);
      await admin.from("notificaciones").delete().eq("material_id", materialId);
      await admin.from("movimientos").delete().eq("material_id", materialId);
      await admin.from("materiales").delete().eq("id", materialId);
    }
    if (proveedorId) await admin.from("proveedores").delete().eq("id", proveedorId);
    proveedorId = materialId = null;
  });

  async function crearProveedor(diasEntregaDeclarado: number | null = null) {
    const { data, error } = await admin
      .from("proveedores")
      .insert({
        nombre: `[test] proveedor reposición ${Date.now()}`,
        dias_entrega_declarado: diasEntregaDeclarado,
      })
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
        nombre: "[test] material reposición " + Date.now(),
        stock_actual: 0,
        stock_minimo: 0,
        costo_unitario: 0,
        ...overrides,
      })
      .select()
      .single();
    expect(error).toBeNull();
    materialId = data!.id;
    return materialId as string;
  }

  it("crea un caso pendiente con nivel de riesgo cuando el stock está en o bajo el mínimo", async () => {
    const provId = await crearProveedor(5); // tiempo de entrega declarado: 5 días
    const matId = await crearMaterial({
      proveedor_id: provId,
      stock_actual: 8,
      stock_minimo: 10,
    });

    const resumen = await generarCasosAutomaticosPorStockBajo(admin, {
      materialIds: [matId],
    });

    expect(resumen.casosCreados).toBe(1);

    const { data: casos } = await admin
      .from("casos_compra")
      .select("*")
      .eq("material_id", matId);
    expect(casos).toHaveLength(1);
    const caso = casos![0];
    expect(caso.estado).toBe("pendiente");
    expect(caso.origen).toBe("stock_bajo");
    expect(caso.proveedor_id).toBe(provId);
    // Sin historial de salidas no se puede estimar la cobertura, pero sí se
    // conoce el tiempo de entrega declarado -> riesgo "alto" (no "crítico"
    // ni "medio", ver lib/riesgo-stock.ts).
    expect(caso.nivel_riesgo).toBe("alto");
    expect(Number(caso.lead_time_dias_usado)).toBe(5);
    expect(caso.dias_cobertura_restante).toBeNull();
  });

  it("no duplica el caso si ya existe uno abierto para el material", async () => {
    const provId = await crearProveedor(5);
    const matId = await crearMaterial({
      proveedor_id: provId,
      stock_actual: 8,
      stock_minimo: 10,
    });
    const { error } = await admin.from("casos_compra").insert({
      proveedor_id: provId,
      material_id: matId,
      titulo: "[test] caso ya abierto",
      estado: "cotizando",
      origen: "manual",
    });
    expect(error).toBeNull();

    const resumen = await generarCasosAutomaticosPorStockBajo(admin, {
      materialIds: [matId],
    });
    expect(resumen.casosCreados).toBe(0);

    const { data: casos } = await admin
      .from("casos_compra")
      .select("id")
      .eq("material_id", matId);
    expect(casos).toHaveLength(1); // sigue siendo solo el manual, no se agregó otro
  });

  it("no crea caso para un material sin proveedor asignado", async () => {
    const matId = await crearMaterial({
      proveedor_id: null,
      stock_actual: 0,
      stock_minimo: 10,
    });

    const resumen = await generarCasosAutomaticosPorStockBajo(admin, {
      materialIds: [matId],
    });
    expect(resumen.materialesRevisados).toBe(0);
    expect(resumen.casosCreados).toBe(0);
  });

  it("no crea caso si el mínimo no está configurado y no hay historial para la fórmula", async () => {
    const provId = await crearProveedor(5);
    const matId = await crearMaterial({
      proveedor_id: provId,
      stock_actual: 0,
      stock_minimo: 0, // "sin configurar", igual que sincronizar_notificaciones()
    });

    const resumen = await generarCasosAutomaticosPorStockBajo(admin, {
      materialIds: [matId],
    });
    expect(resumen.materialesRevisados).toBe(1);
    expect(resumen.casosCreados).toBe(0);
  });

  it("resuelve las notificaciones abiertas del material y agrega una explicando el caso automático", async () => {
    const provId = await crearProveedor(5);
    const matId = await crearMaterial({
      proveedor_id: provId,
      stock_actual: 8,
      stock_minimo: 10,
    });
    const { data: notifPrevia, error } = await admin
      .from("notificaciones")
      .insert({
        material_id: matId,
        proveedor_id: provId,
        mensaje: "[test] alerta previa",
        estado: "abierta",
        nivel: "bajo",
        tipo: "stock",
      })
      .select()
      .single();
    expect(error).toBeNull();

    await generarCasosAutomaticosPorStockBajo(admin, { materialIds: [matId] });

    const { data: notifs } = await admin
      .from("notificaciones")
      .select("*")
      .eq("material_id", matId)
      .order("created_at", { ascending: true });

    const previaActualizada = notifs!.find((n) => n.id === notifPrevia!.id);
    expect(previaActualizada?.estado).toBe("atendida");
    expect(previaActualizada?.caso_compra_id).not.toBeNull();

    const nueva = notifs!.find((n) => n.id !== notifPrevia!.id);
    expect(nueva).toBeDefined();
    expect(nueva?.estado).toBe("abierta");
    expect(nueva?.caso_compra_id).not.toBeNull();
    expect(nueva?.mensaje).toMatch(/generó automáticamente/i);
  });
});
