-- ============================================================
--  Nivel de aviso configurable por material + notificaciones
--  de "por agotarse" (zona amarilla antes del mínimo).
--  Cada material define su umbral en unidades o en porcentaje.
-- ============================================================

-- ---------- Material: umbral de aviso ----------
-- aviso_valor: cuánto antes del mínimo empieza a avisar.
-- aviso_modo:  'unidad'      -> avisa desde (mínimo + aviso_valor) en la unidad del material
--              'porcentaje'  -> avisa desde (mínimo * (1 + aviso_valor/100))
alter table public.materiales
  add column if not exists aviso_valor numeric(14, 3) not null default 20,
  add column if not exists aviso_modo  text not null default 'porcentaje'
    check (aviso_modo in ('unidad', 'porcentaje'));

-- ---------- Notificaciones: nivel de severidad ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'nivel_notificacion') then
    create type public.nivel_notificacion as enum ('aviso', 'bajo');
  end if;
end $$;

alter table public.notificaciones
  add column if not exists nivel public.nivel_notificacion not null default 'bajo';

-- ---------- Punto de aviso (stock a partir del cual avisa) ----------
create or replace function public.punto_aviso(m public.materiales)
returns numeric
language sql
immutable
as $$
  select case
    when m.aviso_modo = 'unidad' then m.stock_minimo + m.aviso_valor
    else m.stock_minimo * (1 + m.aviso_valor / 100)
  end;
$$;

-- ---------- Sincronización con dos niveles ----------
-- 1) Auto-resuelve cuando el stock sube por encima del punto de aviso.
-- 2) Ajusta el nivel (aviso<->bajo) de las alertas vivas si cambió.
-- 3) Genera alerta nueva para material en zona de aviso o bajo, sin
--    alerta viva ni caso de compra abierto.
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
      and (not m.activo or m.stock_actual > public.punto_aviso(m));

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
