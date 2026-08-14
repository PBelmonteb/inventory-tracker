-- ============================================================
--  Continúa 0047/0048/0049: los dos que quedaban de la lista, más
--  angostos que los anteriores.
-- ============================================================

-- ---------- salidas_pendientes ----------
-- confirmarSalidaPendiente y cancelarSalidaPendiente (lib/actions/ventas.ts)
-- actualizan esta tabla directo por sesión normal, ambas gestor/ventas-only
-- en JS (puedeGestionarVentas). Sin este trigger, cualquier autenticado
-- podía marcar una entrega pendiente como 'registrada' (sin que el RPC
-- confirmar_salida_pendiente generara el movimiento de salida real -- el
-- inventario quedaría "entregado" en la app sin haber salido nunca) o
-- como 'cancelada', sin pasar por el candado de ventas.
create or replace function public.proteger_transiciones_salida_pendiente()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.es_gestor_o_ventas() then
    return new;
  end if;
  if new.estado is distinct from old.estado and new.estado in ('registrada', 'cancelada') then
    raise exception 'No autorizado para cambiar el estado de esta salida pendiente';
  end if;
  return new;
end;
$$;

drop trigger if exists salidas_pendientes_proteger_transiciones on public.salidas_pendientes;
create trigger salidas_pendientes_proteger_transiciones
  before update on public.salidas_pendientes
  for each row execute function public.proteger_transiciones_salida_pendiente();

-- ---------- solicitudes_compra ----------
-- A diferencia de las demás, aquí no hace falta un trigger: ningún código
-- de la app actualiza esta tabla por sesión normal -- el único lugar que
-- la actualiza es el RPC resolver_solicitud_compra (ya protegido en 0049),
-- y una función security definer no necesita que la policy de UPDATE la
-- deje pasar (corre con los privilegios del dueño de la función, no del
-- llamador). Se quita la policy por completo -- mismo criterio que ya se
-- usó en 0047 para casos_compra_eventos.
drop policy if exists "solicitudes_compra_update" on public.solicitudes_compra;
