-- ============================================================
--  editarCasoVentaRechazado (lib/actions/autorizacion-ventas.ts) reemplaza
--  los items de un caso rechazado con delete-then-insert al reenviarlo.
--  Encontrado al verificar en vivo: el delete fallaba en silencio para
--  CUALQUIER rol — casos_venta_items nunca tuvo policy de DELETE (solo
--  insert/lectura/update en el loop de 0003_portales.sql), así que con
--  RLS activo y sin policy, Postgres niega el delete por default y el
--  cliente de Supabase regresa {error: null, data: []} en vez de un
--  error. Resultado real observado: el material quedaba DUPLICADO (el
--  viejo nunca se borraba, el nuevo se sumaba encima). Mismo patrón
--  exacto que 0038_casos_compra_delete_policy.sql y
--  0043_autorizacion_casos_venta.sql (casos_venta_delete) ya corrigieron
--  en tablas hermanas — aquí falta la misma policy en casos_venta_items.
-- ============================================================

create policy "casos_venta_items_delete" on public.casos_venta_items
  for delete using (auth.role() = 'authenticated');
