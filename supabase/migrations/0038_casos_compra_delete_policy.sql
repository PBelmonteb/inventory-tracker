-- ============================================================
--  eliminarCasoCompra (lib/actions/autorizacion.ts) ya tiene el gate de
--  rol correcto (requireGestorOCompras) pero al verificar en vivo el
--  borrado real fallaba en silencio para CUALQUIER rol, incluido gestor:
--  casos_compra nunca tuvo policy de DELETE (solo insert/lectura/update,
--  ver 0003_portales.sql) — con RLS activo y sin policy, Postgres niega
--  el delete por default, y el cliente de Supabase regresa
--  {error: null, data: []} en vez de un error, así que la app pensaba
--  que había funcionado sin que se borrara nada.
-- ============================================================

create policy "casos_compra_delete" on public.casos_compra
  for delete using (public.es_gestor_o_compras());
