// Condiciones de carrera encontradas en auditoría (jul 2026, migración
// 0021): tres puntos donde un "leer -> decidir -> escribir" sin lock podía
// dejar pasar dos llamadas concurrentes que individualmente parecían
// válidas, pero juntas corrompían el WAC, sobrevendían stock, o dejaban una
// solicitud de compra en un estado contradictorio. Se prueban disparando
// las llamadas concurrentes de verdad (Promise.all sobre el cliente admin,
// cada una es su propia conexión/transacción en Postgres) — no simulado.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient, tieneCredenciales } from "./helpers";

describe.skipIf(!tieneCredenciales)("Condiciones de carrera (migración 0021)", () => {
  let admin: SupabaseClient;
  let materialIds: string[];
  let proveedorIds: string[];
  let casoIds: string[];
  let solicitudId: string | null;
  let ubicacionId: string | null;

  beforeAll(() => {
    admin = getAdminClient();
  });

  beforeEach(() => {
    materialIds = [];
    proveedorIds = [];
    casoIds = [];
    solicitudId = null;
    ubicacionId = null;
  });

  afterEach(async () => {
    if (casoIds.length) {
      await admin.from("casos_compra_eventos").delete().in("caso_compra_id", casoIds);
      await admin.from("casos_compra").delete().in("id", casoIds);
    }
    if (solicitudId) await admin.from("solicitudes_compra").delete().eq("id", solicitudId);
    for (const id of materialIds) {
      await admin.from("historial_precios").delete().eq("material_id", id);
      await admin.from("movimientos").delete().eq("material_id", id);
      await admin.from("material_stock_ubicacion").delete().eq("material_id", id);
    }
    if (materialIds.length) await admin.from("materiales").delete().in("id", materialIds);
    for (const id of proveedorIds) await admin.from("proveedores").delete().eq("id", id);
    if (ubicacionId) await admin.from("ubicaciones").delete().eq("id", ubicacionId);
  });

  async function crearProveedor() {
    const { data, error } = await admin
      .from("proveedores")
      .insert({ nombre: `[test] proveedor carrera ${Date.now()}-${Math.random()}` })
      .select()
      .single();
    expect(error).toBeNull();
    proveedorIds.push(data!.id);
    return data!.id as string;
  }

  async function crearMaterial(overrides: Record<string, unknown> = {}) {
    const { data, error } = await admin
      .from("materiales")
      .insert({
        nombre: "[test] material carrera " + Date.now(),
        stock_actual: 0,
        costo_unitario: 0,
        ...overrides,
      })
      .select()
      .single();
    expect(error).toBeNull();
    materialIds.push(data!.id);
    return data!.id as string;
  }

  it("WAC: dos recepciones concurrentes del mismo material se pliegan las dos (no se pisan)", async () => {
    const provId = await crearProveedor();
    const matId = await crearMaterial({ stock_actual: 100, costo_unitario: 10 });

    async function crearCaso() {
      const { data } = await admin
        .from("casos_compra")
        .insert({ proveedor_id: provId, material_id: matId, titulo: "[test] recepción concurrente" })
        .select()
        .single();
      casoIds.push(data!.id);
      return data!.id as string;
    }
    const casoA = await crearCaso();
    const casoB = await crearCaso();

    // Concurrente de verdad: dos llamadas RPC en paralelo, cada una su
    // propia transacción — exactamente el escenario que antes corrompía el
    // WAC (dos convenios del mismo material recibidos casi al mismo tiempo).
    const [ra, rb] = await Promise.all([
      admin.rpc("recibir_caso_compra", { p_caso: casoA, p_cantidad: 50, p_costo: 16 }),
      admin.rpc("recibir_caso_compra", { p_caso: casoB, p_cantidad: 30, p_costo: 20 }),
    ]);
    expect(ra.error).toBeNull();
    expect(rb.error).toBeNull();

    const { data: material } = await admin
      .from("materiales")
      .select("stock_actual, costo_unitario")
      .eq("id", matId)
      .single();
    // Stock: la suma de ambas siempre debe cuadrar (esto ya funcionaba antes).
    expect(Number(material!.stock_actual)).toBe(180); // 100 + 50 + 30

    // WAC correcto SOLO si ambas entradas se plegaron en orden, cada una
    // viendo el resultado committeado de la anterior (o al revés) — nunca
    // ambas partiendo del mismo "100 @ $10" y pisándose. Verificamos que el
    // resultado final coincida con UNA de las dos secuencias posibles
    // (Postgres serializa el orden real vía el lock, pero no controlamos
    // cuál de las dos gana la carrera por el lock).
    const wacSiAPrimero = (100 * 10 + 50 * 16) / 150; // 12
    const wacSiAPrimeroLuegoB = (150 * wacSiAPrimero + 30 * 20) / 180;
    const wacSiBPrimero = (100 * 10 + 30 * 20) / 130;
    const wacSiBPrimeroLuegoA = (130 * wacSiBPrimero + 50 * 16) / 180;
    const posibles = [wacSiAPrimeroLuegoB, wacSiBPrimeroLuegoA].map((n) => Math.round(n * 100) / 100);
    expect(posibles).toContain(Number(material!.costo_unitario));
  });

  it("sobreventa: dos salidas concurrentes que juntas exceden el stock — solo una debe pasar", async () => {
    const matId = await crearMaterial({ stock_actual: 10, costo_unitario: 5 });

    // Cada una por separado cabe (8 <= 10), pero juntas (16) exceden el
    // stock disponible — antes, el chequeo sin lock dejaba pasar a las dos.
    const [ra, rb] = await Promise.all([
      admin.from("movimientos").insert({ material_id: matId, tipo: "salida", cantidad: 8 }),
      admin.from("movimientos").insert({ material_id: matId, tipo: "salida", cantidad: 8 }),
    ]);
    const errores = [ra.error, rb.error].filter(Boolean);
    const exitos = [ra.error, rb.error].filter((e) => !e);
    expect(exitos).toHaveLength(1);
    expect(errores).toHaveLength(1);
    expect(errores[0]!.message).toMatch(/stock insuficiente/i);

    const { data: material } = await admin
      .from("materiales")
      .select("stock_actual")
      .eq("id", matId)
      .single();
    // Nunca debe quedar negativo: exactamente una salida se aplicó.
    expect(Number(material!.stock_actual)).toBe(2); // 10 - 8
  });

  it("elegir ganadora: dos elecciones concurrentes de la misma solicitud no dejan contradicciones", async () => {
    const provDefault = await crearProveedor();
    const matId = await crearMaterial();
    const codigo = `SOL-${Date.now().toString().slice(-6)}`;
    const { data: sol, error: errSol } = await admin
      .from("solicitudes_compra")
      .insert({ codigo, material_id: matId, titulo: "[test] solicitud concurrente" })
      .select()
      .single();
    expect(errSol).toBeNull();
    solicitudId = sol!.id;

    async function crearCotizacion(i: number) {
      const provId = i === 0 ? provDefault : await crearProveedor();
      const { data } = await admin
        .from("casos_compra")
        .insert({
          proveedor_id: provId,
          material_id: matId,
          titulo: "[test] cotización concurrente",
          referencia: `OC-${Date.now().toString().slice(-6)}-${i}`,
          solicitud_id: solicitudId,
          estado: "cotizando",
        })
        .select()
        .single();
      casoIds.push(data!.id);
      return data!.id as string;
    }
    const casoA = await crearCotizacion(0);
    const casoB = await crearCotizacion(1);
    const casoC = await crearCotizacion(2);

    // Dos personas eligiendo DOS ganadoras distintas casi al mismo tiempo —
    // exactamente el escenario que antes dejaba un caso con "elegida
    // ganadora" Y "cancelada automáticamente" a la vez.
    await Promise.all([
      admin.rpc("resolver_solicitud_compra", { p_solicitud: solicitudId, p_caso_ganador: casoA }),
      admin.rpc("resolver_solicitud_compra", { p_solicitud: solicitudId, p_caso_ganador: casoB }),
    ]);

    const { data: solFinal } = await admin
      .from("solicitudes_compra")
      .select("estado, cotizacion_ganadora_id")
      .eq("id", solicitudId)
      .single();
    expect(solFinal!.estado).toBe("resuelta");
    const ganador = solFinal!.cotizacion_ganadora_id as string;
    expect([casoA, casoB]).toContain(ganador);

    // El caso ganador NUNCA debe tener también un evento de cancelación
    // (esa era la contradicción real) — y sí debe tener su evento de
    // "elegida ganadora".
    const { data: eventosGanador } = await admin
      .from("casos_compra_eventos")
      .select("detalle")
      .eq("caso_compra_id", ganador);
    const detalles = (eventosGanador ?? []).map((e) => e.detalle ?? "");
    expect(detalles.some((d) => /ganadora/i.test(d))).toBe(true);
    expect(detalles.some((d) => /cancelado autom/i.test(d))).toBe(false);

    // C nunca fue candidata a ganadora en ninguna de las dos llamadas —
    // debe quedar cancelada de todos modos (era hermana de ambas).
    const { data: casoCFinal } = await admin
      .from("casos_compra")
      .select("estado")
      .eq("id", casoC)
      .single();
    expect(casoCFinal!.estado).toBe("cancelado");
  });
});
