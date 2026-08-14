-- ============================================================
--  Continúa 0047/0048: mismo hueco, ahora del lado de ventas, más el
--  candado que le faltaba por dentro a 3 RPCs "security definer" que ya
--  tenían auth.role() <> 'authenticated' (0029_rpcs_auth_gate.sql) pero
--  nunca el rol específico que sí exige su Server Action -- llamando al
--  RPC directo por supabase.rpc(...), cualquier autenticado se saltaba
--  requireGestorOCompras()/puedeGestionarVentas() por completo.
-- ============================================================

-- ---------- casos_venta / casos_venta_items ----------
-- autorizarCasoVenta (lib/actions/autorizacion-ventas.ts, gestor/ventas-only
-- en JS) actualiza casos_venta_items.precio_unitario y casos_venta.estado
-- directo por sesión normal -- sin este trigger, cualquier autenticado
-- podía hacer
--   supabase.from('casos_venta_items').update({precio_unitario:1})...
--   supabase.from('casos_venta').update({estado:'cotizacion'})...
-- y autorizarse su propia cotización con el precio que quisiera, sin
-- pasar por requireGestorOVentas(). 'confirmado'/'en_produccion'/
-- 'entregado' (via cambiar_estado_caso_venta) se protegen aquí también
-- porque RLS permite el update directo a la tabla sin pasar por el RPC.
create or replace function public.proteger_transiciones_caso_venta()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.es_gestor_o_ventas() then
    return new;
  end if;
  if new.estado is distinct from old.estado
     and new.estado in ('cotizacion', 'confirmado', 'en_produccion', 'entregado') then
    raise exception 'No autorizado para cambiar el caso a este estado';
  end if;
  return new;
end;
$$;

drop trigger if exists casos_venta_proteger_transiciones on public.casos_venta;
create trigger casos_venta_proteger_transiciones
  before update on public.casos_venta
  for each row execute function public.proteger_transiciones_caso_venta();

create or replace function public.proteger_precio_caso_venta_item()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.es_gestor_o_ventas() then
    return new;
  end if;
  new.precio_unitario := old.precio_unitario;
  return new;
end;
$$;

drop trigger if exists casos_venta_items_proteger_precio on public.casos_venta_items;
create trigger casos_venta_items_proteger_precio
  before update on public.casos_venta_items
  for each row execute function public.proteger_precio_caso_venta_item();

-- ---------- RPCs: mismo candado que ya exige su Server Action ----------
-- Se reemplaza cada función con EXACTAMENTE el mismo cuerpo que ya tenía
-- en 0029_rpcs_auth_gate.sql -- el único cambio es qué candado se checa.

-- cambiar_estado_caso_venta: lib/actions/ventas.ts (cambiarEstadoCasoVenta)
-- ya exige puedeGestionarVentas(); el RPC solo pedía estar autenticado.
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
  if not public.es_gestor_o_ventas() then
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

-- confirmar_salida_pendiente: lib/actions/ventas.ts (confirmarSalidaPendiente)
-- ya exige puedeGestionarVentas(); el RPC solo pedía estar autenticado.
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
  if not public.es_gestor_o_ventas() then
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

-- resolver_solicitud_compra: lib/actions/solicitudes.ts (elegirGanadora)
-- ya exige puedeGestionarCompras(); el RPC solo pedía estar autenticado --
-- cualquiera podía elegir la cotización "ganadora" que quisiera y cancelar
-- las demás, sin pasar por ese candado.
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
  if not public.es_gestor_o_compras() then
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
