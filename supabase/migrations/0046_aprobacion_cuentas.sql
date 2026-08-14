-- ============================================================
--  Filtro de aceptación de cuentas — se reabre el auto-registro público,
--  pero nadie entra a la app hasta que un gestor apruebe la cuenta.
-- ============================================================

alter table public.profiles
  add column estado_cuenta text not null default 'pendiente'
  check (estado_cuenta in ('pendiente', 'aprobada', 'rechazada'));

-- Todo lo que ya existe (piloto, COVALSA si ya hay algo, tú) queda
-- aprobado de una vez -- nadie que ya tenía acceso se cae con este cambio.
update public.profiles set estado_cuenta = 'aprobada';

-- Nuevo tipo de notificación: avisa a los gestores que hay una cuenta
-- esperando su revisión (mismo mecanismo que ya usan stock/asignación/
-- autorización — campana + toast + push, ver lib/actions/registro.ts).
alter type public.tipo_notificacion add value if not exists 'cuenta_pendiente';

-- ------------------------------------------------------------
--  Hueco de seguridad real, encontrado al escribir esto (no introducido
--  por esta migración, ya existía): la policy "perfil_propio_update"
--  ("for update using (id = auth.uid())") deja que CUALQUIER usuario
--  autenticado actualice CUALQUIER columna de su propia fila en profiles
--  -- incluyendo "rol". Cualquier operario podía, desde la consola del
--  navegador, correr
--    supabase.from('profiles').update({ rol: 'admin' }).eq('id', miId)
--  y auto-promoverse a admin. Con esta migración eso además hubiera
--  dejado que cualquiera se auto-apruebe la cuenta (estado_cuenta), lo que
--  volvería inútil todo el filtro de aceptación.
--
--  El fix: un trigger que congela "rol" y "estado_cuenta" a su valor
--  anterior en cualquier UPDATE que NO venga del cliente service_role
--  (las Server Actions de /usuarios ya usan createAdminClient() para
--  tocar esas dos columnas — auth.role() da 'service_role' ahí). No se
--  toca la policy en sí: el candado real vive en el trigger, corre pase
--  lo que pase.
-- ------------------------------------------------------------
create or replace function public.proteger_columnas_sensibles_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  new.rol := old.rol;
  new.estado_cuenta := old.estado_cuenta;
  return new;
end;
$$;

drop trigger if exists profiles_proteger_columnas_sensibles on public.profiles;
create trigger profiles_proteger_columnas_sensibles
  before update on public.profiles
  for each row execute function public.proteger_columnas_sensibles_profile();
