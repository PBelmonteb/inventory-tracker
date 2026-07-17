-- ============================================================
--  Reposición automática: el sistema crea el caso de compra en
--  cuanto el stock cruza el punto de reorden (calculado, o el
--  mínimo simple si aún no hay historial suficiente), sin
--  depender de que alguien tenga la app abierta.
--
--  El disparo real vive fuera de SQL (ver
--  app/api/generar-casos-automaticos/route.ts + lib/actions/
--  casos-automaticos.ts): reutiliza las fórmulas de
--  lib/stock-sugerido.ts y lib/eoq.ts tal cual existen, en vez de
--  reimplementarlas en PL/pgSQL. Esta migración solo agrega las
--  columnas que ese código necesita para persistir su decisión.
-- ============================================================

-- ---------- Proveedor: tiempo de entrega declarado ----------
-- Respaldo cuando aún no hay >=2 compras recibidas de un material
-- para inferir el lead time real (ver MIN_COMPRAS_PARA_LEAD_TIME
-- en lib/stock-sugerido.ts). Si ambos existen, el inferido gana
-- por ser más preciso.
alter table public.proveedores
  add column if not exists dias_entrega_declarado numeric(6, 1)
    check (dias_entrega_declarado is null or dias_entrega_declarado > 0);

-- ---------- Caso de compra: snapshot de riesgo ----------
-- Solo se llenan cuando el caso lo crea la automatización (origen
-- 'stock_bajo' generado por el cron); quedan null en casos
-- manuales o por correo. Existen para que el caso sea explicable
-- ("¿por qué se creó esto solo?"), no una caja negra.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'nivel_riesgo_stock') then
    create type public.nivel_riesgo_stock as enum ('medio', 'alto', 'critico');
  end if;
end $$;

alter table public.casos_compra
  add column if not exists nivel_riesgo public.nivel_riesgo_stock,
  add column if not exists dias_cobertura_restante numeric(10, 2),
  add column if not exists lead_time_dias_usado numeric(10, 2);

-- ============================================================
--  Paso manual (una sola vez, después de este deploy): habilitar
--  pg_cron y pg_net desde el Dashboard de Supabase
--  (Database > Extensions) y luego correr en el SQL Editor:
--
--  select cron.schedule(
--    'generar-casos-automaticos',
--    '0 */6 * * *',  -- cada 6 horas; ajustar según necesidad
--    $$
--    select net.http_post(
--      url := 'https://<tu-dominio>/api/generar-casos-automaticos',
--      headers := jsonb_build_object(
--        'content-type', 'application/json',
--        'x-webhook-secret', '<mismo valor que AUTO_CASOS_SECRET>'
--      ),
--      body := '{}'::jsonb
--    );
--    $$
--  );
--
--  No se incluye aquí porque el dominio y el secreto son de
--  entorno, no deben quedar versionados en SQL.
-- ============================================================
