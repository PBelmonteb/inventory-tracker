-- ============================================================
--  BOM / producción: "1 ventana = X perfil + Y herrajes + Z silicón".
--  Un producto terminado es un material más (hereda stock, WAC, alertas,
--  multi-ubicación, historial de precios gratis) que además tiene una
--  receta (bom_items). Producir consume los componentes y genera el
--  producto, reutilizando los triggers que YA validan sobreventa y
--  calculan WAC — no se duplica esa lógica.
--
--  V1 a propósito: receta a UN nivel (sin sub-ensambles anidados). Si un
--  componente es a su vez producible, se produce aparte primero.
-- ============================================================

create table public.bom_items (
  id                 uuid primary key default gen_random_uuid(),
  producto_id        uuid not null references public.materiales (id) on delete cascade,
  componente_id      uuid not null references public.materiales (id) on delete restrict,
  cantidad_por_unidad numeric(14, 4) not null check (cantidad_por_unidad > 0),
  created_at         timestamptz not null default now(),
  constraint bom_items_no_autoconsumo check (producto_id <> componente_id),
  constraint bom_items_unico unique (producto_id, componente_id)
);

create index bom_items_producto_idx on public.bom_items (producto_id);

alter table public.bom_items enable row level security;
create policy "bom_items_lectura" on public.bom_items
  for select using (auth.role() = 'authenticated');
create policy "bom_items_insert" on public.bom_items
  for insert with check (public.es_gestor());
create policy "bom_items_update" on public.bom_items
  for update using (public.es_gestor());
create policy "bom_items_delete" on public.bom_items
  for delete using (public.es_gestor());

-- ---------- Producir: consume componentes, genera el producto ----------
-- Transaccional por naturaleza de la función: si CUALQUIER salida de
-- componente no alcanza (trg_validar_movimiento la rechaza), la excepción
-- aborta toda la función y Postgres deshace todo (incluidas las salidas ya
-- insertadas en este mismo llamado) — no hace falta re-implementar el
-- chequeo de disponibilidad aquí.
create function public.producir(
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
