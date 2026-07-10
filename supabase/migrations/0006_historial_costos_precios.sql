-- ============================================================
--  Historial de costos (WAC) y precios de venta + márgenes.
--  - materiales.costo_unitario pasa a ser el COSTO PROMEDIO PONDERADO (WAC).
--  - materiales.precio_venta: precio de venta actual.
--  - movimientos.costo_unitario: snapshot del costo (valuación no se distorsiona).
--  - historial_precios: bitácora inmutable de costo y venta (para las gráficas).
-- ============================================================

alter table public.materiales
  add column if not exists precio_venta numeric(14, 2) not null default 0;

alter table public.movimientos
  add column if not exists costo_unitario numeric(14, 2);

-- ---------- Historial ----------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'tipo_precio') then
    create type public.tipo_precio as enum ('costo', 'venta');
  end if;
  if not exists (select 1 from pg_type where typname = 'fuente_precio') then
    create type public.fuente_precio as enum ('compra', 'manual', 'cotizacion', 'inicial');
  end if;
end $$;

create table if not exists public.historial_precios (
  id              uuid primary key default gen_random_uuid(),
  material_id     uuid references public.materiales (id) on delete set null,
  material_nombre text,
  material_sku    text,
  tipo            public.tipo_precio not null,
  valor           numeric(14, 2) not null,
  fuente          public.fuente_precio not null default 'manual',
  proveedor_id    uuid references public.proveedores (id) on delete set null,
  cantidad        numeric(14, 3),
  created_at      timestamptz not null default now()
);
create index if not exists historial_precios_material_idx
  on public.historial_precios (material_id, tipo, created_at);

alter table public.historial_precios enable row level security;
create policy "historial_precios_lectura" on public.historial_precios
  for select using (auth.role() = 'authenticated');
create policy "historial_precios_insert" on public.historial_precios
  for insert with check (auth.role() = 'authenticated');

-- ---------- Costo: WAC + snapshot + bitácora en cada movimiento ----------
create or replace function public.procesar_costo_movimiento()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m public.materiales%rowtype;
  wac numeric;
begin
  select * into m from public.materiales where id = new.material_id;
  if not found then
    return new;
  end if;

  if new.tipo = 'entrada'
     and new.costo_unitario is not null
     and new.costo_unitario > 0 then
    -- Promedio ponderado con la existencia ANTES de esta entrada
    -- (aplicar_movimiento suma la cantidad en un trigger AFTER INSERT).
    if (m.stock_actual + new.cantidad) > 0 then
      wac := (m.stock_actual * m.costo_unitario + new.cantidad * new.costo_unitario)
             / (m.stock_actual + new.cantidad);
    else
      wac := new.costo_unitario;
    end if;
    update public.materiales set costo_unitario = round(wac, 2) where id = m.id;

    insert into public.historial_precios
      (material_id, material_nombre, material_sku, tipo, valor, fuente, cantidad)
    values
      (m.id, m.nombre, m.sku, 'costo', new.costo_unitario, 'compra', new.cantidad);
  elsif new.costo_unitario is null then
    -- Salidas/ajustes/entradas sin costo: snapshot al WAC vigente.
    new.costo_unitario := m.costo_unitario;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_procesar_costo_movimiento on public.movimientos;
create trigger trg_procesar_costo_movimiento
  before insert on public.movimientos
  for each row execute function public.procesar_costo_movimiento();

-- ---------- Material: bitácora de costo inicial y de precio de venta ----------
create or replace function public.historial_precio_venta()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.precio_venta > 0 then
      insert into public.historial_precios
        (material_id, material_nombre, material_sku, tipo, valor, fuente)
      values (new.id, new.nombre, new.sku, 'venta', new.precio_venta, 'manual');
    end if;
    if new.costo_unitario > 0 then
      insert into public.historial_precios
        (material_id, material_nombre, material_sku, tipo, valor, fuente)
      values (new.id, new.nombre, new.sku, 'costo', new.costo_unitario, 'inicial');
    end if;
  elsif tg_op = 'UPDATE'
        and new.precio_venta is distinct from old.precio_venta
        and new.precio_venta > 0 then
    insert into public.historial_precios
      (material_id, material_nombre, material_sku, tipo, valor, fuente)
    values (new.id, new.nombre, new.sku, 'venta', new.precio_venta, 'manual');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_historial_precio_venta on public.materiales;
create trigger trg_historial_precio_venta
  after insert or update of precio_venta on public.materiales
  for each row execute function public.historial_precio_venta();

-- ---------- Backfill ----------
-- Punto de partida del historial de costo con el costo actual.
insert into public.historial_precios
  (material_id, material_nombre, material_sku, tipo, valor, fuente, created_at)
select id, nombre, sku, 'costo', costo_unitario, 'inicial', created_at
from public.materiales
where costo_unitario > 0;

-- Snapshot de costo en movimientos existentes (valuación al costo actual).
update public.movimientos mv
  set costo_unitario = m.costo_unitario
  from public.materiales m
  where mv.material_id = m.id and mv.costo_unitario is null;
