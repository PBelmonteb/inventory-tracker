-- ============================================================
--  Bloqueo de sobreventa: al comprometer un caso de venta
--  (confirmado / en_produccion / entregado) se valida que haya
--  DISPONIBLE (stock físico − comprometido por otros casos y
--  salidas pendientes). Si no alcanza, se rechaza.
-- ============================================================

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
