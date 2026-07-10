import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con la llave `service_role`: salta el RLS por completo.
 * SOLO para server actions/route handlers que necesiten la Admin API de Auth
 * (crear usuarios, listar auth.users). NUNCA importar desde un componente
 * cliente ni exponer esta llave al navegador.
 *
 * Cada acción que use este cliente DEBE verificar el rol del usuario que
 * llama (getCurrentProfile + esGestor) ANTES de operar — el RLS ya no
 * protege nada aquí.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
