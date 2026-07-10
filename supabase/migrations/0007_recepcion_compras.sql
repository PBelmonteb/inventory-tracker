-- ============================================================
--  Recepción de compras: al marcar un caso "recibido" se genera
--  la entrada de stock (con costo → alimenta el WAC) y se enlaza.
-- ============================================================

alter table public.casos_compra
  add column if not exists movimiento_id uuid
    references public.movimientos (id) on delete set null;

-- Recibe un caso: crea la entrada de stock y marca el caso como recibido.
-- Transaccional; idempotente (no re-recibe si ya tiene movimiento).
create or replace function public.recibir_caso_compra(
  p_caso uuid,
  p_cantidad numeric,
  p_costo numeric
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  c public.casos_compra%rowtype;
  mov_id uuid;
begin
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
    (material_id, tipo, cantidad, usuario_id, nota, referencia, costo_unitario)
  values
    (c.material_id, 'entrada', p_cantidad, auth.uid(),
     'Recepción: ' || coalesce(c.titulo, 'compra'), c.referencia,
     nullif(p_costo, 0))
  returning id into mov_id;

  update public.casos_compra
    set estado = 'recibido', movimiento_id = mov_id, updated_at = now()
    where id = p_caso;
end;
$$;
