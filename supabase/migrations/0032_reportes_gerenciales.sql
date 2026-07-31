-- ============================================================
--  Reportes gerenciales automáticos (semanal / mensual / trimestral):
--  tabla de registro + bucket de Storage para los PDFs.
--
--  La generación real (feed de KPIs -> IA -> PDF) NO vive aquí y
--  todavía no está construida — pendiente de que el usuario traiga
--  la plantilla mock en Word y decida poner la Anthropic API key
--  (ver memoria "reportes-gerenciales-ia-diseno"). Esta migración
--  solo prepara dónde va a vivir el resultado, mismo patrón que
--  0017 (reposición automática): un cron dispara un endpoint de la
--  app, que hace el trabajo real en TypeScript.
--
--  `kpis` guarda el mismo JSON que arma lib/reportes-gerenciales.ts
--  (getKPIsPeriodo) — así el reporte mensual puede comparar contra
--  los semanales anteriores sin tener que releer/reinterpretar PDFs.
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_reporte') then
    create type public.tipo_reporte as enum ('semanal', 'mensual', 'trimestral');
  end if;
end $$;

create table if not exists public.reportes_generados (
  id             uuid primary key default gen_random_uuid(),
  tipo           public.tipo_reporte not null,
  periodo_inicio date not null,
  periodo_fin    date not null, -- exclusivo, igual que RangoPeriodo en lib/reportes-periodo.ts
  archivo_path   text not null, -- ruta dentro del bucket "reportes"
  kpis           jsonb not null,
  created_at     timestamptz not null default now()
);

create index if not exists reportes_generados_tipo_idx
  on public.reportes_generados (tipo, periodo_inicio desc);

alter table public.reportes_generados enable row level security;

-- Solo gestores (admin/gerente) leen. Los inserts los hace el cron vía
-- service_role (mismo patrón que casos_compra automáticos en 0017), que
-- ignora RLS por completo — no hace falta policy de insert/update/delete
-- porque nadie más que service_role debe poder escribir aquí.
create policy "reportes_generados_lectura" on public.reportes_generados
  for select using (public.es_gestor());

-- ---------- Bucket de Storage para los PDFs ----------
-- Privado (public = false): los PDFs solo se sirven vía URL firmada o
-- por el propio storage.objects RLS de abajo, nunca por URL pública.
insert into storage.buckets (id, name, public)
values ('reportes', 'reportes', false)
on conflict (id) do nothing;

create policy "reportes_storage_lectura" on storage.objects
  for select using (bucket_id = 'reportes' and public.es_gestor());
