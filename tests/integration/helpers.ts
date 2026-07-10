import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const tieneCredenciales = Boolean(url && anonKey && serviceKey);

/** Cliente service_role — salta RLS, solo para setup/teardown de fixtures. */
export function getAdminClient(): SupabaseClient {
  return createClient(url!, serviceKey!);
}
