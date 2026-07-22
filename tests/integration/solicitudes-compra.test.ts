// Solicitudes de compra: agrupan varias cotizaciones (una por proveedor)
// de la misma necesidad para poder compararlas y elegir una ganadora — las
// demás se cancelan solas. Se prueba lib/solicitudes.ts (resolverSolicitud)
// directamente contra Supabase real: es la lógica compartida entre
// elegirGanadora (lib/actions/solicitudes.ts) y recibirCasoCompra
// (lib/actions/compras.ts), ambas "use server" y no invocables aquí sin
// una sesión real — mismo criterio que el resto de la suite: se prueba la
// función/RPC compartida, no el wrapper de acción (ver recibir-caso-
// compra.test.ts, que tampoco invoca la action, solo la RPC).
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient, tieneCredenciales } from "./helpers";
import { resolverSolicitud } from "@/lib/solicitudes";
import { matchReferenciaEnAsunto } from "@/lib/email-caso";

describe.skipIf(!tieneCredenciales)("Solicitudes de compra (comparar proveedores)", () => {
  let admin: SupabaseClient;
  let proveedorIds: string[];
  let materialId: string | null;
  let solicitudId: string | null;
  let casoIds: string[];

  beforeAll(() => {
    admin = getAdminClient();
    proveedorIds = [];
    casoIds = [];
  });

  afterEach(async () => {
    if (casoIds.length) {
      await admin.from("casos_compra_eventos").delete().in("caso_compra_id", casoIds);
      await admin.from("casos_compra").delete().in("id", casoIds);
    }
    if (solicitudId) await admin.from("solicitudes_compra").delete().eq("id", solicitudId);
    if (materialId) await admin.from("materiales").delete().eq("id", materialId);
    for (const id of proveedorIds) await admin.from("proveedores").delete().eq("id", id);
    proveedorIds = [];
    casoIds = [];
    materialId = solicitudId = null;
  });

  async function crearProveedor() {
    const { data, error } = await admin
      .from("proveedores")
      .insert({ nombre: `[test] proveedor solicitud ${Date.now()}-${Math.random()}` })
      .select()
      .single();
    expect(error).toBeNull();
    proveedorIds.push(data!.id);
    return data!.id as string;
  }

  async function crearMaterial(proveedorPorDefecto: string) {
    const { data, error } = await admin
      .from("materiales")
      .insert({
        nombre: "[test] material solicitud " + Date.now(),
        proveedor_id: proveedorPorDefecto,
      })
      .select()
      .single();
    expect(error).toBeNull();
    materialId = data!.id;
    return materialId as string;
  }

  // Crea una solicitud con `n` cotizaciones (una por proveedor nuevo),
  // todas en "cotizando" — mismo estado en el que quedarían tras enviar
  // la cotización por correo.
  async function crearSolicitudConCasos(n: number) {
    const provDefault = await crearProveedor();
    await crearMaterial(provDefault);

    const codigo = `SOL-${Date.now().toString().slice(-6)}`;
    const { data: sol, error: errSol } = await admin
      .from("solicitudes_compra")
      .insert({ codigo, material_id: materialId, titulo: "[test] solicitud comparativa" })
      .select()
      .single();
    expect(errSol).toBeNull();
    solicitudId = sol!.id;

    for (let i = 0; i < n; i++) {
      const provId = i === 0 ? provDefault : await crearProveedor();
      const { data: caso, error } = await admin
        .from("casos_compra")
        .insert({
          proveedor_id: provId,
          material_id: materialId,
          titulo: "[test] cotización comparativa",
          referencia: `OC-${Date.now().toString().slice(-6)}-${i}`,
          solicitud_id: solicitudId,
          estado: "cotizando",
        })
        .select()
        .single();
      expect(error).toBeNull();
      casoIds.push(caso!.id);
    }
  }

  it("agrupa varias cotizaciones (una por proveedor) bajo la misma solicitud", async () => {
    await crearSolicitudConCasos(3);

    const { data: casos } = await admin
      .from("casos_compra")
      .select("id, proveedor_id")
      .eq("solicitud_id", solicitudId);
    expect(casos).toHaveLength(3);
    // Cada cotización tiene un proveedor distinto.
    expect(new Set(casos!.map((c) => c.proveedor_id)).size).toBe(3);
  });

  it("elegir ganadora cancela las cotizaciones hermanas y deja evento en cada una", async () => {
    await crearSolicitudConCasos(3);
    const [ganadora, perdedora1, perdedora2] = casoIds;

    await resolverSolicitud(admin, solicitudId!, ganadora);

    const { data: solicitud } = await admin
      .from("solicitudes_compra")
      .select("estado, cotizacion_ganadora_id")
      .eq("id", solicitudId)
      .single();
    expect(solicitud!.estado).toBe("resuelta");
    expect(solicitud!.cotizacion_ganadora_id).toBe(ganadora);

    const { data: casos } = await admin
      .from("casos_compra")
      .select("id, estado")
      .in("id", [ganadora, perdedora1, perdedora2]);
    const porId = new Map(casos!.map((c) => [c.id, c.estado]));
    // La ganadora no se toca (su estado lo cambia la acción que la eligió,
    // p. ej. recibirCasoCompra) — solo se marca en la solicitud.
    expect(porId.get(ganadora)).toBe("cotizando");
    expect(porId.get(perdedora1)).toBe("cancelado");
    expect(porId.get(perdedora2)).toBe("cancelado");

    const { data: eventosGanadora } = await admin
      .from("casos_compra_eventos")
      .select("tipo, detalle")
      .eq("caso_compra_id", ganadora);
    expect(eventosGanadora).toHaveLength(1);
    expect(eventosGanadora![0].detalle).toMatch(/ganadora/i);

    const { data: eventosPerdedora } = await admin
      .from("casos_compra_eventos")
      .select("tipo, detalle")
      .eq("caso_compra_id", perdedora1);
    expect(eventosPerdedora).toHaveLength(1);
    expect(eventosPerdedora![0].detalle).toMatch(/cancelado automáticamente/i);
  });

  it("no hace nada si la solicitud ya no está abierta (evita resolverla dos veces)", async () => {
    await crearSolicitudConCasos(3);
    const [primera, , tercera] = casoIds;

    await resolverSolicitud(admin, solicitudId!, primera);
    // Segundo intento con OTRO caso — no debe cambiar nada, la solicitud
    // ya está resuelta.
    await resolverSolicitud(admin, solicitudId!, tercera);

    const { data: solicitud } = await admin
      .from("solicitudes_compra")
      .select("cotizacion_ganadora_id")
      .eq("id", solicitudId)
      .single();
    expect(solicitud!.cotizacion_ganadora_id).toBe(primera);
  });

  it("el código de una cotización se reconoce en el asunto de una respuesta (matchReferenciaEnAsunto)", async () => {
    await crearSolicitudConCasos(2);
    const { data: casos } = await admin
      .from("casos_compra")
      .select("id, referencia")
      .eq("solicitud_id", solicitudId);

    const objetivo = casos![0];
    const match = matchReferenciaEnAsunto(
      `Re: Solicitud de cotización [${objetivo.referencia}]`,
      casos!
    );
    expect(match?.id).toBe(objetivo.id);
  });
});
