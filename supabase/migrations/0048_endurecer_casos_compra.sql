-- ============================================================
--  Continúa 0047: cierra el caso más grave de la misma familia de hueco
--  de RLS, casos_compra -- el que se dejó pendiente porque el envío
--  automático por convenio complicaba congelar "estado" sin romper la
--  reposición automática.
--
--  Se resolvió la ambigüedad del lado de la aplicación primero
--  (revisarReposicionAutomatica / el botón "Revisar reposición ahora" ya
--  no son accesibles para un operario -- puede terminar mandando una
--  orden real por convenio, es una decisión de compras). Con eso, toda
--  escritura de sesión que mueve un caso a "ordenado" viene, sin
--  excepción, de un usuario compras/gestor -- o de auth.role() =
--  'service_role' (el cron de reposición automática).
-- ============================================================

-- Sin esto, cualquier autenticado (un operario, por ejemplo) podía hacer
--   supabase.from('casos_compra').update({estado:'ordenado', monto_confirmado:true}).eq('id', X)
-- y autorizarse su propia compra, sin pasar por autorizarCasoCompra() ni
-- por el umbral de autorización -- el control completo que
-- 0025_autorizacion_casos_compra.sql construyó.
--
-- Alcance deliberadamente angosto: solo se congelan las DOS columnas que
-- de verdad comprometen dinero (estado -> 'ordenado', monto_confirmado ->
-- true). El resto de las transiciones (pendiente -> por_autorizar vía
-- enviarCasoAAutorizacion, rechazado -> por_autorizar vía
-- editarCasoRechazado) siguen abiertas a cualquier autenticado a
-- propósito -- son pasos de "pedir revisión", no de comprometer dinero, y
-- ya son accesibles al operario por diseño.
create or replace function public.proteger_transiciones_caso_compra()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.es_gestor_o_compras() then
    return new;
  end if;

  if new.estado is distinct from old.estado and new.estado = 'ordenado' then
    raise exception 'No autorizado para marcar este caso como ordenado';
  end if;
  if new.monto_confirmado is distinct from old.monto_confirmado and new.monto_confirmado then
    raise exception 'No autorizado para confirmar el monto de este caso';
  end if;
  return new;
end;
$$;

drop trigger if exists casos_compra_proteger_transiciones on public.casos_compra;
create trigger casos_compra_proteger_transiciones
  before update on public.casos_compra
  for each row execute function public.proteger_transiciones_caso_compra();
