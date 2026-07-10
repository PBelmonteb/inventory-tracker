-- ============================================================
--  Casos de compra/venta autónomos: al borrar un proveedor o
--  cliente, sus casos ya NO se borran en cascada. Se guarda un
--  snapshot del nombre y el FK pasa a ON DELETE SET NULL.
--  (Mismo patrón que el historial de movimientos.)
-- ============================================================

alter table public.casos_compra
  add column if not exists proveedor_nombre text;
alter table public.casos_venta
  add column if not exists cliente_nombre text;

-- Backfill con los actuales.
update public.casos_compra c
  set proveedor_nombre = p.nombre
  from public.proveedores p
  where c.proveedor_id = p.id and c.proveedor_nombre is null;

update public.casos_venta c
  set cliente_nombre = cl.nombre
  from public.clientes cl
  where c.cliente_id = cl.id and c.cliente_nombre is null;

-- Snapshot al insertar (cubre app, webhook, etc.).
create or replace function public.snapshot_proveedor_caso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.proveedor_nombre is null and new.proveedor_id is not null then
    select nombre into new.proveedor_nombre
      from public.proveedores where id = new.proveedor_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_snapshot_proveedor_caso on public.casos_compra;
create trigger trg_snapshot_proveedor_caso
  before insert on public.casos_compra
  for each row execute function public.snapshot_proveedor_caso();

create or replace function public.snapshot_cliente_caso()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_nombre is null and new.cliente_id is not null then
    select nombre into new.cliente_nombre
      from public.clientes where id = new.cliente_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_snapshot_cliente_caso on public.casos_venta;
create trigger trg_snapshot_cliente_caso
  before insert on public.casos_venta
  for each row execute function public.snapshot_cliente_caso();

-- FK: cascade -> set null (y columnas nullable).
alter table public.casos_compra alter column proveedor_id drop not null;
alter table public.casos_compra drop constraint if exists casos_compra_proveedor_id_fkey;
alter table public.casos_compra
  add constraint casos_compra_proveedor_id_fkey
  foreign key (proveedor_id) references public.proveedores (id) on delete set null;

alter table public.casos_venta alter column cliente_id drop not null;
alter table public.casos_venta drop constraint if exists casos_venta_cliente_id_fkey;
alter table public.casos_venta
  add constraint casos_venta_cliente_id_fkey
  foreign key (cliente_id) references public.clientes (id) on delete set null;
