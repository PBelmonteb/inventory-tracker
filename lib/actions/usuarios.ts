"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import type { EstadoCuenta, Rol } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface UsuarioListado {
  id: string;
  nombre: string;
  email: string | null;
  rol: Rol;
  created_at: string;
  activo: boolean;
  estado_cuenta: EstadoCuenta;
}

const ROLES: Rol[] = ["admin", "gerente", "operario", "compras", "ventas"];

// Verifica que quien llama sea gestor. Se re-checa aquí (no solo en la UI)
// porque las acciones de este archivo usan el cliente service_role, que
// salta el RLS por completo: esta función es el único muro real.
async function requireGestor() {
  const profile = await getCurrentProfile();
  if (!profile || !esGestor(profile)) {
    throw new Error("No autorizado");
  }
  return profile;
}

export async function listarUsuarios(): Promise<
  { ok: true; usuarios: UsuarioListado[] } | { ok: false; error: string }
> {
  if (DEMO)
    return {
      ok: false,
      error: "La gestión de usuarios requiere el backend de Supabase conectado.",
    };
  try {
    await requireGestor();
  } catch {
    return { ok: false, error: "No autorizado" };
  }

  const admin = createAdminClient();
  const [{ data: profiles, error: perr }, { data: authData, error: aerr }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id, nombre, rol, created_at, estado_cuenta")
        .order("created_at", { ascending: true }),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);
  if (perr) return { ok: false, error: mensajeSupabase(perr) };
  if (aerr) return { ok: false, error: mensajeSupabase(aerr) };

  const authPorId = new Map(authData.users.map((u) => [u.id, u]));

  const usuarios: UsuarioListado[] = (profiles ?? []).map((p) => {
    const authUser = authPorId.get(p.id);
    const bannedUntil = authUser?.banned_until;
    // Supabase marca "sin baneo" con undefined o con la cadena literal
    // "none" (según versión de GoTrue) — cualquier fecha futura es inactivo.
    const activo =
      !bannedUntil ||
      bannedUntil === "none" ||
      new Date(bannedUntil) <= new Date();
    return {
      id: p.id,
      nombre: p.nombre,
      rol: p.rol,
      created_at: p.created_at,
      email: authUser?.email ?? null,
      activo,
      estado_cuenta: p.estado_cuenta,
    };
  });

  return { ok: true, usuarios };
}

export interface UsuarioAsignable {
  id: string;
  nombre: string;
  rol: Rol;
}

// Lista de usuarios para el selector de "responsable" (asignar casos y
// salidas pendientes). A diferencia de listarUsuarios(), la puede llamar
// cualquier usuario autenticado (no solo gestores) — tanto gestores como
// operarios deben poder asignar — y no usa el cliente service_role, así
// que no necesita el email de cada quien, solo nombre/rol para el picker.
export async function listarUsuariosParaAsignar(): Promise<
  { ok: true; usuarios: UsuarioAsignable[] } | { ok: false; error: string }
> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "No autenticado" };

  if (DEMO) {
    return {
      ok: true,
      usuarios: store.getUsuarios().map(({ id, nombre, rol }) => ({ id, nombre, rol })),
    };
  }

  // Solo cuentas aprobadas -- no tiene caso ofrecer como responsable a
  // alguien que todavía no puede ni entrar a la app.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nombre, rol")
    .eq("estado_cuenta", "aprobada")
    .order("nombre");
  if (error) return { ok: false, error: mensajeSupabase(error) };
  return { ok: true, usuarios: (data as UsuarioAsignable[]) ?? [] };
}

export async function crearUsuario(formData: FormData): Promise<ActionResult> {
  if (DEMO)
    return {
      ok: false,
      error: "La gestión de usuarios requiere el backend de Supabase conectado.",
    };
  try {
    await requireGestor();
  } catch {
    return { ok: false, error: "No autorizado" };
  }

  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const rol = String(formData.get("rol") ?? "operario") as Rol;

  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };
  if (!email) return { ok: false, error: "El correo es obligatorio" };
  if (password.length < 6)
    return {
      ok: false,
      error: "La contraseña debe tener al menos 6 caracteres",
    };
  if (!ROLES.includes(rol)) return { ok: false, error: "Rol inválido" };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // ya queda confirmado: puede entrar de inmediato
    user_metadata: { nombre },
  });
  if (error) return { ok: false, error: mensajeSupabase(error) };

  // El trigger handle_new_user ya creó el profile (rol "operario",
  // estado_cuenta "pendiente" por defecto) -- se ajusta aquí al rol elegido
  // y se aprueba de una vez: un gestor ya vetó esta cuenta al crearla a
  // mano, pedirle una segunda aprobación sería puro trabajo de más.
  if (data.user) {
    const { error: updError } = await admin
      .from("profiles")
      .update({ rol, estado_cuenta: "aprobada" })
      .eq("id", data.user.id);
    if (updError) return { ok: false, error: mensajeSupabase(updError) };
  }

  revalidatePath("/administracion");
  return { ok: true };
}

// Aprueba una cuenta de auto-registro: le asigna rol y la deja entrar.
export async function aprobarCuenta(userId: string, rol: Rol): Promise<ActionResult> {
  if (DEMO)
    return {
      ok: false,
      error: "La gestión de usuarios requiere el backend de Supabase conectado.",
    };
  try {
    await requireGestor();
  } catch {
    return { ok: false, error: "No autorizado" };
  }
  if (!ROLES.includes(rol)) return { ok: false, error: "Rol inválido" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ rol, estado_cuenta: "aprobada" })
    .eq("id", userId);
  if (error) return { ok: false, error: mensajeSupabase(error) };

  revalidatePath("/administracion");
  return { ok: true };
}

// Rechaza una cuenta de auto-registro -- queda registrada como "rechazada"
// (no se borra, mismo criterio que un caso de compra rechazado: se guarda
// el rastro en vez de desaparecerlo). La persona ve el motivo genérico en
// /pendiente; si quiere reintentar con otro correo, tendría que ser un
// gestor quien la borre desde aquí más adelante si hace falta.
export async function rechazarCuenta(userId: string): Promise<ActionResult> {
  if (DEMO)
    return {
      ok: false,
      error: "La gestión de usuarios requiere el backend de Supabase conectado.",
    };
  try {
    await requireGestor();
  } catch {
    return { ok: false, error: "No autorizado" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ estado_cuenta: "rechazada" })
    .eq("id", userId);
  if (error) return { ok: false, error: mensajeSupabase(error) };

  revalidatePath("/administracion");
  return { ok: true };
}

export async function cambiarRolUsuario(
  userId: string,
  rol: Rol
): Promise<ActionResult> {
  if (DEMO)
    return {
      ok: false,
      error: "La gestión de usuarios requiere el backend de Supabase conectado.",
    };
  let yo;
  try {
    yo = await requireGestor();
  } catch {
    return { ok: false, error: "No autorizado" };
  }
  if (userId === yo.id)
    return { ok: false, error: "No puedes cambiar tu propio rol" };
  if (!ROLES.includes(rol)) return { ok: false, error: "Rol inválido" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ rol })
    .eq("id", userId);
  if (error) return { ok: false, error: mensajeSupabase(error) };

  revalidatePath("/administracion");
  return { ok: true };
}

// Desactivar no borra al usuario ni su historial (auditoría, casos,
// movimientos siguen apuntando a su id) — solo le impide iniciar sesión vía
// la Admin API de Supabase (ban_duration). Reversible en cualquier momento.
export async function cambiarEstadoUsuario(
  userId: string,
  activo: boolean
): Promise<ActionResult> {
  if (DEMO)
    return {
      ok: false,
      error: "La gestión de usuarios requiere el backend de Supabase conectado.",
    };
  let yo;
  try {
    yo = await requireGestor();
  } catch {
    return { ok: false, error: "No autorizado" };
  }
  if (userId === yo.id)
    return { ok: false, error: "No puedes desactivar tu propia cuenta" };

  const admin = createAdminClient();
  // "none" reactiva; "876000h" (100 años) es la convención de Supabase para
  // un baneo indefinido — no existe un valor "para siempre" literal.
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: activo ? "none" : "876000h",
  });
  if (error) return { ok: false, error: mensajeSupabase(error) };

  revalidatePath("/administracion");
  return { ok: true };
}
