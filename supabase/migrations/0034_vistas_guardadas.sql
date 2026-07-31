-- ============================================================
--  Vistas/filtros guardados ("variants" estilo SAP Fiori): cada
--  usuario guarda su combinación favorita de filtros por página,
--  reusando el patrón de filtros-por-URL que ya tiene Movimientos
--  (el querystring completo se guarda tal cual, sin parsear).
-- ============================================================

create table if not exists public.vistas_guardadas (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.profiles (id) on delete cascade,
  pagina      text not null,
  nombre      text not null,
  query       text not null default '',
  created_at  timestamptz not null default now(),
  unique (usuario_id, pagina, nombre)
);

create index if not exists vistas_guardadas_usuario_pagina_idx
  on public.vistas_guardadas (usuario_id, pagina);

alter table public.vistas_guardadas enable row level security;

-- Totalmente privadas: cada quien ve, crea y borra solo las suyas. No hay
-- "update" — para renombrar o cambiar filtros se borra y se guarda de nuevo.
create policy "vistas_guardadas_lectura" on public.vistas_guardadas
  for select using (usuario_id = auth.uid());

create policy "vistas_guardadas_insert" on public.vistas_guardadas
  for insert with check (usuario_id = auth.uid());

create policy "vistas_guardadas_delete" on public.vistas_guardadas
  for delete using (usuario_id = auth.uid());
