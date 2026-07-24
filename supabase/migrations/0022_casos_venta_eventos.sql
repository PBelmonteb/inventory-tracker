-- ============================================================
--  Timeline para casos de venta (estilo Salesforce), mismo patrón que ya
--  existe para casos de compra (0020_solicitudes_compra.sql) — reusa el
--  enum tipo_evento_caso, tabla propia porque la FK es a casos_venta.
--
--  Encontrado en auditoría (jul 2026): el lado de compras ya tenía "qué ha
--  pasado con este caso"; el lado de ventas (que es directamente ingreso)
--  no tenía nada — nadie podía responder "¿cuándo se confirmó esto?" o
--  "¿quién dejó esta nota?" para una venta.
-- ============================================================

create table public.casos_venta_eventos (
  id            uuid primary key default gen_random_uuid(),
  caso_venta_id uuid not null references public.casos_venta (id) on delete cascade,
  tipo          public.tipo_evento_caso not null,
  detalle       text,
  usuario_id    uuid references public.profiles (id) on delete set null,
  usuario_nombre text,
  created_at    timestamptz not null default now()
);
create index casos_venta_eventos_caso_idx on public.casos_venta_eventos (caso_venta_id, created_at);

alter table public.casos_venta_eventos enable row level security;
create policy "casos_venta_eventos_lectura" on public.casos_venta_eventos
  for select using (auth.role() = 'authenticated');
create policy "casos_venta_eventos_insert" on public.casos_venta_eventos
  for insert with check (auth.role() = 'authenticated');
