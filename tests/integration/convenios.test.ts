// Convenios con proveedores: precio pactado + condiciones para un par
// proveedor+material. Se prueba que generarCasosAutomaticosPorStockBajo
// (lib/casos-automaticos.ts) los detecta y les da prioridad sobre el WAC
// del material y el tiempo de entrega declarado del proveedor.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient, tieneCredenciales } from "./helpers";
import { generarCasosAutomaticosPorStockBajo } from "@/lib/casos-automaticos";

describe.skipIf(!tieneCredenciales)("Convenios con proveedores", () => {
  let admin: SupabaseClient;
  let proveedorId: string | null;
  let materialId: string | null;
  let convenioId: string | null;

  beforeAll(() => {
    admin = getAdminClient();
  });

  afterEach(async () => {
    if (convenioId) await admin.from("convenios_proveedor").delete().eq("id", convenioId);
    if (materialId) {
      await admin.from("casos_compra").delete().eq("material_id", materialId);
      await admin.from("notificaciones").delete().eq("material_id", materialId);
      await admin.from("historial_precios").delete().eq("material_id", materialId);
      await admin.from("materiales").delete().eq("id", materialId);
    }
    if (proveedorId) await admin.from("proveedores").delete().eq("id", proveedorId);
    proveedorId = materialId = convenioId = null;
  });

  async function crearProveedor(
    diasEntregaDeclarado: number,
    contacto: string | null = null
  ) {
    const { data, error } = await admin
      .from("proveedores")
      .insert({
        nombre: `[test] proveedor convenio ${Date.now()}`,
        dias_entrega_declarado: diasEntregaDeclarado,
        contacto,
      })
      .select()
      .single();
    expect(error).toBeNull();
    proveedorId = data!.id;
    return proveedorId as string;
  }

  async function crearMaterial(provId: string) {
    const { data, error } = await admin
      .from("materiales")
      .insert({
        nombre: "[test] material convenio " + Date.now(),
        proveedor_id: provId,
        stock_actual: 5,
        stock_minimo: 10,
        costo_unitario: 100, // WAC — el convenio debe ganarle
      })
      .select()
      .single();
    expect(error).toBeNull();
    materialId = data!.id;
    return materialId as string;
  }

  async function crearConvenio(
    provId: string,
    matId: string,
    overrides: Record<string, unknown> = {}
  ) {
    const { data, error } = await admin
      .from("convenios_proveedor")
      .insert({
        proveedor_id: provId,
        material_id: matId,
        precio_pactado: 80,
        cantidad_minima: 50,
        dias_entrega_pactado: 3,
        ...overrides,
      })
      .select()
      .single();
    expect(error).toBeNull();
    convenioId = data!.id;
    return data!.id as string;
  }

  it("usa el precio pactado, el tiempo de entrega y la cantidad mínima del convenio", async () => {
    const provId = await crearProveedor(10); // declarado del proveedor: 10 días
    const matId = await crearMaterial(provId);
    await crearConvenio(provId, matId); // precio 80, mínimo 50, entrega 3 días

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

    // Sin historial de salidas: la cantidad calculada por la fórmula (piso
    // basado en stock_minimo) sería mucho menor a 50 — el mínimo del
    // convenio debe ganar.
    // monto_estimado = precio_pactado (80) × cantidad (50) = 4000, NO
    // costo_unitario (100) × cantidad.
    expect(Number(caso.monto_estimado)).toBe(4000);
    // Tiempo de entrega usado: el pactado (3), no el declarado del
    // proveedor (10).
    expect(Number(caso.lead_time_dias_usado)).toBe(3);
    expect(caso.descripcion).toMatch(/convenio vigente/i);
  });

  it("al desactivar el convenio, vuelve a depender del WAC y del tiempo de entrega declarado del proveedor", async () => {
    const provId = await crearProveedor(10);
    const matId = await crearMaterial(provId);
    const cId = await crearConvenio(provId, matId);

    // Primera corrida: usa el convenio y crea el caso.
    await generarCasosAutomaticosPorStockBajo(admin, { materialIds: [matId] });
    const { data: casoConConvenio } = await admin
      .from("casos_compra")
      .select("id")
      .eq("material_id", matId)
      .single();
    expect(casoConConvenio).not.toBeNull();

    // Se cancela el caso (libera el guard de "caso abierto") y se
    // desactiva el convenio para simular que ya no aplica.
    await admin
      .from("casos_compra")
      .update({ estado: "cancelado" })
      .eq("id", casoConConvenio!.id);
    await admin.from("convenios_proveedor").update({ activo: false }).eq("id", cId);

    const resumen = await generarCasosAutomaticosPorStockBajo(admin, {
      materialIds: [matId],
    });
    expect(resumen.casosCreados).toBe(1);

    const { data: casos } = await admin
      .from("casos_compra")
      .select("*")
      .eq("material_id", matId)
      .neq("id", casoConConvenio!.id);
    expect(casos).toHaveLength(1);
    const caso = casos![0];

    // Ya sin convenio: usa costo_unitario (100) y el tiempo declarado del
    // proveedor (10), no los valores del convenio desactivado.
    expect(Number(caso.lead_time_dias_usado)).toBe(10);
    expect(caso.descripcion).not.toMatch(/convenio vigente/i);
  });

  it("no usa un convenio vencido", async () => {
    const provId = await crearProveedor(10);
    const matId = await crearMaterial(provId);
    await crearConvenio(provId, matId, {
      vigencia_hasta: "2020-01-01", // muy en el pasado
    });

    const resumen = await generarCasosAutomaticosPorStockBajo(admin, {
      materialIds: [matId],
    });
    expect(resumen.casosCreados).toBe(1);

    const { data: caso } = await admin
      .from("casos_compra")
      .select("lead_time_dias_usado, descripcion, monto_estimado")
      .eq("material_id", matId)
      .single();
    expect(Number(caso!.lead_time_dias_usado)).toBe(10); // declarado, no pactado
    expect(caso!.descripcion).not.toMatch(/convenio vigente/i);
  });

  describe("envío automático de orden (auto_enviar)", () => {
    it("con auto_enviar pero sin correo del proveedor: el caso se queda en pendiente con una nota", async () => {
      const provId = await crearProveedor(10, null); // sin contacto
      const matId = await crearMaterial(provId);
      await crearConvenio(provId, matId, { auto_enviar: true });

      await generarCasosAutomaticosPorStockBajo(admin, { materialIds: [matId] });

      const { data: caso } = await admin
        .from("casos_compra")
        .select("estado, correo_enviado_at, descripcion")
        .eq("material_id", matId)
        .single();
      expect(caso!.estado).toBe("pendiente");
      expect(caso!.correo_enviado_at).toBeNull();
      expect(caso!.descripcion).toMatch(/no tiene correo registrado/i);
    });

    it("con auto_enviar y correo, pero sin el servicio de correo configurado en este entorno: se queda en pendiente, nunca finge un envío", async () => {
      // Este test corre sin RESEND_API_KEY en el entorno (es el estado real
      // hasta que se configure un dominio) — verifica el camino seguro por
      // defecto: nunca marcar "ordenado"/correo_enviado_at sin haber
      // enviado nada de verdad.
      expect(process.env.RESEND_API_KEY).toBeFalsy();

      const provId = await crearProveedor(10, "compras@proveedor-test.mx");
      const matId = await crearMaterial(provId);
      await crearConvenio(provId, matId, { auto_enviar: true });

      await generarCasosAutomaticosPorStockBajo(admin, { materialIds: [matId] });

      const { data: caso } = await admin
        .from("casos_compra")
        .select("estado, correo_enviado_at, descripcion")
        .eq("material_id", matId)
        .single();
      expect(caso!.estado).toBe("pendiente");
      expect(caso!.correo_enviado_at).toBeNull();
      expect(caso!.descripcion).toMatch(/envío automático configurado pero falló/i);
    });
  });
});
