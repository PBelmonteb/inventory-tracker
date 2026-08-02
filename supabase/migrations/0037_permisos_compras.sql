-- ============================================================
--  Permisos del rol "compras" (ver 0036 para el valor de enum).
--
--  El resto del gateo de compras (autorizar/rechazar casos_compra,
--  elegir cotización ganadora) vive en código de aplicación
--  (requireGestor()/esGestor(yo) en lib/actions/*.ts) porque esas tablas
--  ya tienen RLS abierta (auth.role() = 'authenticated') — no hace falta
--  tocar RLS ahí. proveedores y convenios_proveedor sí están gateados a
--  nivel RLS con es_gestor(), así que esos dos sí necesitan esta migración.
-- ============================================================

-- Helper: admin, gerente o compras (mismo molde que es_gestor()).
create function public.es_gestor_o_compras()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.mi_rol() in ('admin', 'gerente', 'compras');
$$;

-- ---------- proveedores ----------
-- Solo se tocan insert/update/delete (generadas junto con categorias y
-- ubicaciones en el loop de 0002_rls.sql, con es_gestor()). Categorías y
-- ubicaciones quedan intactas — compras no las toca.
drop policy "proveedores_insert" on public.proveedores;
drop policy "proveedores_update" on public.proveedores;
drop policy "proveedores_delete" on public.proveedores;

create policy "proveedores_insert" on public.proveedores
  for insert with check (public.es_gestor_o_compras());
create policy "proveedores_update" on public.proveedores
  for update using (public.es_gestor_o_compras());
create policy "proveedores_delete" on public.proveedores
  for delete using (public.es_gestor_o_compras());

-- ---------- convenios_proveedor ----------
drop policy "convenios_proveedor_insert" on public.convenios_proveedor;
drop policy "convenios_proveedor_update" on public.convenios_proveedor;
drop policy "convenios_proveedor_delete" on public.convenios_proveedor;

create policy "convenios_proveedor_insert" on public.convenios_proveedor
  for insert with check (public.es_gestor_o_compras());
create policy "convenios_proveedor_update" on public.convenios_proveedor
  for update using (public.es_gestor_o_compras());
create policy "convenios_proveedor_delete" on public.convenios_proveedor
  for delete using (public.es_gestor_o_compras());
