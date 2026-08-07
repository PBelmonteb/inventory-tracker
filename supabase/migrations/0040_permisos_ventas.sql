-- ============================================================
--  Permisos del rol "ventas" (ver 0039 para el valor de enum).
--
--  El resto del gateo de ventas (crear/cambiar estado de casos_venta,
--  confirmar/cancelar salidas pendientes) vive en código de aplicación
--  (requireGestorOVentas() en lib/actions/ventas.ts) porque esas tablas
--  ya tienen RLS abierta (auth.role() = 'authenticated') — no hace falta
--  tocar RLS ahí. clientes sí está gateado a nivel RLS con es_gestor(),
--  así que ese sí necesita esta migración (mismo criterio que
--  0037_permisos_compras.sql con proveedores/convenios_proveedor).
-- ============================================================

-- Helper: admin, gerente o ventas (mismo molde que es_gestor_o_compras()).
create function public.es_gestor_o_ventas()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.mi_rol() in ('admin', 'gerente', 'ventas');
$$;

-- ---------- clientes ----------
drop policy "clientes_insert" on public.clientes;
drop policy "clientes_update" on public.clientes;
drop policy "clientes_delete" on public.clientes;

create policy "clientes_insert" on public.clientes
  for insert with check (public.es_gestor_o_ventas());
create policy "clientes_update" on public.clientes
  for update using (public.es_gestor_o_ventas());
create policy "clientes_delete" on public.clientes
  for delete using (public.es_gestor_o_ventas());
