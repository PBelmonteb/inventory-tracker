-- ============================================================
--  Flujo de autorización de casos de compra creados por un operario
--  + notificaciones push reales (además de la campana in-app).
--
--  "cotizando" NO se quita del enum (Postgres no permite borrar valores
--  de un enum sin recrear el tipo) — la app simplemente deja de
--  escribirlo; los casos viejos con ese estado se siguen tratando como
--  "Pendientes" en la UI.
-- ============================================================

-- ---------- Nuevos estados ----------
-- Cada ALTER TYPE ... ADD VALUE va solo (no se puede usar el valor
-- nuevo en la misma transacción en que se agrega).
alter type public.estado_caso_compra add value if not exists 'por_autorizar';
alter type public.estado_caso_compra add value if not exists 'rechazado';
alter type public.tipo_notificacion add value if not exists 'autorizacion';

-- ---------- Quién creó el caso + motivo de rechazo ----------
-- Snapshot igual que proveedor_nombre/responsable_nombre — null en
-- casos automáticos (reposición) o de correo entrante.
alter table public.casos_compra
  add column if not exists creado_por_id uuid references public.profiles (id) on delete set null,
  add column if not exists creado_por_nombre text,
  add column if not exists motivo_rechazo text;

-- ---------- Suscripciones de notificaciones push (Web Push) ----------
create table public.push_subscripciones (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth_key    text not null,
  created_at  timestamptz not null default now()
);

create index push_subscripciones_usuario_idx on public.push_subscripciones (usuario_id);

alter table public.push_subscripciones enable row level security;

-- Cada quien ve/crea/borra solo su propia suscripción. El envío del push
-- (lib/push.ts) usa el cliente service_role para leer la suscripción de
-- OTRO usuario (quien recibe la notificación) — ahí el RLS no aplica,
-- por eso no hace falta una policy de lectura para gestores.
create policy "push_subscripciones_select_own" on public.push_subscripciones
  for select using (usuario_id = auth.uid());
create policy "push_subscripciones_insert_own" on public.push_subscripciones
  for insert with check (usuario_id = auth.uid());
create policy "push_subscripciones_delete_own" on public.push_subscripciones
  for delete using (usuario_id = auth.uid());
