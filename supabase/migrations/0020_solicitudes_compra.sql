-- ============================================================
--  Solicitudes de compra: agrupan varias cotizaciones (una por
--  proveedor) de la misma necesidad para poder compararlas y
--  elegir una ganadora — las demás se cancelan solas. Cada
--  cotización (casos_compra) ya tenía su propio código
--  (referencia, tipo OC-123456); ahora también viaja en el
--  asunto del correo para que las respuestas se liguen solas
--  (ver app/api/email-caso/route.ts).
--
--  Timeline por caso ("qué ha pasado", estilo Salesforce):
--  casos_compra_eventos, uno por caso (no por solicitud) — cada
--  cotización tiene su propio hilo de correo/timeline; elegir
--  ganadora o cancelar hermanas se registra en CADA caso
--  afectado, no en un stream aparte.
-- ============================================================

create type public.estado_solicitud_compra as enum ('abierta', 'resuelta', 'cancelada');
create type public.tipo_evento_caso as enum (
  'creado', 'correo_enviado', 'correo_recibido', 'estado_cambiado',
  'responsable_asignado', 'nota'
);

create table public.solicitudes_compra (
  id                     uuid primary key default gen_random_uuid(),
  codigo                 text not null unique,
  material_id            uuid references public.materiales (id) on delete set null,
  -- Snapshot (historial autónomo, mismo criterio que proveedor_nombre en casos_compra).
  material_nombre        text,
  titulo                 text not null,
  estado                 public.estado_solicitud_compra not null default 'abierta',
  responsable_id         uuid references public.profiles (id) on delete set null,
  responsable_nombre     text,
  cotizacion_ganadora_id uuid references public.casos_compra (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index solicitudes_compra_material_idx on public.solicitudes_compra (material_id);

alter table public.casos_compra
  add column solicitud_id uuid references public.solicitudes_compra (id) on delete set null;
create index casos_compra_solicitud_idx on public.casos_compra (solicitud_id);

create table public.casos_compra_eventos (
  id             uuid primary key default gen_random_uuid(),
  caso_compra_id uuid not null references public.casos_compra (id) on delete cascade,
  tipo           public.tipo_evento_caso not null,
  detalle        text,
  usuario_id     uuid references public.profiles (id) on delete set null,
  usuario_nombre text,
  created_at     timestamptz not null default now()
);
create index casos_compra_eventos_caso_idx on public.casos_compra_eventos (caso_compra_id, created_at);

-- ---------- RLS ----------
-- Tablas operativas (no catálogo): cualquier autenticado lee/inserta/
-- actualiza — mismo patrón que casos_compra/notificaciones (0003_portales.sql).
alter table public.solicitudes_compra    enable row level security;
alter table public.casos_compra_eventos  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['solicitudes_compra', 'casos_compra_eventos'] loop
    execute format($f$
      create policy "%1$s_lectura" on public.%1$s
        for select using (auth.role() = 'authenticated');
      create policy "%1$s_insert" on public.%1$s
        for insert with check (auth.role() = 'authenticated');
      create policy "%1$s_update" on public.%1$s
        for update using (auth.role() = 'authenticated');
    $f$, t);
  end loop;
end $$;
