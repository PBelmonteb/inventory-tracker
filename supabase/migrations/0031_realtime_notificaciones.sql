-- ============================================================
--  Habilita Supabase Realtime en "notificaciones" para que la
--  campana se actualice sola (sin refresh ni esperar el polling
--  de respaldo de 60s) — ver components/notificaciones-provider.tsx.
--
--  Postgres no permite "add table" dos veces a la misma
--  publicación sin error, así que se checa primero (idempotente:
--  correr esta migración de nuevo no truena si ya estaba
--  habilitada, ej. si alguien la prendió antes a mano desde el
--  dashboard de Supabase).
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notificaciones'
  ) then
    alter publication supabase_realtime add table public.notificaciones;
  end if;
end $$;
