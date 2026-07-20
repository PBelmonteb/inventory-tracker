// Reposición automática: crea un caso de compra (estado "pendiente") en
// cuanto el stock de un material cruza su punto de reposición, sin esperar
// a que alguien lo detecte manualmente. Reutiliza tal cual lib/stock-
// sugerido.ts, lib/eoq.ts y lib/riesgo-stock.ts — este archivo solo hace la
// orquestación de datos (Supabase) alrededor de esas funciones puras.
//
// Dos caminos la llaman:
//   - app/api/generar-casos-automaticos/route.ts, con el cliente de
//     service_role (el disparador real es un pg_cron -> pg_net contra ese
//     endpoint, sin sesión de usuario).
//   - lib/actions/casos-automaticos.ts (revisarReposicionAutomatica), con
//     el cliente de sesión normal, para el botón manual "Revisar ahora".
//
// No lleva "use server": no es un Server Action en sí (su parámetro,
// el cliente de Supabase, no es serializable), solo un helper de servidor
// como lib/data.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularStockSugerido } from "@/lib/stock-sugerido";
import { calcularEOQ } from "@/lib/eoq";
import { evaluarRiesgoStock } from "@/lib/riesgo-stock";
import { esConvenioVigente } from "@/lib/convenios";
import { construirCorreoOrdenConvenio } from "@/lib/plantillas-correo";
import { enviarCorreo } from "@/lib/email";
import type { Convenio } from "@/lib/types";

export interface ResumenReposicionAutomatica {
  materialesRevisados: number;
  casosCreados: number;
}

interface MaterialCandidato {
  id: string;
  nombre: string;
  sku: string | null;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
  costo_unitario: number;
  proveedor_id: string;
}

interface ProveedorInfo {
  id: string;
  nombre: string;
  contacto: string | null;
  dias_entrega_declarado: number | null;
}

const CASO_COMPRA_ABIERTO = ["pendiente", "cotizando", "ordenado"];

export async function generarCasosAutomaticosPorStockBajo(
  supabase: SupabaseClient,
  opts: { materialIds?: string[] } = {}
): Promise<ResumenReposicionAutomatica> {
  let query = supabase
    .from("materiales")
    .select(
      "id, nombre, sku, unidad, stock_actual, stock_minimo, costo_unitario, proveedor_id"
    )
    .eq("activo", true)
    .not("proveedor_id", "is", null);
  // Acota el barrido a materiales puntuales (pruebas de integración o un
  // reintento dirigido) — sin esto, siempre revisa el catálogo completo.
  if (opts.materialIds) query = query.in("id", opts.materialIds);
  const { data: materialesRows } = await query;

  const materiales = (materialesRows ?? []) as MaterialCandidato[];
  if (materiales.length === 0)
    return { materialesRevisados: 0, casosCreados: 0 };

  const materialIds = materiales.map((m) => m.id);
  const proveedorIds = [...new Set(materiales.map((m) => m.proveedor_id))];

  const [
    { data: abiertosRows },
    { data: proveedoresRows },
    { data: salidasRows },
    { data: recibidasRows },
    { data: conveniosRows },
  ] = await Promise.all([
    supabase
      .from("casos_compra")
      .select("material_id")
      .in("material_id", materialIds)
      .in("estado", CASO_COMPRA_ABIERTO),
    supabase
      .from("proveedores")
      .select("id, nombre, contacto, dias_entrega_declarado")
      .in("id", proveedorIds),
    supabase
      .from("movimientos")
      .select("material_id, cantidad, created_at")
      .in("material_id", materialIds)
      .eq("tipo", "salida"),
    supabase
      .from("casos_compra")
      .select("material_id, created_at, updated_at")
      .in("material_id", materialIds)
      .eq("estado", "recibido"),
    supabase
      .from("convenios_proveedor")
      .select("*")
      .in("material_id", materialIds)
      .eq("activo", true),
  ]);

  const materialesConCasoAbierto = new Set(
    (abiertosRows ?? []).map((r: { material_id: string }) => r.material_id)
  );
  const proveedorInfoPorId = new Map<string, ProveedorInfo>(
    (proveedoresRows ?? []).map((p: ProveedorInfo) => [p.id, p])
  );

  const salidasPorMaterial = new Map<
    string,
    { cantidad: number; created_at: string }[]
  >();
  for (const s of (salidasRows ?? []) as {
    material_id: string;
    cantidad: number;
    created_at: string;
  }[]) {
    const lista = salidasPorMaterial.get(s.material_id) ?? [];
    lista.push({ cantidad: s.cantidad, created_at: s.created_at });
    salidasPorMaterial.set(s.material_id, lista);
  }

  const recibidasPorMaterial = new Map<
    string,
    { created_at: string; updated_at: string }[]
  >();
  for (const c of (recibidasRows ?? []) as {
    material_id: string;
    created_at: string;
    updated_at: string;
  }[]) {
    const lista = recibidasPorMaterial.get(c.material_id) ?? [];
    lista.push({ created_at: c.created_at, updated_at: c.updated_at });
    recibidasPorMaterial.set(c.material_id, lista);
  }

  // Convenio vigente por par proveedor+material (a lo más uno por par, ver
  // el índice único de la migración 0018) — le gana al WAC/declarado del
  // proveedor cuando existe.
  const convenioPorPar = new Map<string, Convenio>();
  for (const c of (conveniosRows ?? []) as Convenio[]) {
    if (esConvenioVigente(c)) {
      convenioPorPar.set(`${c.proveedor_id}:${c.material_id}`, c);
    }
  }

  let casosCreados = 0;

  for (const material of materiales) {
    if (materialesConCasoAbierto.has(material.id)) continue;

    const salidas = salidasPorMaterial.get(material.id) ?? [];
    const comprasRecibidas = recibidasPorMaterial.get(material.id) ?? [];
    const stockSugerido = calcularStockSugerido({ salidas, comprasRecibidas });
    const eoq =
      material.costo_unitario > 0
        ? calcularEOQ({ salidas, costoUnitario: material.costo_unitario })
        : null;
    const convenio = convenioPorPar.get(
      `${material.proveedor_id}:${material.id}`
    );
    // El tiempo de entrega pactado en el convenio es más preciso que el
    // declarado a nivel proveedor — pero el inferido del historial real
    // (dentro de evaluarRiesgoStock) le sigue ganando a ambos.
    const proveedorInfo = proveedorInfoPorId.get(material.proveedor_id);
    const proveedorDiasEntrega =
      convenio?.dias_entrega_pactado ??
      proveedorInfo?.dias_entrega_declarado ??
      null;

    const riesgo = evaluarRiesgoStock({
      stockActual: material.stock_actual,
      stockMinimo: material.stock_minimo,
      proveedorDiasEntrega,
      stockSugerido,
      eoq,
    });
    if (!riesgo.debeCrearCaso) continue;

    // La cantidad mínima del convenio es un piso contractual: nunca se pide
    // menos, aunque el cálculo sugiera menos.
    const cantidad = Math.max(riesgo.cantidadSugerida, convenio?.cantidad_minima ?? 0);
    const precioUnitario = convenio?.precio_pactado ?? material.costo_unitario;
    const referencia = `OC-${Date.now().toString().slice(-6)}-${casosCreados}`;
    const montoEstimado = precioUnitario > 0 ? precioUnitario * cantidad : 0;
    const notaConvenio = convenio
      ? ` Precio según convenio vigente: $${convenio.precio_pactado.toFixed(2)}/unidad.`
      : "";
    const descripcionBase = `${riesgo.motivo} Cantidad sugerida: ${cantidad} ${material.unidad}.${notaConvenio}`;

    const { data: caso, error } = await supabase
      .from("casos_compra")
      .insert({
        proveedor_id: material.proveedor_id,
        material_id: material.id,
        titulo: `Reposición automática: ${material.nombre}`,
        descripcion: descripcionBase,
        monto_estimado: montoEstimado,
        referencia,
        estado: "pendiente",
        origen: "stock_bajo",
        nivel_riesgo: riesgo.nivelRiesgo,
        dias_cobertura_restante: riesgo.diasCobertura,
        lead_time_dias_usado: riesgo.leadTimeUsado,
      })
      .select("id")
      .single();

    // No se aborta el resto del lote por un material: se sigue con los demás.
    if (error || !caso) continue;

    await supabase
      .from("notificaciones")
      .update({
        estado: "atendida",
        caso_compra_id: caso.id,
        resuelta_at: new Date().toISOString(),
      })
      .eq("material_id", material.id)
      .eq("estado", "abierta");

    await supabase.from("notificaciones").insert({
      material_id: material.id,
      proveedor_id: material.proveedor_id,
      tipo: "stock",
      nivel: riesgo.nivelRiesgo === "medio" ? "aviso" : "bajo",
      mensaje: `Se generó automáticamente el caso ${referencia} para reponer ${material.nombre} (riesgo ${riesgo.nivelRiesgo}). Revisa y asigna un responsable.`,
      caso_compra_id: caso.id,
    });

    // Opt-in por convenio: si el precio/cantidad/condiciones ya están
    // pactados, no hace falta que un humano redacte y apruebe el correo —
    // se manda solo y el caso pasa directo a "ordenado". Nunca se finge un
    // envío que no ocurrió: sin correo del proveedor, o si el servicio no
    // está configurado/falla, el caso se queda en "pendiente" con una nota.
    if (convenio?.auto_enviar) {
      if (!proveedorInfo?.contacto) {
        await supabase
          .from("casos_compra")
          .update({
            descripcion: `${descripcionBase} Envío automático configurado pero el proveedor no tiene correo registrado.`,
          })
          .eq("id", caso.id);
      } else {
        const correo = construirCorreoOrdenConvenio({
          material: { nombre: material.nombre, sku: material.sku, unidad: material.unidad },
          proveedorNombre: proveedorInfo.nombre,
          cantidad,
          precioUnitario,
          condicionesPago: convenio.condiciones_pago,
          diasEntregaPactado: convenio.dias_entrega_pactado,
          referencia,
        });
        const envio = await enviarCorreo({
          to: proveedorInfo.contacto,
          subject: correo.asunto,
          body: correo.cuerpo,
        });
        if (envio.ok) {
          await supabase
            .from("casos_compra")
            .update({
              estado: "ordenado",
              correo_enviado_at: new Date().toISOString(),
              descripcion: `${descripcionBase} Orden confirmada y enviada automáticamente por convenio.`,
            })
            .eq("id", caso.id);
        } else {
          await supabase
            .from("casos_compra")
            .update({
              descripcion: `${descripcionBase} Envío automático configurado pero falló: ${envio.error} Revisar manualmente.`,
            })
            .eq("id", caso.id);
        }
      }
    }

    casosCreados++;
  }

  return { materialesRevisados: materiales.length, casosCreados };
}
