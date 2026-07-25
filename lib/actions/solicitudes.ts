"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { registrarEventoCaso } from "@/lib/eventos-caso";
import { resolverSolicitud } from "@/lib/solicitudes";
import { getEventosCaso, getSolicitudConCasos } from "@/lib/data";
import type {
  CasoCompraEvento,
  SolicitudCompraConRelaciones,
  UsuarioActor,
} from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Lectura de solo lectura, sin gate de rol — el timeline y la comparación
// de cotizaciones las puede ver cualquier autenticado, igual que el resto
// de /proveedores.
export async function obtenerEventosCaso(casoId: string): Promise<CasoCompraEvento[]> {
  return getEventosCaso(casoId);
}

export async function obtenerSolicitudConCasos(
  solicitudId: string
): Promise<SolicitudCompraConRelaciones | null> {
  return getSolicitudConCasos(solicitudId);
}

// Con un solo proveedor, se comporta exactamente igual que crearCasoCompra
// (un caso suelto, sin solicitud). Con más de uno, agrupa una cotización
// por proveedor bajo una solicitud nueva con su propio código — para poder
// compararlas y elegir una ganadora después.
//
// Ruteo por rol (solo cuando es UN proveedor — con varios todavía se está
// comparando precio, no hay especificaciones cerradas que autorizar): si
// quien crea el caso es operario, entra directo a "por_autorizar" y exige
// material + cantidad + monto de una vez (un gestor lo va a autorizar tal
// cual, así que debe venir completo). Si es gestor, sigue como hoy
// ("pendiente", sin exigir nada — ya tiene la autoridad para ordenar).
export async function crearSolicitudCompra(formData: FormData): Promise<ActionResult> {
  const proveedorIds = formData
    .getAll("proveedor_ids")
    .map((v) => String(v))
    .filter(Boolean);
  const material_id = String(formData.get("material_id") ?? "") || null;
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;
  const responsable_id = String(formData.get("responsable_id") ?? "") || null;
  const notificacion_id = String(formData.get("notificacion_id") ?? "") || null;
  const cantidadRaw = String(formData.get("cantidad_estimada") ?? "").trim();
  const cantidad_estimada = cantidadRaw ? Number(cantidadRaw) || null : null;
  const montoRaw = String(formData.get("monto_estimado") ?? "").trim();
  const montoEstimadoInput = montoRaw ? Number(montoRaw) || null : null;

  if (proveedorIds.length === 0)
    return { ok: false, error: "Selecciona al menos un proveedor" };
  if (!titulo) return { ok: false, error: "El título es obligatorio" };

  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };
  const esUnSoloProveedor = proveedorIds.length === 1;
  const requiereAutorizacion = esUnSoloProveedor && Boolean(yo) && !esGestor(yo);

  if (requiereAutorizacion) {
    if (!material_id)
      return { ok: false, error: "Selecciona un material — hace falta para mandar el caso a autorización" };
    if (!cantidad_estimada)
      return { ok: false, error: "Captura la cantidad estimada — hace falta para mandar el caso a autorización" };
    if (!montoEstimadoInput)
      return { ok: false, error: "Captura el monto estimado — hace falta para mandar el caso a autorización" };
  }
  const estadoInicial = requiereAutorizacion ? "por_autorizar" : "pendiente";

  if (DEMO) {
    try {
      store.crearSolicitudCompra(
        {
          proveedor_ids: proveedorIds,
          material_id,
          titulo,
          descripcion,
          cantidad_estimada,
          monto_estimado: esUnSoloProveedor ? montoEstimadoInput ?? 0 : null,
          estado: estadoInicial,
          responsable_id,
          notificacion_id,
        },
        actor
      );
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();

    if (proveedorIds.length === 1) {
      const referencia = `OC-${Date.now().toString().slice(-6)}`;
      const { data: caso, error } = await supabase
        .from("casos_compra")
        .insert({
          proveedor_id: proveedorIds[0],
          material_id,
          titulo,
          descripcion,
          monto_estimado: montoEstimadoInput ?? 0,
          cantidad_estimada,
          referencia,
          estado: estadoInicial,
          origen: notificacion_id ? "stock_bajo" : "manual",
          creado_por_id: actor.id,
          creado_por_nombre: actor.nombre,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: mensajeSupabase(error) };
      await registrarEventoCaso(supabase, caso.id, "creado", null, actor);
      if (notificacion_id) {
        await supabase
          .from("notificaciones")
          .update({
            estado: "atendida",
            caso_compra_id: caso.id,
            resuelta_at: new Date().toISOString(),
          })
          .eq("id", notificacion_id);
      }
      if (responsable_id) {
        await supabase.rpc("asignar_responsable_caso_compra", {
          p_caso: caso.id,
          p_usuario: responsable_id,
          p_asignado_por: actor.nombre,
        });
        await registrarEventoCaso(
          supabase,
          caso.id,
          "responsable_asignado",
          "Responsable asignado",
          actor
        );
      }
    } else {
      const codigo = `SOL-${Date.now().toString().slice(-6)}`;
      const [{ data: material }, { data: responsable }] = await Promise.all([
        material_id
          ? supabase.from("materiales").select("nombre").eq("id", material_id).single()
          : Promise.resolve({ data: null }),
        responsable_id
          ? supabase.from("profiles").select("nombre").eq("id", responsable_id).single()
          : Promise.resolve({ data: null }),
      ]);

      const { data: solicitud, error: errSol } = await supabase
        .from("solicitudes_compra")
        .insert({
          codigo,
          material_id,
          material_nombre: material?.nombre ?? null,
          titulo,
          responsable_id,
          responsable_nombre: responsable?.nombre ?? null,
        })
        .select("id, codigo")
        .single();
      if (errSol || !solicitud)
        return {
          ok: false,
          error: errSol ? mensajeSupabase(errSol) : "No se pudo crear la solicitud",
        };

      // Convenios vigentes de los proveedores elegidos, para prellenar cada
      // cotización con su precio pactado (igual que en la reposición
      // automática) en vez de dejarlas todas en $0.
      const hoy = new Date().toISOString().slice(0, 10);
      const { data: conveniosRows } = material_id
        ? await supabase
            .from("convenios_proveedor")
            .select("proveedor_id, precio_pactado, vigencia_hasta")
            .eq("material_id", material_id)
            .eq("activo", true)
            .in("proveedor_id", proveedorIds)
        : { data: [] };
      const precioPorProveedor = new Map<string, number>();
      for (const c of conveniosRows ?? []) {
        if (!c.vigencia_hasta || c.vigencia_hasta >= hoy)
          precioPorProveedor.set(c.proveedor_id, c.precio_pactado);
      }

      let i = 0;
      for (const proveedorId of proveedorIds) {
        const referencia = `OC-${Date.now().toString().slice(-6)}-${i}`;
        const { data: caso, error: errCaso } = await supabase
          .from("casos_compra")
          .insert({
            proveedor_id: proveedorId,
            material_id,
            titulo,
            descripcion,
            monto_estimado: precioPorProveedor.get(proveedorId) ?? 0,
            cantidad_estimada,
            referencia,
            solicitud_id: solicitud.id,
            creado_por_id: actor.id,
            creado_por_nombre: actor.nombre,
          })
          .select("id")
          .single();
        // No se aborta el resto del lote por un proveedor.
        if (errCaso || !caso) continue;
        await registrarEventoCaso(
          supabase,
          caso.id,
          "creado",
          `Cotización comparativa de la solicitud ${solicitud.codigo}.`,
          actor
        );
        if (responsable_id) {
          await supabase.rpc("asignar_responsable_caso_compra", {
            p_caso: caso.id,
            p_usuario: responsable_id,
            p_asignado_por: actor.nombre,
          });
        }
        i++;
      }
    }
  }

  revalidatePath("/proveedores");
  return { ok: true };
}

// Elige la cotización ganadora de una solicitud: las demás abiertas se
// cancelan solas (lib/solicitudes.ts, compartida con recibirCasoCompra).
export async function elegirGanadora(
  solicitudId: string,
  casoGanadorId: string
): Promise<ActionResult> {
  if (!solicitudId || !casoGanadorId)
    return { ok: false, error: "Datos inválidos" };

  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  if (DEMO) {
    try {
      store.elegirGanadora(solicitudId, casoGanadorId, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data: caso } = await supabase
      .from("casos_compra")
      .select("id")
      .eq("id", casoGanadorId)
      .eq("solicitud_id", solicitudId)
      .maybeSingle();
    if (!caso)
      return { ok: false, error: "Esa cotización no pertenece a esta solicitud" };
    await resolverSolicitud(supabase, solicitudId, casoGanadorId, actor);
  }

  revalidatePath("/proveedores");
  return { ok: true };
}

// Nota manual en el timeline de un caso (estilo Chatter de Salesforce) —
// no toca el caso en sí, solo agrega el evento.
export async function agregarNotaCaso(
  casoId: string,
  texto: string
): Promise<ActionResult> {
  if (!casoId) return { ok: false, error: "Caso inválido" };
  if (!texto.trim()) return { ok: false, error: "La nota no puede estar vacía" };

  const yo = await getCurrentProfile();
  const actor: UsuarioActor = { id: yo?.id ?? null, nombre: yo?.nombre ?? null };

  if (DEMO) {
    try {
      store.agregarNotaCaso(casoId, texto, actor);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    await registrarEventoCaso(supabase, casoId, "nota", texto.trim(), actor);
  }

  revalidatePath("/proveedores");
  return { ok: true };
}
