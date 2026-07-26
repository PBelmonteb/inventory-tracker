-- ============================================================
--  Fix de seguridad: iniciar_traslado/recibir_traslado/
--  cancelar_traslado (migración 0027) son "security definer" y
--  Postgres otorga EXECUTE a PUBLIC por default — sin este check
--  cualquiera con la anon key pública (sin sesión) podía llamarlas
--  directo vía REST, saltándose la app por completo.
--
--  Mismo hueco existe hoy en transferir_stock (0011),
--  aplicar_conteo (0026) y recibir_caso_compra (0011) — se deja
--  fuera de esta migración a propósito (alcance de esta sesión es
--  solo traslados); pendiente una pasada dedicada a auditar y
--  corregir TODAS las RPCs security definer del proyecto.
-- ============================================================

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
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

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
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

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

create or replace function public.cancelar_traslado(p_traslado uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  t public.traslados%rowtype;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

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
