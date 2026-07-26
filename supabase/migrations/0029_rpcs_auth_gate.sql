-- ============================================================
--  Fix de seguridad (parte 2, ver 0028): mismo candado
--  `auth.role() = 'authenticated'` que ya se agregó a las 3 RPCs
--  de traslados, ahora para el resto de las RPCs "security
--  definer" que la app SÍ llama directo vía supabase.rpc(...) y
--  que todavía no lo tenían — sin él, cualquiera con la anon key
--  pública (sin sesión) podía invocarlas por REST, saltándose la
--  app, el login y el RLS (security definer bypassea RLS).
--
--  Auditoría completa (28 funciones "security definer" en total):
--  se excluyen a propósito las que son SOLO trigger (aplicar_movimiento,
--  validar_movimiento, snapshot_*, sync_responsable_nombre,
--  historial_precio_venta, procesar_costo_movimiento,
--  registrar_auditoria, gestionar_salidas_caso_venta, handle_new_user)
--  porque no son invocables de forma útil vía RPC directo — fallan
--  solas al referenciar NEW/OLD fuera de un trigger real. También se
--  excluyen mi_rol()/es_gestor() (solo lectura, ya seguras para anon
--  por diseño: regresan null/false) y punto_aviso() (no es security
--  definer). Las 11 de abajo sí son mutación real, sí las llama la
--  app por supabase.rpc(...), y no tenían ningún candado.
--
--  Cada función se reemplaza con EXACTAMENTE el mismo cuerpo que ya
--  tenía (ver la migración original citada en cada bloque) — el único
--  cambio es la línea de candado al inicio.
-- ============================================================

-- ---------- aplicar_conteo (0026) ----------
create or replace function public.aplicar_conteo(p_conteo uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  cn public.conteos%rowtype;
  it record;
  mov_id uuid;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

  select * into cn from public.conteos where id = p_conteo for update;
  if not found then
    raise exception 'Conteo no encontrado';
  end if;
  if cn.estado <> 'contado' then
    raise exception 'Este conteo no está listo para aplicarse';
  end if;

  for it in
    select * from public.conteo_items
    where conteo_id = p_conteo
      and material_id is not null
      and cantidad_contada is not null
      and cantidad_contada <> stock_esperado
  loop
    insert into public.movimientos
      (material_id, tipo, cantidad, ubicacion_id, usuario_id, nota, referencia)
    values
      (it.material_id, 'ajuste', it.cantidad_contada, it.ubicacion_id, auth.uid(),
       'Conteo cíclico — ' || cn.codigo, cn.codigo)
    returning id into mov_id;

    update public.conteo_items set movimiento_id = mov_id where id = it.id;
  end loop;

  update public.conteos
    set estado = 'aplicado', aplicado_por_id = auth.uid(), aplicado_at = now(), updated_at = now()
    where id = p_conteo;
end;
$$;

-- ---------- asignar_responsable_caso_compra (0012) ----------
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
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

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

-- ---------- asignar_responsable_caso_venta (0012) ----------
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
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

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

-- ---------- asignar_responsable_salida_pendiente (0012) ----------
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
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

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

-- ---------- cambiar_estado_caso_venta (0021) ----------
create or replace function public.cambiar_estado_caso_venta(
  p_caso uuid,
  p_estado public.estado_caso_venta
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  falta record;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

  if p_estado in ('confirmado', 'en_produccion', 'entregado') then
    perform 1 from public.materiales m
      where m.id in (select material_id from public.casos_venta_items where caso_venta_id = p_caso)
      order by m.id
      for update;

    select
      m.nombre as material,
      req.total as requerido,
      (m.stock_actual - coalesce(comp.total, 0)) as disponible
    into falta
    from (
      select material_id, sum(cantidad) as total
      from public.casos_venta_items
      where caso_venta_id = p_caso
      group by material_id
    ) req
    join public.materiales m on m.id = req.material_id
    left join (
      select material_id, sum(cantidad) as total
      from (
        select i.material_id, i.cantidad
        from public.casos_venta_items i
        join public.casos_venta cv on cv.id = i.caso_venta_id
        where cv.estado in ('confirmado', 'en_produccion')
          and cv.id <> p_caso
        union all
        select material_id, cantidad
        from public.salidas_pendientes
        where estado = 'pendiente'
      ) x
      group by material_id
    ) comp on comp.material_id = req.material_id
    where req.total > (m.stock_actual - coalesce(comp.total, 0))
    limit 1;

    if found then
      raise exception
        'Sin disponible de "%": requeridos %, disponibles % (el resto está comprometido).',
        falta.material, falta.requerido, falta.disponible;
    end if;
  end if;

  update public.casos_venta
    set estado = p_estado, updated_at = now()
    where id = p_caso;
end;
$$;

-- ---------- confirmar_salida_pendiente (0014) ----------
create or replace function public.confirmar_salida_pendiente(p_id uuid, p_cantidad numeric default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  sp public.salidas_pendientes%rowtype;
  cv public.casos_venta%rowtype;
  mov_id uuid;
  a_confirmar numeric;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

  select * into sp from public.salidas_pendientes where id = p_id for update;
  if not found then
    raise exception 'Salida pendiente no encontrada';
  end if;
  if sp.estado <> 'pendiente' then
    raise exception 'Esta salida ya fue resuelta';
  end if;

  a_confirmar := coalesce(p_cantidad, sp.cantidad);
  if a_confirmar <= 0 then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if a_confirmar > sp.cantidad then
    raise exception 'No puede confirmar más de lo pendiente (%)', sp.cantidad;
  end if;

  select * into cv from public.casos_venta where id = sp.caso_venta_id;

  insert into public.movimientos (material_id, tipo, cantidad, usuario_id, nota, referencia)
  values (
    sp.material_id,
    'salida',
    a_confirmar,
    auth.uid(),
    'Entrega: ' || coalesce(cv.titulo, 'caso de venta'),
    cv.referencia
  )
  returning id into mov_id;

  if a_confirmar < sp.cantidad then
    update public.salidas_pendientes
      set cantidad = sp.cantidad - a_confirmar
      where id = p_id;
  else
    update public.salidas_pendientes
      set estado = 'registrada', movimiento_id = mov_id, resuelta_at = now()
      where id = p_id;
  end if;
end;
$$;

-- ---------- producir (0016) ----------
create or replace function public.producir(
  p_producto_id uuid,
  p_cantidad numeric,
  p_ubicacion uuid default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  producto public.materiales%rowtype;
  item record;
  costo_total numeric := 0;
  costo_unitario_producto numeric;
  ref text := 'PROD-' || substr(gen_random_uuid()::text, 1, 8);
  mov_entrada_id uuid;
  n_componentes int := 0;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad a producir debe ser mayor a cero';
  end if;

  select * into producto from public.materiales where id = p_producto_id;
  if not found then
    raise exception 'Producto no encontrado';
  end if;

  for item in
    select b.componente_id, b.cantidad_por_unidad, m.costo_unitario
    from public.bom_items b
    join public.materiales m on m.id = b.componente_id
    where b.producto_id = p_producto_id
  loop
    n_componentes := n_componentes + 1;
    costo_total := costo_total + (item.cantidad_por_unidad * p_cantidad * item.costo_unitario);

    insert into public.movimientos
      (material_id, tipo, cantidad, usuario_id, nota, referencia, ubicacion_id)
    values
      (item.componente_id, 'salida', item.cantidad_por_unidad * p_cantidad, auth.uid(),
       'Producción: ' || producto.nombre, ref, p_ubicacion);
  end loop;

  if n_componentes = 0 then
    raise exception 'Este material no tiene una receta de producción configurada';
  end if;

  costo_unitario_producto := round(costo_total / p_cantidad, 2);

  insert into public.movimientos
    (material_id, tipo, cantidad, usuario_id, nota, referencia, costo_unitario, ubicacion_id)
  values
    (p_producto_id, 'entrada', p_cantidad, auth.uid(),
     'Producción', ref, costo_unitario_producto, p_ubicacion)
  returning id into mov_entrada_id;

  return mov_entrada_id;
end;
$$;

-- ---------- recibir_caso_compra (0011) ----------
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
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

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

-- ---------- resolver_solicitud_compra (0021) ----------
create or replace function public.resolver_solicitud_compra(
  p_solicitud uuid,
  p_caso_ganador uuid,
  p_usuario_id uuid default null,
  p_usuario_nombre text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  s public.solicitudes_compra%rowtype;
  h record;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

  select * into s from public.solicitudes_compra where id = p_solicitud for update;
  if not found or s.estado <> 'abierta' then
    return;
  end if;

  update public.solicitudes_compra
    set estado = 'resuelta', cotizacion_ganadora_id = p_caso_ganador, updated_at = now()
    where id = p_solicitud;

  insert into public.casos_compra_eventos (caso_compra_id, tipo, detalle, usuario_id, usuario_nombre)
  values (p_caso_ganador, 'estado_cambiado', 'Elegida como cotización ganadora.', p_usuario_id, p_usuario_nombre);

  for h in
    select id from public.casos_compra
    where solicitud_id = p_solicitud
      and id <> p_caso_ganador
      and estado in ('pendiente', 'cotizando', 'ordenado')
  loop
    update public.casos_compra set estado = 'cancelado', updated_at = now() where id = h.id;
    insert into public.casos_compra_eventos (caso_compra_id, tipo, detalle, usuario_id, usuario_nombre)
    values (h.id, 'estado_cambiado', 'Cancelado automáticamente: se eligió otra cotización de la misma solicitud.', p_usuario_id, p_usuario_nombre);
  end loop;
end;
$$;

-- ---------- sincronizar_notificaciones (0013) ----------
create or replace function public.sincronizar_notificaciones()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'No autorizado';
  end if;

  update public.notificaciones n
    set estado = 'atendida', resuelta_at = now()
    from public.materiales m
    where n.material_id = m.id
      and n.estado in ('abierta', 'descartada')
      and (not m.activo or m.stock_minimo <= 0 or m.stock_actual > public.punto_aviso(m));

  update public.notificaciones n
    set nivel = (case when m.stock_actual <= m.stock_minimo then 'bajo' else 'aviso' end)::public.nivel_notificacion,
        mensaje = (case when m.stock_actual <= m.stock_minimo
          then format('Stock bajo: %s (%s/%s %s). Solicita cotización.', m.nombre, m.stock_actual, m.stock_minimo, m.unidad)
          else format('Por agotarse: %s (%s %s, mínimo %s). Conviene cotizar.', m.nombre, m.stock_actual, m.unidad, m.stock_minimo)
        end)
    from public.materiales m
    where n.material_id = m.id
      and n.estado = 'abierta'
      and n.nivel <> (case when m.stock_actual <= m.stock_minimo then 'bajo' else 'aviso' end)::public.nivel_notificacion;

  insert into public.notificaciones (material_id, proveedor_id, mensaje, nivel)
  select
    m.id,
    m.proveedor_id,
    case when m.stock_actual <= m.stock_minimo
      then format('Stock bajo: %s (%s/%s %s). Solicita cotización.', m.nombre, m.stock_actual, m.stock_minimo, m.unidad)
      else format('Por agotarse: %s (%s %s, mínimo %s). Conviene cotizar.', m.nombre, m.stock_actual, m.unidad, m.stock_minimo)
    end,
    (case when m.stock_actual <= m.stock_minimo then 'bajo' else 'aviso' end)::public.nivel_notificacion
  from public.materiales m
  where m.activo
    and m.stock_minimo > 0
    and m.stock_actual <= public.punto_aviso(m)
    and not exists (
      select 1 from public.notificaciones n
      where n.material_id = m.id and n.estado in ('abierta', 'descartada')
    )
    and not exists (
      select 1 from public.casos_compra c
      where c.material_id = m.id
        and c.estado in ('pendiente', 'cotizando', 'ordenado')
    );
end;
$$;

-- ---------- transferir_stock (0011) ----------
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
