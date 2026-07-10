-- ============================================================
--  Limpieza: la migración 0011 reemplazó recibir_caso_compra con una
--  versión de 4 parámetros (p_ubicacion) pero nunca borró la versión
--  vieja de 3 -- "create or replace" con una firma distinta crea un
--  OVERLOAD nuevo, no reemplaza el viejo (mismo problema que ya se
--  corrigió para confirmar_salida_pendiente en la migración 0014, que sí
--  hizo el "drop function" explícito).
--
--  Con las dos versiones vivas, PostgREST no puede resolver una llamada
--  que no incluya p_ubicacion explícito: "Could not choose the best
--  candidate function". La app (lib/actions/compras.ts) siempre manda los
--  4 parámetros, así que nunca lo sufrió — pero es un overload muerto que
--  revienta cualquier llamada futura con solo 3. Encontrado escribiendo
--  tests/integration/recibir-caso-compra.test.ts.
-- ============================================================

drop function if exists public.recibir_caso_compra(uuid, numeric, numeric);
