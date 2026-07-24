-- ============================================================
--  Condiciones de carrera encontradas en auditoría (jul 2026): invisibles
--  en pruebas de un solo usuario, pero reales con varios usuarios/procesos
--  concurrentes tocando el mismo material o la misma solicitud. Las 4
--  comparten la misma causa raíz: un "leer → decidir → escribir" sin
--  ningún lock de por medio, así que dos llamadas concurrentes pueden
--  leer el mismo estado "antes" y ambas proceder como si fueran la única.
-- ============================================================

-- ---------- 1) WAC: lock de materiales antes de leer stock/costo ----------
-- Antes: el select no bloqueaba la fila, así que dos entradas concurrentes
-- del MISMO material (p. ej. dos convenios distintos recibidos casi al
-- mismo tiempo) podían leer el mismo stock_actual/costo_unitario "de
-- antes" y la que commiteara después pisaba silenciosamente el cálculo de
-- la otra — el costo promedio ponderado quedaba mal sin ningún error.
create or replace function public.procesar_costo_movimiento()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m public.materiales%rowtype;
  wac numeric;
begin
  select * into m from public.materiales where id = new.material_id for update;
  if not found then
    return new;
  end if;

  if new.tipo = 'entrada'
     and new.costo_unitario is not null
     and new.costo_unitario > 0 then
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
    new.costo_unitario := m.costo_unitario;
  end if;

  return new;
end;
$$;

-- ---------- 2) Sobreventa: revalidar DESPUÉS del lock, no solo antes ----------
-- Antes: validar_movimiento (BEFORE, sin lock) leía el disponible y lo
-- comparaba contra lo solicitado — pero como esa lectura no bloqueaba
-- nada, dos salidas concurrentes del mismo material/ubicación podían
-- ambas leer "alcanza" antes de que cualquiera confirmara, y las dos
-- proceder. aplicar_movimiento (AFTER) sí toma el lock real
-- (`for update`), pero nunca revalidaba que el resultado no quedara
-- negativo — dejaba pasar la sobreventa pese a existir la protección.
-- validar_movimiento se deja igual (sigue sirviendo de rechazo rápido
-- para el caso obvio, sin concurrencia de por medio); aquí se agrega la
-- validación AUTORITATIVA, ya con el lock adquirido.
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
    if actual < 0 then
      raise exception 'Stock insuficiente en esa ubicación: disponible %, solicitado % (dos movimientos concurrentes alcanzaron a pasar la validación inicial)',
        actual + new.cantidad, new.cantidad;
    end if;
  else
    actual := new.cantidad;
  end if;

  update public.material_stock_ubicacion
    set stock = actual, updated_at = now()
    where material_id = new.material_id and ubicacion_id is not distinct from loc;

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

-- ---------- 3) Compromiso de ventas: lock de materiales antes de comparar ----------
-- Antes: dos llamadas concurrentes a cambiar_estado_caso_venta (dos casos
-- de venta distintos del mismo material, confirmados casi al mismo
-- tiempo) podían ambas leer el mismo total comprometido "de antes" y
-- ambas pasar el chequeo de disponible — comprometiendo más de lo que
-- había. Se bloquean las filas de materiales involucradas (en orden por
-- id, para no generar deadlocks entre llamadas que toquen materiales
-- distintos en distinto orden) antes de comparar: la segunda llamada
-- concurrente espera a que la primera termine y ve su resultado real.
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

-- ---------- 4) Elegir ganadora: RPC atómico (antes era read-then-write vía PostgREST) ----------
-- Antes: lib/solicitudes.ts (resolverSolicitud) leía solicitudes_compra.estado
-- y luego actualizaba, todo desde Node vía PostgREST — que no soporta
-- "select ... for update". Si dos personas elegían DOS cotizaciones
-- distintas de la misma solicitud casi al mismo tiempo, ambas pasaban el
-- chequeo "sigue abierta" y ambas procedían: un caso terminaba con un
-- evento "Elegida como ganadora" Y otro "Cancelado automáticamente" —
-- contradictorio. Ahora todo pasa en un solo RPC con el lock adentro.
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
  select * into s from public.solicitudes_compra where id = p_solicitud for update;
  -- Silencioso si ya no está abierta o no existe — mismo criterio que
  -- antes: recibirCasoCompra llama esto siempre que hay solicitud_id, no
  -- solo cuando de verdad hace falta resolverla.
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
