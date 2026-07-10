-- ============================================================
--  Confirmación parcial de salidas pendientes: antes era todo-o-nada
--  (confirmar la cantidad completa o cancelar). Ahora se puede confirmar
--  una cantidad menor a la pendiente; el resto sigue como "pendiente"
--  para confirmarse después, en vez de quedar atascado si no se puede
--  cumplir de una sola vez.
-- ============================================================

-- Reemplaza la función de un solo parámetro por una con p_cantidad
-- opcional (default null = confirmar todo, como antes). Postgres trata un
-- parámetro nuevo como un overload distinto, así que se elimina la versión
-- vieja explícitamente para no dejar dos funciones coexistiendo.
drop function if exists public.confirmar_salida_pendiente(uuid);

create function public.confirmar_salida_pendiente(p_id uuid, p_cantidad numeric default null)
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
    -- Entrega parcial: se resta lo confirmado y sigue pendiente por el resto.
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
