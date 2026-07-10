// Tests de integración contra el proyecto de Supabase REAL de desarrollo
// (no un mock). Corren aparte de `npm test`: `npm run test:integration`.
//
// Regla de oro: cada test crea sus propias filas (nombradas "[test] ...") y
// las borra en su propio cleanup usando los IDs que le devolvió Supabase al
// crearlas — nunca por nombre/wildcard, y nunca toca filas preexistentes.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { anonKey, getAdminClient, tieneCredenciales, url } from "./helpers";

describe.skipIf(!tieneCredenciales)(
  "Supabase real: RLS y RPCs",
  () => {
    let admin: SupabaseClient;
    const materialIdsACleanear: string[] = [];
    const clienteIdsACleanear: string[] = [];
    // OJO: casos_venta.cliente_id es "on delete SET NULL" (migración 0009,
    // historial autónomo), NO cascade — borrar el cliente NO se lleva el
    // caso. Hay que borrar el caso por su propio ID explícitamente.
    const casoVentaIdsACleanear: string[] = [];

    beforeAll(() => {
      admin = getAdminClient();
    });

    afterAll(async () => {
      if (casoVentaIdsACleanear.length)
        await admin.from("casos_venta").delete().in("id", casoVentaIdsACleanear);
      if (clienteIdsACleanear.length)
        await admin.from("clientes").delete().in("id", clienteIdsACleanear);
      if (materialIdsACleanear.length)
        await admin.from("materiales").delete().in("id", materialIdsACleanear);
    });

    it("un operario NO puede insertar un material directo (RLS: materiales_insert requiere es_gestor())", async () => {
      const email = `test-operario-${Date.now()}@example.test`;
      const password = crypto.randomUUID();

      const { data: userData, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
      expect(createErr).toBeNull();
      const userId = userData!.user!.id;

      try {
        const anon = createClient(url!, anonKey!);
        const { error: signInErr } = await anon.auth.signInWithPassword({
          email,
          password,
        });
        expect(signInErr).toBeNull();

        const { error: insertErr } = await anon
          .from("materiales")
          .insert({ nombre: "[test] no debería crearse" });

        expect(insertErr).not.toBeNull();
        expect(insertErr?.code).toBe("42501");
      } finally {
        // Borra también el profile vía "on delete cascade" del schema.
        await admin.auth.admin.deleteUser(userId);
      }
    });

    describe("RPC cambiar_estado_caso_venta — bloqueo de sobreventa", () => {
      it("rechaza confirmar un caso que pide más de lo disponible", async () => {
        const { data: material, error: mErr } = await admin
          .from("materiales")
          .insert({ nombre: "[test] material RPC sobreventa", stock_actual: 10 })
          .select()
          .single();
        expect(mErr).toBeNull();
        materialIdsACleanear.push(material!.id);

        const { data: cliente, error: cErr } = await admin
          .from("clientes")
          .insert({ nombre: `[test] cliente RPC ${Date.now()}` })
          .select()
          .single();
        expect(cErr).toBeNull();
        clienteIdsACleanear.push(cliente!.id);

        const { data: caso, error: casoErr } = await admin
          .from("casos_venta")
          .insert({ cliente_id: cliente!.id, titulo: "[test] caso sobreventa" })
          .select()
          .single();
        expect(casoErr).toBeNull();
        casoVentaIdsACleanear.push(caso!.id);

        const { error: itemErr } = await admin.from("casos_venta_items").insert({
          caso_venta_id: caso!.id,
          material_id: material!.id,
          cantidad: 999,
        });
        expect(itemErr).toBeNull();

        const { error: rpcErr } = await admin.rpc("cambiar_estado_caso_venta", {
          p_caso: caso!.id,
          p_estado: "confirmado",
        });
        expect(rpcErr).not.toBeNull();
        expect(rpcErr?.message).toMatch(/sin disponible/i);

        const { data: casoTrasFalla } = await admin
          .from("casos_venta")
          .select("estado")
          .eq("id", caso!.id)
          .single();
        expect(casoTrasFalla?.estado).toBe("cotizacion");
      });

      it("permite confirmar cuando sí alcanza el disponible", async () => {
        const { data: material, error: mErr } = await admin
          .from("materiales")
          .insert({ nombre: "[test] material RPC ok", stock_actual: 10 })
          .select()
          .single();
        expect(mErr).toBeNull();
        materialIdsACleanear.push(material!.id);

        const { data: cliente, error: cErr } = await admin
          .from("clientes")
          .insert({ nombre: `[test] cliente RPC ok ${Date.now()}` })
          .select()
          .single();
        expect(cErr).toBeNull();
        clienteIdsACleanear.push(cliente!.id);

        const { data: caso, error: casoErr } = await admin
          .from("casos_venta")
          .insert({ cliente_id: cliente!.id, titulo: "[test] caso ok" })
          .select()
          .single();
        expect(casoErr).toBeNull();
        casoVentaIdsACleanear.push(caso!.id);

        const { error: itemErr } = await admin.from("casos_venta_items").insert({
          caso_venta_id: caso!.id,
          material_id: material!.id,
          cantidad: 5,
        });
        expect(itemErr).toBeNull();

        const { error: rpcErr } = await admin.rpc("cambiar_estado_caso_venta", {
          p_caso: caso!.id,
          p_estado: "confirmado",
        });
        expect(rpcErr).toBeNull();

        const { data: casoTrasExito } = await admin
          .from("casos_venta")
          .select("estado")
          .eq("id", caso!.id)
          .single();
        expect(casoTrasExito?.estado).toBe("confirmado");
      });
    });
  }
);
