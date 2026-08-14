"use server";

// Auto-registro público: crea la cuenta en Supabase Auth (cliente normal,
// no admin) y avisa a los gestores para que la revisen. El trigger
// handle_new_user ya deja el perfil en estado_cuenta = "pendiente" por
// default (ver supabase/migrations/0046_aprobacion_cuentas.sql) -- aquí
// solo se notifica, nunca se aprueba nada.
//
// Requiere que "Allow new users to sign up" esté prendido en el proyecto
// de Supabase (Authentication > Providers > Email) -- ver [[gestion-usuarios]].

import { DEMO } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { enviarPush } from "@/lib/push";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function registrarCuenta(formData: FormData): Promise<ActionResult> {
  if (DEMO)
    return {
      ok: false,
      error: "El auto-registro requiere el backend de Supabase conectado.",
    };

  const nombre = String(formData.get("nombre") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };
  if (!email) return { ok: false, error: "El correo es obligatorio" };
  if (password.length < 6)
    return { ok: false, error: "La contraseña debe tener al menos 6 caracteres" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre } },
  });
  if (error) return { ok: false, error: mensajeSupabase(error) };

  // Aviso a cada gestor (campana + toast + push, mismo mecanismo que ya usa
  // el resto de la app) -- con service_role porque quien se acaba de
  // registrar no tiene permiso para ver ni insertar nada de otros perfiles.
  if (data.user) {
    const admin = createAdminClient();
    const { data: gestores } = await admin
      .from("profiles")
      .select("id")
      .in("rol", ["admin", "gerente"]);

    const mensaje = `${nombre} (${email}) pidió una cuenta — revísala en Usuarios.`;
    for (const g of gestores ?? []) {
      await admin.from("notificaciones").insert({
        usuario_id: g.id,
        tipo: "cuenta_pendiente",
        mensaje,
      });
      await enviarPush(g.id, {
        titulo: "Nueva solicitud de cuenta",
        cuerpo: mensaje,
        url: "/administracion?tab=usuarios",
      });
    }
  }

  return { ok: true };
}
