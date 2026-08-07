-- ============================================================
--  Devoluciones de venta — reversa parcial o total de un caso_venta ya
--  entregado. Ningún flujo de reversión existía para un caso "entregado";
--  el único precedente real es cancelar_traslado (0027/0028), que inserta
--  una "entrada" compensatoria SIN costo_unitario (para no tocar WAC) en
--  vez de mutar/borrar el movimiento original. Se sigue el mismo patrón.
--
--  No se agrega ningún valor nuevo a estado_caso_venta — el caso se queda
--  en "entregado"; la devolución se ve en esta tabla + en el timeline
--  (casos_venta_eventos). Esto evita la migración de enum y la revisión de
--  cambiar_estado_caso_venta/gestionar_salidas_caso_venta que hubiera hecho
--  falta con un estado nuevo.
-- ============================================================

create table public.devoluciones_venta (
  id                uuid primary key default gen_random_uuid(),
  caso_venta_id     uuid not null references public.casos_venta(id) on delete cascade,
  material_id       uuid references public.materiales(id),
  material_nombre   text,      -- snapshot, por si se borra el material
  cantidad          numeric(14,3) not null check (cantidad > 0),
  motivo            text,
  movimiento_id     uuid references public.movimientos(id),
  creado_por_id     uuid references public.profiles(id),
  creado_por_nombre text,
  created_at        timestamptz not null default now()
);

alter table public.devoluciones_venta enable row level security;

-- Solo lectura abierta a authenticated. SIN policy de insert/update/delete
-- (mismo criterio que emails_procesados) — la única vía de escritura es la
-- RPC de abajo (security definer, bypassa RLS).
create policy "devoluciones_venta_lectura" on public.devoluciones_venta
  for select using (auth.role() = 'authenticated');

create function public.registrar_devolucion_venta(
  p_caso uuid, p_material uuid, p_cantidad numeric, p_motivo text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cv public.casos_venta%rowtype;
  m public.materiales%rowtype;
  total_entregado numeric;
  total_devuelto numeric;
  mov_id uuid;
  dev_id uuid;
begin
  if auth.role() <> 'authenticated' then raise exception 'No autorizado'; end if;
  if not public.es_gestor_o_ventas() then raise exception 'No autorizado'; end if;
  if p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;

  select * into cv from public.casos_venta where id = p_caso for update;
  if not found then raise exception 'Caso no encontrado'; end if;
  if cv.estado <> 'entregado' then
    raise exception 'Solo se pueden devolver casos entregados';
  end if;

  select * into m from public.materiales where id = p_material;

  select coalesce(sum(cantidad),0) into total_entregado from public.movimientos
    where tipo = 'salida' and material_id = p_material and referencia = cv.referencia;
  select coalesce(sum(cantidad),0) into total_devuelto from public.devoluciones_venta
    where caso_venta_id = p_caso and material_id = p_material;

  if p_cantidad > (total_entregado - total_devuelto) then
    raise exception 'No puede devolver más de lo entregado (disponible para devolver: %)',
      total_entregado - total_devuelto;
  end if;

  insert into public.movimientos (material_id, tipo, cantidad, usuario_id, nota, referencia)
  values (p_material, 'entrada', p_cantidad, auth.uid(),
          'Devolución: ' || coalesce(p_motivo, 'sin motivo'), cv.referencia)
  returning id into mov_id;

  insert into public.devoluciones_venta
    (caso_venta_id, material_id, material_nombre, cantidad, motivo, movimiento_id, creado_por_id)
  values (p_caso, p_material, m.nombre, p_cantidad, p_motivo, mov_id, auth.uid())
  returning id into dev_id;

  return dev_id;
end;
$$;
