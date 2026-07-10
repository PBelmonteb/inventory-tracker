-- ============================================================
--  stock_minimo = 0 significa "todavía sin configurar" (el valor por
--  defecto al crear un material), no "el mínimo real es cero". Antes,
--  un material recién dado de alta con stock=0 y mínimo=0 se marcaba
--  "Bajo" y generaba una alerta de inmediato — ruidoso para altas nuevas.
--  Ahora sincronizar_notificaciones() ignora esos materiales por completo.
-- ============================================================

create or replace function public.sincronizar_notificaciones()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
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
