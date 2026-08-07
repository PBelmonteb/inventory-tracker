-- ============================================================
--  Nuevo rol "ventas" (junto a admin/gerente/operario/compras) — autoridad
--  real sobre el Portal de Clientes (casos de venta, salidas pendientes,
--  catálogo de clientes). Sola en su propia migración: Postgres no permite
--  usar un valor de enum recién agregado en la misma transacción en que se
--  agrega (mismo patrón que 0018, 0025 y 0036).
-- ============================================================

alter type public.rol_usuario add value if not exists 'ventas';
