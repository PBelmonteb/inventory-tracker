-- ============================================================
--  Historial de movimientos autónomo.
--  Cada movimiento guarda una copia (snapshot) del nombre y SKU
--  del material, y borrar un material YA NO borra sus movimientos.
--  Así el historial sobrevive aunque el material deje de existir.
-- ============================================================

-- 1) Snapshot del material en cada movimiento.
alter table public.movimientos
  add column if not exists material_nombre text,
  add column if not exists material_sku    text;

-- Rellenar los movimientos existentes con el material actual.
update public.movimientos mv
  set material_nombre = m.nombre,
      material_sku    = m.sku
  from public.materiales m
  where mv.material_id = m.id
    and mv.material_nombre is null;

-- Al insertar un movimiento, copia nombre/sku del material (cubre todas
-- las rutas: app, RPC de salidas, webhook, importador).
create or replace function public.snapshot_material_movimiento()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.material_nombre is null and new.material_id is not null then
    select nombre, sku
      into new.material_nombre, new.material_sku
      from public.materiales
      where id = new.material_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_snapshot_material_movimiento on public.movimientos;
create trigger trg_snapshot_material_movimiento
  before insert on public.movimientos
  for each row execute function public.snapshot_material_movimiento();

-- 2) Borrar un material ya no borra sus movimientos: el FK pasa de
--    ON DELETE CASCADE a ON DELETE SET NULL (el snapshot conserva la info).
alter table public.movimientos
  alter column material_id drop not null;

alter table public.movimientos
  drop constraint if exists movimientos_material_id_fkey;

alter table public.movimientos
  add constraint movimientos_material_id_fkey
  foreign key (material_id) references public.materiales (id)
  on delete set null;
