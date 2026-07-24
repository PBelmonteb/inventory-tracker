-- Cantidad estimada de una orden de compra (para poder mostrar "stock por
-- llegar" en Inventario). Antes casos_compra solo guardaba un monto en
-- pesos (monto_estimado) — nunca una cantidad en unidades, así que no
-- había forma de saber cuánto va a entrar de stock hasta que se recibe.
-- Nullable, sin backfill: casos viejos o creados sin este dato simplemente
-- no cuentan para "por llegar" (mismo criterio que el resto de la app:
-- nunca se inventa un número).
alter table public.casos_compra
  add column if not exists cantidad_estimada numeric;
