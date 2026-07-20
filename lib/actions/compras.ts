"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { getCurrentProfile } from "@/lib/auth";
import { ESTADOS_CASO_COMPRA, type EstadoCasoCompra } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function crearCasoCompra(
  formData: FormData
): Promise<ActionResult> {
  const proveedor_id = String(formData.get("proveedor_id") ?? "");
  const material_id = String(formData.get("material_id") ?? "") || null;
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;
  const monto_estimado = Number(formData.get("monto_estimado") ?? 0) || 0;
  const notificacion_id =
    String(formData.get("notificacion_id") ?? "") || null;
  const responsable_id = String(formData.get("responsable_id") ?? "") || null;
  let referencia = String(formData.get("referencia") ?? "").trim();
  if (!referencia) referencia = `OC-${Date.now().toString().slice(-6)}`;

  if (!proveedor_id) return { ok: false, error: "Selecciona un proveedor" };
  if (!titulo) return { ok: false, error: "El título es obligatorio" };
  if (monto_estimado < 0)
    return { ok: false, error: "El monto no puede ser negativo" };

  const origen = notificacion_id ? ("stock_bajo" as const) : ("manual" as const);

  if (DEMO) {
    try {
      store.crearCasoCompra(
        { proveedor_id, material_id, titulo, descripcion, monto_estimado, referencia, origen, responsable_id },
        notificacion_id ?? undefined
      );
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("casos_compra")
      .insert({ proveedor_id, material_id, titulo, descripcion, monto_estimado, referencia, origen })
      .select("id")
      .single();
    if (error) return { ok: false, error: mensajeSupabase(error) };
    if (notificacion_id) {
      await supabase
        .from("notificaciones")
        .update({
          estado: "atendida",
          caso_compra_id: data.id,
          resuelta_at: new Date().toISOString(),
        })
        .eq("id", notificacion_id);
    }
    if (responsable_id) {
      const yo = await getCurrentProfile();
      await supabase.rpc("asignar_responsable_caso_compra", {
        p_caso: data.id,
        p_usuario: responsable_id,
        p_asignado_por: yo?.nombre ?? null,
      });
    }
  }

  revalidatePath("/proveedores");
  return { ok: true };
}

// Asigna (o quita, si usuarioId es "") el responsable de un caso de compra.
// Sin gate de rol: tanto gestores como operarios pueden asignar.
export async function asignarResponsableCasoCompra(
  casoId: string,
  usuarioId: string
): Promise<ActionResult> {
  const yo = await getCurrentProfile();
  if (!yo) return { ok: false, error: "No autenticado" };

  if (DEMO) {
    try {
      store.asignarResponsableCasoCompra(casoId, usuarioId || null, yo.nombre);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase.rpc("asignar_responsable_caso_compra", {
      p_caso: casoId,
      p_usuario: usuarioId || null,
      p_asignado_por: yo.nombre,
    });
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/proveedores");
  return { ok: true };
}

export async function cambiarEstadoCasoCompra(
  id: string,
  estado: EstadoCasoCompra
): Promise<ActionResult> {
  if (!ESTADOS_CASO_COMPRA.includes(estado))
    return { ok: false, error: "Estado inválido" };

  if (DEMO) {
    try {
      store.cambiarEstadoCasoCompra(id, estado);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("casos_compra")
      .update({ estado, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/proveedores");
  return { ok: true };
}

// Recibe un caso de compra: genera la entrada de stock (con costo → WAC) y
// marca el caso como "recibido".
export async function recibirCasoCompra(
  caso_id: string,
  cantidad: number,
  costo: number,
  ubicacion_id?: string | null
): Promise<ActionResult> {
  if (!caso_id) return { ok: false, error: "Caso inválido" };
  if (!Number.isFinite(cantidad) || cantidad <= 0)
    return { ok: false, error: "La cantidad debe ser mayor a cero" };
  if (!Number.isFinite(costo) || costo < 0)
    return { ok: false, error: "Costo inválido" };

  if (DEMO) {
    try {
      store.recibirCasoCompra(caso_id, cantidad, costo, ubicacion_id ?? null);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase.rpc("recibir_caso_compra", {
      p_caso: caso_id,
      p_cantidad: cantidad,
      p_costo: costo,
      p_ubicacion: ubicacion_id ?? null,
    });
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/proveedores");
  revalidatePath("/inventario");
  revalidatePath("/movimientos");
  revalidatePath("/reportes");
  return { ok: true };
}

// Registra una solicitud de cotización (el correo al proveedor se abre en el
// cliente del usuario vía mailto). Crea el caso en estado "cotizando" y marca
// como atendidas las alertas abiertas del material.
export async function solicitarCotizacion(
  formData: FormData
): Promise<ActionResult> {
  const proveedor_id = String(formData.get("proveedor_id") ?? "");
  const material_id = String(formData.get("material_id") ?? "") || null;
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;
  const esBajo = String(formData.get("es_bajo") ?? "") === "1";
  let referencia = String(formData.get("referencia") ?? "").trim();
  if (!referencia) referencia = `OC-${Date.now().toString().slice(-6)}`;

  if (!proveedor_id)
    return { ok: false, error: "El material no tiene proveedor asignado" };
  if (!titulo) return { ok: false, error: "El asunto es obligatorio" };

  const origen = esBajo ? ("stock_bajo" as const) : ("manual" as const);

  if (DEMO) {
    try {
      const caso = store.crearCasoCompra({
        proveedor_id,
        material_id,
        titulo,
        descripcion,
        monto_estimado: 0,
        referencia,
        origen,
        estado: "cotizando",
      });
      if (material_id)
        store.atenderNotificacionesDeMaterial(material_id, caso.id);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("casos_compra")
      .insert({
        proveedor_id,
        material_id,
        titulo,
        descripcion,
        monto_estimado: 0,
        referencia,
        origen,
        estado: "cotizando",
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: mensajeSupabase(error) };
    if (material_id) {
      await supabase
        .from("notificaciones")
        .update({
          estado: "atendida",
          caso_compra_id: data.id,
          resuelta_at: new Date().toISOString(),
        })
        .eq("material_id", material_id)
        .eq("estado", "abierta");
    }
  }

  revalidatePath("/proveedores");
  if (material_id) revalidatePath(`/materiales/${material_id}`);
  return { ok: true };
}

// Envía una cotización para un caso YA EXISTENTE (a diferencia de
// solicitarCotizacion, que siempre crea uno nuevo): se usa cuando el
// usuario abre el formulario de correo desde el link del título de un
// caso en /proveedores, en vez de desde el detalle del material. Solo
// avanza el estado pendiente -> cotizando (no retrocede uno que ya esté
// más adelante); el asunto/cuerpo editados quedan como título/descripción.
export async function enviarCotizacionCasoExistente(
  casoId: string,
  formData: FormData
): Promise<ActionResult> {
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim() || null;
  if (!casoId) return { ok: false, error: "Caso inválido" };
  if (!titulo) return { ok: false, error: "El asunto es obligatorio" };

  if (DEMO) {
    try {
      store.enviarCotizacionCasoExistente(casoId, titulo, descripcion);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { data: caso, error: errCaso } = await supabase
      .from("casos_compra")
      .select("estado, material_id")
      .eq("id", casoId)
      .single();
    if (errCaso || !caso) return { ok: false, error: "Caso no encontrado" };

    const nuevoEstado = caso.estado === "pendiente" ? "cotizando" : caso.estado;
    const { error } = await supabase
      .from("casos_compra")
      .update({
        titulo,
        descripcion,
        estado: nuevoEstado,
        updated_at: new Date().toISOString(),
      })
      .eq("id", casoId);
    if (error) return { ok: false, error: mensajeSupabase(error) };

    if (caso.material_id) {
      await supabase
        .from("notificaciones")
        .update({
          estado: "atendida",
          caso_compra_id: casoId,
          resuelta_at: new Date().toISOString(),
        })
        .eq("material_id", caso.material_id)
        .eq("estado", "abierta");
    }
  }

  revalidatePath("/proveedores");
  return { ok: true };
}

export async function descartarNotificacion(
  id: string
): Promise<ActionResult> {
  if (DEMO) {
    try {
      store.descartarNotificacion(id);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Error" };
    }
  } else {
    const supabase = await createClient();
    const { error } = await supabase
      .from("notificaciones")
      .update({ estado: "descartada", resuelta_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: mensajeSupabase(error) };
  }

  revalidatePath("/proveedores");
  return { ok: true };
}
