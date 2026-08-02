-- ============================================================
--  Monto sin confirmar: cuando el sistema le pone un monto a un caso
--  de compra solo (regex sobre un correo, ver lib/email-caso.ts), se
--  marca monto_confirmado = false para que el gestor lo revise antes
--  de usarlo para elegir ganadora entre cotizaciones. Un monto escrito
--  por una persona, o prellenado de un convenio pactado, se considera
--  confirmado de entrada.
-- ============================================================

alter table public.casos_compra
  add column if not exists monto_confirmado boolean not null default true;
