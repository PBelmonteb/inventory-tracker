-- ============================================================
--  Flujo de autorización de casos de venta creados por un operario —
--  mismo patrón que 0025_autorizacion_casos_compra.sql del lado de
--  compras, pero SIN umbral por monto (decisión explícita: toda
--  cotización creada por operario necesita autorización, sin importar el
--  monto — cualquier gestor o ventas la puede autorizar) y sin correo
--  saliente (autorizar una cotización de venta no dispara una orden a
--  nadie, solo notifica al creador).
--
--  tipo_notificacion ya tiene 'autorizacion' (agregado en 0025, es
--  compartido) y notificaciones.caso_venta_id ya existe — nada que tocar
--  ahí.
-- ============================================================

-- ---------- Nuevos estados ----------
-- Cada ALTER TYPE ... ADD VALUE va solo (no se puede usar el valor nuevo
-- en la misma transacción en que se agrega).
alter type public.estado_caso_venta add value if not exists 'por_autorizar';
alter type public.estado_caso_venta add value if not exists 'rechazado';

-- ---------- Quién creó el caso + motivo de rechazo ----------
-- Snapshot igual que cliente_nombre — null en casos creados por gestor/ventas.
alter table public.casos_venta
  add column if not exists creado_por_id uuid references public.profiles (id) on delete set null,
  add column if not exists creado_por_nombre text,
  add column if not exists motivo_rechazo text;

-- ---------- Policy de DELETE faltante ----------
-- casos_venta nunca tuvo policy de DELETE (solo insert/lectura/update en
-- 0003_portales.sql) — mismo hueco que 0038_casos_compra_delete_policy.sql
-- ya documentó y corrigió del lado de compras: sin policy, Postgres niega
-- el delete por default y el cliente de Supabase regresa {error: null,
-- data: []} en vez de un error, así que la app pensaría que borró algo
-- sin que pasara nada. Se agrega de una vez para que eliminarCasoVenta
-- (solo casos rechazados) funcione de verdad.
create policy "casos_venta_delete" on public.casos_venta
  for delete using (public.es_gestor_o_ventas());
