-- ============================================================
--  Convenios con clientes (precio pactado) — mirror de
--  0018_convenios_proveedor.sql, del lado de venta. Un vendedor negocia
--  un precio especial por cliente+material; solo un convenio puede estar
--  `activo` a la vez por ese par (editar = desactivar el viejo + crear
--  uno nuevo, conserva historial).
-- ============================================================

create table public.convenios_cliente (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.clientes(id) on delete cascade,
  material_id       uuid not null references public.materiales(id) on delete cascade,
  precio_pactado    numeric(14,2) not null check (precio_pactado > 0),
  cantidad_minima   numeric(14,3) check (cantidad_minima is null or cantidad_minima > 0),
  condiciones_pago  text,
  vigencia_hasta    date,
  notas             text,
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index convenios_cliente_activo_idx on public.convenios_cliente
  (cliente_id, material_id) where activo;

alter table public.convenios_cliente enable row level security;

create policy "convenios_cliente_lectura" on public.convenios_cliente
  for select using (auth.role() = 'authenticated');
create policy "convenios_cliente_insert" on public.convenios_cliente
  for insert with check (public.es_gestor_o_ventas());
create policy "convenios_cliente_update" on public.convenios_cliente
  for update using (public.es_gestor_o_ventas());
create policy "convenios_cliente_delete" on public.convenios_cliente
  for delete using (public.es_gestor_o_ventas());
