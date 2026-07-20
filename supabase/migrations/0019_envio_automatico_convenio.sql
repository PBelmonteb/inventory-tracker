-- ============================================================
--  Envío automático de orden de compra cuando hay convenio (opt-in).
--
--  Si un convenio tiene auto_enviar = true, la reposición automática
--  (migración 0017 + lib/casos-automaticos.ts) manda el correo de
--  confirmación de orden solo, sin esperar a que un humano lo redacte —
--  tiene sentido porque con un convenio vigente el precio/cantidad/
--  condiciones ya están pactados, no hay nada que negociar.
--
--  correo_enviado_at queda null salvo que el envío real haya tenido
--  éxito (nunca se finge un envío que no ocurrió — ver lib/email.ts).
-- ============================================================

alter table public.convenios_proveedor
  add column auto_enviar boolean not null default false;

alter table public.casos_compra
  add column correo_enviado_at timestamptz;
