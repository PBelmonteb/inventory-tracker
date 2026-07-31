-- ============================================================
--  Bloqueo de calidad: materiales marcados "requiere inspección"
--  no suman stock al recibirse — quedan en una inspección
--  pendiente hasta que un gestor libere (todo o en parte) o
--  rechace, con motivo. Lo rechazado nunca toca el inventario.
--
--  Se integra a la bandeja de aprobaciones ya existente (ver
--  lib/aprobaciones.ts) como una tercera/cuarta categoría, en vez
--  de una pantalla nueva — mismo patrón "My Inbox" que ya se usa
--  ahí para casos por autorizar y conteos por revisar.
-- ============================================================

-- ---------- Opt-in por material ----------
-- Por defecto false: el material sigue sumando stock al instante al
-- recibirse, como hoy. Solo los materiales que de verdad se inspeccionan
-- (ej. aluminio que entra con control de calidad) lo activan.
alter table public.materiales
  add column if not exists requiere_inspeccion_calidad boolean not null default false;

-- ---------- Tabla de inspecciones ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'estado_inspeccion_calidad') then
    create type public.estado_inspeccion_calidad as enum ('pendiente', 'resuelta');
  end if;
end $$;

create table if not exists public.inspecciones_calidad (
  id                  uuid primary key default gen_random_uuid(),
  caso_compra_id      uuid references public.casos_compra (id) on delete set null,
  -- Snapshots (sobreviven a que se borre el material/ubicación después,
  -- mismo patrón que casos_compra/conteo_items).
  material_id         uuid references public.materiales (id) on delete set null,
  material_nombre     text not null,
  material_sku        text,
  proveedor_nombre    text,
  ubicacion_id        uuid references public.ubicaciones (id) on delete set null,
  ubicacion_nombre    text,
  referencia          text, -- OC-xxxx del caso, si tiene
  cantidad_recibida   numeric(14, 3) not null check (cantidad_recibida > 0),
  costo_unitario      numeric(14, 2) not null default 0,
  estado              public.estado_inspeccion_calidad not null default 'pendiente',
  -- Se llenan al resolver. liberada + rechazada debe sumar cantidad_recibida
  -- (lo valida resolver_inspeccion_calidad, no un check acá porque durante
  -- "pendiente" ambas son null).
  cantidad_liberada   numeric(14, 3),
  cantidad_rechazada  numeric(14, 3),
  motivo_rechazo      text,
  -- Movimiento de entrada creado por la porción liberada (null si todo se
  -- rechazó, o mientras sigue pendiente).
  movimiento_id       uuid references public.movimientos (id) on delete set null,
  creado_por_id       uuid references public.profiles (id) on delete set null,
  creado_por_nombre   text,
  resuelto_por_id     uuid references public.profiles (id) on delete set null,
  resuelto_por_nombre text,
  resuelto_at         timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists inspecciones_calidad_estado_idx
  on public.inspecciones_calidad (estado, created_at desc);

alter table public.inspecciones_calidad enable row level security;

-- Cualquier autenticado lee (igual que conteos) — el candado de quién
-- puede RESOLVER una inspección vive en el server action
-- (lib/actions/autorizacion.ts, requireGestor()), no aquí; el costo real
-- de recepción ya era visible a cualquiera desde antes en
-- recibir-compra-form.tsx, esto no cambia ese alcance.
create policy "inspecciones_calidad_lectura" on public.inspecciones_calidad
  for select using (auth.role() = 'authenticated');

-- ---------- Caso de compra: enlace hacia adelante ----------
-- Igual que movimiento_id (recepción normal), pero para el camino de
-- inspección — sirve para no dejar recibir el mismo caso dos veces y
-- para trazar caso -> inspección -> movimiento.
alter table public.casos_compra
  add column if not exists inspeccion_calidad_id uuid references public.inspecciones_calidad (id) on delete set null;

-- ---------- recibir_caso_compra: ahora bifurca ----------
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
  m public.materiales%rowtype;
  mov_id uuid;
  insp_id uuid;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

  select * into c from public.casos_compra where id = p_caso for update;
  if not found then
    raise exception 'Caso de compra no encontrado';
  end if;
  if c.movimiento_id is not null or c.inspeccion_calidad_id is not null then
    raise exception 'Este caso ya fue recibido';
  end if;
  if c.material_id is null then
    raise exception 'El caso no tiene un material asignado';
  end if;
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;

  select * into m from public.materiales where id = c.material_id;

  if m.requiere_inspeccion_calidad then
    insert into public.inspecciones_calidad
      (caso_compra_id, material_id, material_nombre, material_sku,
       proveedor_nombre, ubicacion_id, ubicacion_nombre, referencia,
       cantidad_recibida, costo_unitario, creado_por_id, creado_por_nombre)
    values
      (p_caso, c.material_id, m.nombre, m.sku,
       c.proveedor_nombre, p_ubicacion,
       (select nombre from public.ubicaciones where id = p_ubicacion),
       c.referencia, p_cantidad, coalesce(p_costo, 0),
       auth.uid(), (select nombre from public.profiles where id = auth.uid()))
    returning id into insp_id;

    update public.casos_compra
      set estado = 'recibido', inspeccion_calidad_id = insp_id, updated_at = now()
      where id = p_caso;
  else
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
  end if;
end;
$$;

-- ---------- resolver_inspeccion_calidad: liberar y/o rechazar ----------
create or replace function public.resolver_inspeccion_calidad(
  p_inspeccion uuid,
  p_cantidad_liberada numeric,
  p_cantidad_rechazada numeric,
  p_motivo_rechazo text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  i public.inspecciones_calidad%rowtype;
  mov_id uuid;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

  select * into i from public.inspecciones_calidad where id = p_inspeccion for update;
  if not found then
    raise exception 'Inspección no encontrada';
  end if;
  if i.estado <> 'pendiente' then
    raise exception 'Esta inspección ya fue resuelta';
  end if;
  if p_cantidad_liberada is null or p_cantidad_rechazada is null
     or p_cantidad_liberada < 0 or p_cantidad_rechazada < 0 then
    raise exception 'Las cantidades no pueden ser negativas';
  end if;
  if abs((p_cantidad_liberada + p_cantidad_rechazada) - i.cantidad_recibida) > 0.001 then
    raise exception 'Liberado + rechazado debe sumar lo recibido (%)', i.cantidad_recibida;
  end if;
  if p_cantidad_rechazada > 0 and coalesce(trim(p_motivo_rechazo), '') = '' then
    raise exception 'Captura el motivo del rechazo';
  end if;

  if p_cantidad_liberada > 0 then
    insert into public.movimientos
      (material_id, tipo, cantidad, usuario_id, nota, referencia, costo_unitario, ubicacion_id)
    values
      (i.material_id, 'entrada', p_cantidad_liberada, auth.uid(),
       'Liberación de calidad' || case when i.referencia is not null then ' — ' || i.referencia else '' end,
       i.referencia, nullif(i.costo_unitario, 0), i.ubicacion_id)
    returning id into mov_id;
  end if;

  update public.inspecciones_calidad
    set estado = 'resuelta',
        cantidad_liberada = p_cantidad_liberada,
        cantidad_rechazada = p_cantidad_rechazada,
        motivo_rechazo = nullif(trim(p_motivo_rechazo), ''),
        movimiento_id = mov_id,
        resuelto_por_id = auth.uid(),
        resuelto_por_nombre = (select nombre from public.profiles where id = auth.uid()),
        resuelto_at = now()
    where id = p_inspeccion;
end;
$$;
