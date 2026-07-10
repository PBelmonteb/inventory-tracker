-- ============================================================
--  Multi-ubicación: un material puede tener stock repartido en
--  varias ubicaciones. materiales.ubicacion_id sigue existiendo
--  como "ubicación por defecto" (destino de movimientos que no
--  especifican una); materiales.stock_actual pasa a ser la SUMA
--  de sus ubicaciones (se recalcula solo, en cada movimiento).
--
--  Sin backfill de datos: el stock existente de cada material se
--  sigue mostrando igual (implícito en su ubicación por defecto)
--  hasta que un movimiento nuevo lo "materialice" explícitamente.
--  Esto evita tocar números de stock ya correctos.
-- ============================================================

create table if not exists public.material_stock_ubicacion (
  material_id   uuid not null references public.materiales (id) on delete cascade,
  ubicacion_id  uuid references public.ubicaciones (id) on delete set null,
  stock         numeric(14, 3) not null default 0,
  updated_at    timestamptz not null default now()
);
create index if not exists material_stock_ubicacion_material_idx
  on public.material_stock_ubicacion (material_id);

alter table public.material_stock_ubicacion enable row level security;
create policy "material_stock_ubicacion_lectura" on public.material_stock_ubicacion
  for select using (auth.role() = 'authenticated');
-- Sin políticas de insert/update: solo el trigger (security definer) y las
-- RPCs de traslado/recepción escriben aquí.

alter table public.movimientos
  add column if not exists ubicacion_id uuid references public.ubicaciones (id) on delete set null;

-- ---------- Validación (BEFORE INSERT): stock por UBICACIÓN, no total ----------
-- Reemplaza la validación anterior (que solo miraba el total del material).
create or replace function public.validar_movimiento()
returns trigger
language plpgsql
as $$
declare
  home uuid;
  loc uuid;
  disponible numeric;
begin
  if new.cantidad <= 0 and new.tipo <> 'ajuste' then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  if new.tipo = 'salida' then
    select ubicacion_id into home from public.materiales where id = new.material_id;
    loc := coalesce(new.ubicacion_id, home);

    select stock into disponible from public.material_stock_ubicacion
      where material_id = new.material_id and ubicacion_id is not distinct from loc;

    if not found then
      -- Sin fila explícita: si es la ubicación por defecto, el total del
      -- material se asume completo ahí; si no, no hay evidencia de stock.
      select case when ubicacion_id is not distinct from loc then stock_actual else 0 end
        into disponible
        from public.materiales where id = new.material_id;
    end if;

    if disponible < new.cantidad then
      raise exception 'Stock insuficiente en esa ubicación: disponible %, solicitado %', disponible, new.cantidad;
    end if;
  end if;

  return new;
end;
$$;

-- ---------- Aplicación (AFTER INSERT): actualiza la ubicación y recalcula el total ----------
create or replace function public.aplicar_movimiento()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  home uuid;
  loc uuid;
  home_total numeric;
  actual numeric;
begin
  select ubicacion_id, stock_actual into home, home_total
    from public.materiales where id = new.material_id;
  loc := coalesce(new.ubicacion_id, home);

  -- Si este movimiento toca una ubicación distinta a la de por defecto y esa
  -- ubicación por defecto aún no tiene fila explícita, la materializamos
  -- ahora (para no perder ese stock al recalcular el total como suma).
  if loc is distinct from home then
    if not exists (
      select 1 from public.material_stock_ubicacion
      where material_id = new.material_id and ubicacion_id is not distinct from home
    ) then
      insert into public.material_stock_ubicacion (material_id, ubicacion_id, stock, updated_at)
      values (new.material_id, home, home_total, now());
    end if;
  end if;

  select stock into actual from public.material_stock_ubicacion
    where material_id = new.material_id and ubicacion_id is not distinct from loc
    for update;

  if not found then
    actual := case when loc is not distinct from home then home_total else 0 end;
    insert into public.material_stock_ubicacion (material_id, ubicacion_id, stock, updated_at)
    values (new.material_id, loc, actual, now());
  end if;

  if new.tipo = 'entrada' then
    actual := actual + new.cantidad;
  elsif new.tipo = 'salida' then
    actual := actual - new.cantidad;
  else
    actual := new.cantidad; -- ajuste: valor absoluto para ESA ubicación
  end if;

  update public.material_stock_ubicacion
    set stock = actual, updated_at = now()
    where material_id = new.material_id and ubicacion_id is not distinct from loc;

  -- El total del material es la suma de todas sus ubicaciones conocidas.
  update public.materiales m
    set stock_actual = (
      select coalesce(sum(s.stock), 0)
      from public.material_stock_ubicacion s
      where s.material_id = m.id
    ),
    updated_at = now()
  where m.id = new.material_id;

  return new;
end;
$$;

-- ---------- Transferencia entre ubicaciones (transaccional) ----------
-- Genera una salida en el origen y una entrada en el destino, ligadas por
-- una misma referencia "TRASLADO-xxxxxxxx". Si no hay disponible en el
-- origen, validar_movimiento aborta toda la operación (atómico).
create or replace function public.transferir_stock(
  p_material uuid,
  p_origen uuid,
  p_destino uuid,
  p_cantidad numeric,
  p_nota text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  nombre_origen text;
  nombre_destino text;
  ref text;
begin
  if p_origen is null or p_destino is null then
    raise exception 'Selecciona origen y destino';
  end if;
  if p_origen = p_destino then
    raise exception 'El origen y destino deben ser distintos';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if not exists (select 1 from public.materiales where id = p_material) then
    raise exception 'Material no encontrado';
  end if;

  select nombre into nombre_origen from public.ubicaciones where id = p_origen;
  select nombre into nombre_destino from public.ubicaciones where id = p_destino;
  ref := 'TRASLADO-' || substr(gen_random_uuid()::text, 1, 8);

  insert into public.movimientos (material_id, tipo, cantidad, usuario_id, nota, referencia, ubicacion_id)
  values (
    p_material, 'salida', p_cantidad, auth.uid(),
    coalesce(p_nota, 'Traslado a ' || coalesce(nombre_destino, 'otra ubicación')),
    ref, p_origen
  );

  insert into public.movimientos (material_id, tipo, cantidad, usuario_id, nota, referencia, ubicacion_id)
  values (
    p_material, 'entrada', p_cantidad, auth.uid(),
    coalesce(p_nota, 'Traslado desde ' || coalesce(nombre_origen, 'otra ubicación')),
    ref, p_destino
  );
end;
$$;

-- ---------- Recepción de compras: acepta ubicación destino opcional ----------
create or replace function public.recibir_caso_compra(
  p_caso uuid,
  p_cantidad numeric,
  p_costo numeric,
  p_ubicacion uuid default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  c public.casos_compra%rowtype;
  mov_id uuid;
begin
  select * into c from public.casos_compra where id = p_caso for update;
  if not found then
    raise exception 'Caso de compra no encontrado';
  end if;
  if c.movimiento_id is not null then
    raise exception 'Este caso ya fue recibido';
  end if;
  if c.material_id is null then
    raise exception 'El caso no tiene un material asignado';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  insert into public.movimientos
    (material_id, tipo, cantidad, usuario_id, nota, referencia, costo_unitario, ubicacion_id)
  values
    (c.material_id, 'entrada', p_cantidad, auth.uid(),
     'Recepción: ' || coalesce(c.titulo, 'compra'), c.referencia,
     nullif(p_costo, 0), p_ubicacion)
  returning id into mov_id;

  update public.casos_compra
    set estado = 'recibido', movimiento_id = mov_id, updated_at = now()
    where id = p_caso;
end;
$$;
