-- ============================================================
--  Responsable asignado a casos y salidas pendientes.
--  Gestores y operarios pueden asignar (sin gate de rol, igual que el
--  resto de las tablas operativas). La asignación genera una
--  notificación in-app dirigida a esa persona (campana + popup).
--
--  Nota: por ahora solo notificación in-app. Un futuro paso podría
--  enganchar aquí un envío de correo real (p. ej. vía Resend + un
--  webhook/edge function) una vez que SPF/DKIM del dominio esté listo.
-- ============================================================

-- ---------- Columnas responsable_id / responsable_nombre ----------
alter table public.casos_compra
  add column if not exists responsable_id uuid references public.profiles (id) on delete set null,
  add column if not exists responsable_nombre text;
alter table public.casos_venta
  add column if not exists responsable_id uuid references public.profiles (id) on delete set null,
  add column if not exists responsable_nombre text;
alter table public.salidas_pendientes
  add column if not exists responsable_id uuid references public.profiles (id) on delete set null,
  add column if not exists responsable_nombre text;

-- ---------- Snapshot del nombre al asignar (mismo shape en las 3 tablas) ----------
create or replace function public.snapshot_responsable()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.responsable_id is null then
    new.responsable_nombre := null;
  elsif tg_op = 'INSERT' or new.responsable_id is distinct from old.responsable_id then
    select nombre into new.responsable_nombre
      from public.profiles where id = new.responsable_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_snapshot_responsable_cc on public.casos_compra;
create trigger trg_snapshot_responsable_cc
  before insert or update of responsable_id on public.casos_compra
  for each row execute function public.snapshot_responsable();

drop trigger if exists trg_snapshot_responsable_cv on public.casos_venta;
create trigger trg_snapshot_responsable_cv
  before insert or update of responsable_id on public.casos_venta
  for each row execute function public.snapshot_responsable();

drop trigger if exists trg_snapshot_responsable_sp on public.salidas_pendientes;
create trigger trg_snapshot_responsable_sp
  before insert or update of responsable_id on public.salidas_pendientes
  for each row execute function public.snapshot_responsable();

-- ---------- Self-heal: si renombran al responsable, el snapshot se actualiza ----------
-- (Comportamiento nuevo, más estricto que proveedor_nombre/cliente_nombre —
-- ahí el snapshot solo se congela al crear; aquí conviene que un responsable
-- "activo" no se quede desactualizado si lo renombran.)
create or replace function public.sync_responsable_nombre()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.casos_compra set responsable_nombre = new.nombre where responsable_id = new.id;
  update public.casos_venta set responsable_nombre = new.nombre where responsable_id = new.id;
  update public.salidas_pendientes set responsable_nombre = new.nombre where responsable_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_sync_responsable_nombre on public.profiles;
create trigger trg_sync_responsable_nombre
  after update of nombre on public.profiles
  for each row execute function public.sync_responsable_nombre();

-- ---------- Notificaciones: usuario_id + tipo + entidades de asignación ----------
create type public.tipo_notificacion as enum ('stock', 'asignacion');

alter table public.notificaciones
  add column if not exists usuario_id uuid references public.profiles (id) on delete cascade,
  add column if not exists tipo public.tipo_notificacion not null default 'stock',
  add column if not exists caso_venta_id uuid references public.casos_venta (id) on delete cascade,
  add column if not exists salida_pendiente_id uuid references public.salidas_pendientes (id) on delete cascade;

-- Ambas columnas ya no aplican a notificaciones tipo 'asignacion'.
alter table public.notificaciones alter column material_id drop not null;
alter table public.notificaciones alter column nivel drop not null;

-- ---------- RLS: visibilidad personal para tipo='asignacion' ----------
-- Antes: cualquier autenticado veía TODAS las notificaciones (alertas de
-- stock, globales). Ahora: las de asignación (usuario_id no nulo) solo las
-- ve su destinatario o un gestor; las globales (usuario_id nulo) siguen
-- visibles para todos, igual que antes.
drop policy if exists "notificaciones_lectura" on public.notificaciones;
create policy "notificaciones_lectura" on public.notificaciones
  for select using (
    auth.role() = 'authenticated'
    and (usuario_id is null or usuario_id = auth.uid() or public.es_gestor())
  );
-- insert/update de notificaciones siguen abiertas a cualquier autenticado
-- (0003_portales.sql) — las RPCs de abajo son security definer de todos
-- modos, así que esto solo importa si algo más inserta/actualiza directo.

-- ---------- RPCs: asignar responsable + notificar, en una sola transacción ----------
create or replace function public.asignar_responsable_caso_compra(
  p_caso uuid,
  p_usuario uuid,
  p_asignado_por text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  c public.casos_compra%rowtype;
  msg text;
begin
  select * into c from public.casos_compra where id = p_caso for update;
  if not found then
    raise exception 'Caso de compra no encontrado';
  end if;
  if p_usuario is not null and not exists (select 1 from public.profiles where id = p_usuario) then
    raise exception 'Usuario no encontrado';
  end if;

  update public.casos_compra
    set responsable_id = p_usuario, updated_at = now()
    where id = p_caso;

  if p_usuario is not null then
    msg := case
      when p_asignado_por is not null then
        p_asignado_por || ' te asignó el caso de compra "' || c.titulo || '".'
      else
        'Se te asignó el caso de compra "' || c.titulo || '".'
    end;
    insert into public.notificaciones (usuario_id, tipo, mensaje, caso_compra_id)
    values (p_usuario, 'asignacion', msg, p_caso);
  end if;
end;
$$;

create or replace function public.asignar_responsable_caso_venta(
  p_caso uuid,
  p_usuario uuid,
  p_asignado_por text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  c public.casos_venta%rowtype;
  msg text;
begin
  select * into c from public.casos_venta where id = p_caso for update;
  if not found then
    raise exception 'Caso de venta no encontrado';
  end if;
  if p_usuario is not null and not exists (select 1 from public.profiles where id = p_usuario) then
    raise exception 'Usuario no encontrado';
  end if;

  update public.casos_venta
    set responsable_id = p_usuario, updated_at = now()
    where id = p_caso;

  if p_usuario is not null then
    msg := case
      when p_asignado_por is not null then
        p_asignado_por || ' te asignó el caso de venta "' || c.titulo || '".'
      else
        'Se te asignó el caso de venta "' || c.titulo || '".'
    end;
    insert into public.notificaciones (usuario_id, tipo, mensaje, caso_venta_id)
    values (p_usuario, 'asignacion', msg, p_caso);
  end if;
end;
$$;

create or replace function public.asignar_responsable_salida_pendiente(
  p_id uuid,
  p_usuario uuid,
  p_asignado_por text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  sp public.salidas_pendientes%rowtype;
  mat_nombre text;
  cv_titulo text;
  msg text;
begin
  select * into sp from public.salidas_pendientes where id = p_id for update;
  if not found then
    raise exception 'Salida pendiente no encontrada';
  end if;
  if p_usuario is not null and not exists (select 1 from public.profiles where id = p_usuario) then
    raise exception 'Usuario no encontrado';
  end if;

  update public.salidas_pendientes
    set responsable_id = p_usuario
    where id = p_id;

  if p_usuario is not null then
    select nombre into mat_nombre from public.materiales where id = sp.material_id;
    select titulo into cv_titulo from public.casos_venta where id = sp.caso_venta_id;
    msg := case
      when p_asignado_por is not null then
        p_asignado_por || ' te asignó la salida pendiente de "' ||
        coalesce(mat_nombre, 'material') || '" (' || coalesce(cv_titulo, 'caso de venta') || ').'
      else
        'Se te asignó la salida pendiente de "' ||
        coalesce(mat_nombre, 'material') || '" (' || coalesce(cv_titulo, 'caso de venta') || ').'
    end;
    insert into public.notificaciones (usuario_id, tipo, mensaje, salida_pendiente_id)
    values (p_usuario, 'asignacion', msg, p_id);
  end if;
end;
$$;
