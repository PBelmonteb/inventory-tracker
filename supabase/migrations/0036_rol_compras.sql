-- ============================================================
--  Rol "compras": tercer nivel de rol (junto a admin/gerente/operario)
--  para quien autoriza/rechaza casos de compra, gestiona proveedores y
--  convenios, y elige cotización ganadora — sin acceso a materiales,
--  usuarios, costos/WAC ni el resto de lo que ve un gestor.
--
--  Esta sentencia va sola: Postgres no permite usar un valor de enum
--  recién agregado dentro de la misma transacción en que se agrega
--  (mismo patrón ya usado en 0018 y 0025). El helper que sí usa este
--  valor ('compras') y los cambios de RLS van en 0037, por separado.
-- ============================================================

alter type public.rol_usuario add value if not exists 'compras';
