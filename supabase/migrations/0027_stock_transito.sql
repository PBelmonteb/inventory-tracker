-- ============================================================
--  Stock en tránsito: un traslado entre ubicaciones puede tomar
--  tiempo (ej. entre plantas lejanas) en vez de ser instantáneo.
--  transferir_stock() (migración 0011) sigue existiendo tal cual
--  para el caso común (mismo sitio, sin fricción); esto es un
--  camino alterno, opcional, para cuando SÍ toma tiempo.
--
--  La salida de origen se registra YA (el material sale
--  físicamente en ese momento) — la entrada a destino queda
--  pendiente hasta que alguien confirma la llegada. Mientras
--  tanto el material no cuenta en NINGUNA ubicación: ya no está
--  en origen, todavía no está en destino. Reusa
--  validar_movimiento()/aplicar_movimiento() (0011) para toda la
--  aritmética de stock — nada de eso se reimplementa aquí.
-- ============================================================

create type public.estado_traslado as enum ('en_transito', 'recibido', 'cancelado');

create table public.traslados (
  id                    uuid primary key default gen_random_uuid(),
  codigo                text not null unique,
  -- Snapshot (historial autónomo, mismo patrón que conteos/casos_compra):
  -- sobrevive a que el material o las ubicaciones se eliminen.
  material_id           uuid references public.materiales (id) on delete set null,
  material_nombre       text not null,
  material_sku          text,
  unidad                text not null,
  cantidad              numeric(14, 3) not null check (cantidad > 0),
  origen_id             uuid references public.ubicaciones (id) on delete set null,
  origen_nombre         text,
  destino_id            uuid references public.ubicaciones (id) on delete set null,
  destino_nombre        text,
  estado                public.estado_traslado not null default 'en_transito',
  nota                  text,
  creado_por_id         uuid references public.profiles (id) on delete set null,
  creado_por_nombre     text,
  recibido_por_id       uuid references public.profiles (id) on delete set null,
  recibido_por_nombre   text,
  movimiento_salida_id  uuid references public.movimientos (id) on delete set null,
  movimiento_entrada_id uuid references public.movimientos (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  recibido_at           timestamptz
);

create index traslados_estado_idx on public.traslados (estado);

alter table public.traslados enable row level security;
create policy "traslados_lectura" on public.traslados
  for select using (auth.role() = 'authenticated');
-- Sin políticas de insert/update: igual que material_stock_ubicacion
-- (0011), todo el escrito pasa por las RPCs security definer de abajo,
-- nunca por un insert/update directo del cliente.

-- ---------- Iniciar traslado: registra la salida YA, deja la llegada pendiente ----------
create or replace function public.iniciar_traslado(
  p_material uuid,
  p_origen uuid,
  p_destino uuid,
  p_cantidad numeric,
  p_nota text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_material_nombre text;
  v_material_sku text;
  v_unidad text;
  v_origen_nombre text;
  v_destino_nombre text;
  v_actor_nombre text;
  v_codigo text;
  v_mov_id uuid;
  v_traslado_id uuid;
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

  select nombre, sku, unidad into v_material_nombre, v_material_sku, v_unidad
    from public.materiales where id = p_material;
  if not found then
    raise exception 'Material no encontrado';
  end if;

  select nombre into v_origen_nombre from public.ubicaciones where id = p_origen;
  select nombre into v_destino_nombre from public.ubicaciones where id = p_destino;
  select nombre into v_actor_nombre from public.profiles where id = auth.uid();
  v_codigo := 'TRAS-' || substr(gen_random_uuid()::text, 1, 8);

  -- validar_movimiento (0011) valida disponibilidad en origen y aborta toda
  -- la función si no alcanza; aplicar_movimiento descuenta el stock ahí.
  insert into public.movimientos (material_id, tipo, cantidad, usuario_id, nota, referencia, ubicacion_id)
  values (
    p_material, 'salida', p_cantidad, auth.uid(),
    coalesce(p_nota, 'Traslado (en tránsito) a ' || coalesce(v_destino_nombre, 'otra ubicación')),
    v_codigo, p_origen
  )
  returning id into v_mov_id;

  insert into public.traslados (
    codigo, material_id, material_nombre, material_sku, unidad, cantidad,
    origen_id, origen_nombre, destino_id, destino_nombre, nota,
    creado_por_id, creado_por_nombre, movimiento_salida_id
  )
  values (
    v_codigo, p_material, v_material_nombre, v_material_sku, v_unidad, p_cantidad,
    p_origen, v_origen_nombre, p_destino, v_destino_nombre, p_nota,
    auth.uid(), v_actor_nombre, v_mov_id
  )
  returning id into v_traslado_id;

  return v_traslado_id;
end;
$$;

-- ---------- Recibir traslado: confirma la llegada, aplica la entrada ----------
create or replace function public.recibir_traslado(p_traslado uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  t public.traslados%rowtype;
  v_actor_nombre text;
  v_mov_id uuid;
begin
  select * into t from public.traslados where id = p_traslado for update;
  if not found then
    raise exception 'Traslado no encontrado';
  end if;
  if t.estado <> 'en_transito' then
    raise exception 'Este traslado ya no está en tránsito';
  end if;
  if t.material_id is null then
    raise exception 'El material de este traslado ya no existe';
  end if;

  select nombre into v_actor_nombre from public.profiles where id = auth.uid();

  insert into public.movimientos (material_id, tipo, cantidad, usuario_id, nota, referencia, ubicacion_id)
  values (
    t.material_id, 'entrada', t.cantidad, auth.uid(),
    coalesce(t.nota, 'Traslado desde ' || coalesce(t.origen_nombre, 'otra ubicación')),
    t.codigo, t.destino_id
  )
  returning id into v_mov_id;

  update public.traslados
    set estado = 'recibido',
        recibido_por_id = auth.uid(),
        recibido_por_nombre = v_actor_nombre,
        recibido_at = now(),
        updated_at = now(),
        movimiento_entrada_id = v_mov_id
    where id = p_traslado;
end;
$$;

-- ---------- Cancelar traslado: regresa el material a origen ----------
-- Nunca se edita/borra el movimiento de salida ya hecho (historial
-- autónomo) — se agrega una entrada compensatoria en origen, mismo
-- criterio que el resto de la app.
create or replace function public.cancelar_traslado(p_traslado uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  t public.traslados%rowtype;
begin
  select * into t from public.traslados where id = p_traslado for update;
  if not found then
    raise exception 'Traslado no encontrado';
  end if;
  if t.estado <> 'en_transito' then
    raise exception 'Este traslado ya no está en tránsito';
  end if;
  if t.material_id is null then
    raise exception 'El material de este traslado ya no existe';
  end if;

  insert into public.movimientos (material_id, tipo, cantidad, usuario_id, nota, referencia, ubicacion_id)
  values (
    t.material_id, 'entrada', t.cantidad, auth.uid(),
    'Traslado cancelado — regresa a ' || coalesce(t.origen_nombre, 'origen'),
    t.codigo, t.origen_id
  );

  update public.traslados
    set estado = 'cancelado', updated_at = now()
    where id = p_traslado;
end;
$$;
