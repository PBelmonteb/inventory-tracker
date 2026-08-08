-- ============================================================
--  Precio por línea en cotizaciones de venta — hoy casos_venta_items
--  solo tiene material+cantidad; el monto vive como un total suelto en
--  casos_venta, sin relación explícita con lo que se cotizó por
--  material. Esto también cerraba el hueco de que convenios_cliente
--  (precio_pactado) nunca se usaba para prellenar nada del lado de
--  ventas (el proveedor sí lo hace, ver lib/casos-automaticos.ts).
--
--  casos_venta.monto deja de capturarse a mano: un trigger lo recalcula
--  siempre como Σ(precio_unitario × cantidad) cada vez que cambian los
--  items del caso — mismo patrón que gestionar_salidas_caso_venta
--  (0003_portales.sql), un solo lugar de verdad en vez de que cada
--  acción (crear/editar/autorizar) tenga que recordar mantenerlo
--  sincronizado a mano.
--
--  Sin backfill a propósito: ADD COLUMN ... DEFAULT no dispara el
--  trigger sobre filas existentes — los casos viejos conservan su monto
--  histórico intacto hasta que alguien vuelva a tocar sus items (mismo
--  criterio que 0025 dejando creado_por_id null en casos_compra viejos).
-- ============================================================

alter table public.casos_venta_items
  add column if not exists precio_unitario numeric(14, 2) not null default 0;

create or replace function public.recalcular_monto_caso_venta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caso_id uuid := coalesce(new.caso_venta_id, old.caso_venta_id);
begin
  update public.casos_venta
  set monto = coalesce(
        (select sum(cantidad * precio_unitario)
         from public.casos_venta_items
         where caso_venta_id = v_caso_id),
        0
      ),
      updated_at = now()
  where id = v_caso_id;
  return null;
end;
$$;

-- Nota: este trigger solo toca monto/updated_at, nunca estado — no
-- interfiere con trg_gestionar_salidas_caso_venta (0003_portales.sql),
-- que es "after update OF estado" y solo dispara cuando estado mismo
-- forma parte del UPDATE.
drop trigger if exists casos_venta_items_recalcular_monto on public.casos_venta_items;
create trigger casos_venta_items_recalcular_monto
after insert or update or delete on public.casos_venta_items
for each row execute function public.recalcular_monto_caso_venta();
