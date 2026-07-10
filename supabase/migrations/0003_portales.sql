-- ============================================================
--  Portales de proveedores y clientes
--  Casos de compra con notificaciones automáticas de stock bajo;
--  casos de venta cuyas entregas generan salidas PENDIENTES que
--  se confirman manualmente (la confirmación crea el movimiento).
-- ============================================================

-- ---------- Enums ----------
create type public.estado_notificacion as enum ('abierta', 'atendida', 'descartada');
create type public.estado_caso_compra as enum ('pendiente', 'cotizando', 'ordenado', 'recibido', 'cancelado');
create type public.origen_caso_compra as enum ('manual', 'stock_bajo', 'correo');
create type public.estado_caso_venta as enum ('cotizacion', 'confirmado', 'en_produccion', 'entregado', 'cancelado');
create type public.estado_salida_pendiente as enum ('pendiente', 'registrada', 'cancelada');

-- ---------- Clientes ----------
create table public.clientes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  contacto    text,
  created_at  timestamptz not null default now()
);

-- ---------- Casos de compra ----------
create table public.casos_compra (
  id             uuid primary key default gen_random_uuid(),
  proveedor_id   uuid not null references public.proveedores (id) on delete cascade,
  material_id    uuid references public.materiales (id) on delete set null,
  titulo         text not null,
  descripcion    text,
  monto_estimado numeric(14, 2) not null default 0,
  referencia     text,
  estado         public.estado_caso_compra not null default 'pendiente',
  origen         public.origen_caso_compra not null default 'manual',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index casos_compra_proveedor_idx on public.casos_compra (proveedor_id);
create index casos_compra_material_idx on public.casos_compra (material_id, estado);

-- ---------- Notificaciones de stock bajo ----------
create table public.notificaciones (
  id              uuid primary key default gen_random_uuid(),
  material_id     uuid not null references public.materiales (id) on delete cascade,
  proveedor_id    uuid references public.proveedores (id) on delete set null,
  mensaje         text not null,
  estado          public.estado_notificacion not null default 'abierta',
  caso_compra_id  uuid references public.casos_compra (id) on delete set null,
  created_at      timestamptz not null default now(),
  resuelta_at     timestamptz
);

create index notificaciones_material_idx on public.notificaciones (material_id, estado);

-- ---------- Casos de venta ----------
create table public.casos_venta (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes (id) on delete cascade,
  titulo      text not null,
  descripcion text,
  monto       numeric(14, 2) not null default 0,
  referencia  text,
  estado      public.estado_caso_venta not null default 'cotizacion',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index casos_venta_cliente_idx on public.casos_venta (cliente_id);

create table public.casos_venta_items (
  id            uuid primary key default gen_random_uuid(),
  caso_venta_id uuid not null references public.casos_venta (id) on delete cascade,
  material_id   uuid not null references public.materiales (id) on delete cascade,
  cantidad      numeric(14, 3) not null check (cantidad > 0)
);

create index casos_venta_items_caso_idx on public.casos_venta_items (caso_venta_id);

-- ---------- Salidas pendientes ----------
create table public.salidas_pendientes (
  id            uuid primary key default gen_random_uuid(),
  caso_venta_id uuid not null references public.casos_venta (id) on delete cascade,
  material_id   uuid not null references public.materiales (id) on delete cascade,
  cantidad      numeric(14, 3) not null check (cantidad > 0),
  estado        public.estado_salida_pendiente not null default 'pendiente',
  movimiento_id uuid references public.movimientos (id) on delete set null,
  created_at    timestamptz not null default now(),
  resuelta_at   timestamptz
);

create index salidas_pendientes_estado_idx on public.salidas_pendientes (estado, created_at desc);

-- ---------- Emails procesados (idempotencia del webhook) ----------
-- El endpoint /api/email-caso registra el Message-ID de cada correo
-- convertido en caso; los reintentos del Email Worker no duplican casos.
-- Nota: el webhook debe usar el service role key (no hay sesión de usuario).
create table public.emails_procesados (
  mensaje_id  text primary key,
  created_at  timestamptz not null default now()
);

-- ---------- Sincronización de notificaciones ----------
-- Idempotente: se llama al cargar el portal de proveedores.
-- 1) Resuelve alertas de materiales recuperados (re-arma el ciclo).
-- 2) Genera alertas para materiales bajo mínimo sin alerta viva
--    ni caso de compra abierto.
create function public.sincronizar_notificaciones()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.notificaciones n
    set estado = 'atendida', resuelta_at = now()
    from public.materiales m
    where n.material_id = m.id
      and n.estado in ('abierta', 'descartada')
      and (not m.activo or m.stock_actual > m.stock_minimo);

  insert into public.notificaciones (material_id, proveedor_id, mensaje)
  select
    m.id,
    m.proveedor_id,
    format('Stock bajo: %s (%s/%s %s). Solicita cotización.',
           m.nombre, m.stock_actual, m.stock_minimo, m.unidad)
  from public.materiales m
  where m.activo
    and m.stock_actual <= m.stock_minimo
    and not exists (
      select 1 from public.notificaciones n
      where n.material_id = m.id and n.estado in ('abierta', 'descartada')
    )
    and not exists (
      select 1 from public.casos_compra c
      where c.material_id = m.id
        and c.estado in ('pendiente', 'cotizando', 'ordenado')
    );
end;
$$;

-- ---------- Confirmar salida pendiente (transaccional) ----------
-- Inserta el movimiento de salida (los triggers de 0001 validan stock
-- y lo aplican) y marca la pendiente como registrada.
create function public.confirmar_salida_pendiente(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  sp public.salidas_pendientes%rowtype;
  cv public.casos_venta%rowtype;
  mov_id uuid;
begin
  select * into sp from public.salidas_pendientes where id = p_id for update;
  if not found then
    raise exception 'Salida pendiente no encontrada';
  end if;
  if sp.estado <> 'pendiente' then
    raise exception 'Esta salida ya fue resuelta';
  end if;

  select * into cv from public.casos_venta where id = sp.caso_venta_id;

  insert into public.movimientos (material_id, tipo, cantidad, usuario_id, nota, referencia)
  values (
    sp.material_id,
    'salida',
    sp.cantidad,
    auth.uid(),
    'Entrega: ' || coalesce(cv.titulo, 'caso de venta'),
    cv.referencia
  )
  returning id into mov_id;

  update public.salidas_pendientes
    set estado = 'registrada', movimiento_id = mov_id, resuelta_at = now()
    where id = p_id;
end;
$$;

-- ---------- Trigger: entrega/cancelación de casos de venta ----------
-- Al pasar a 'entregado' crea las salidas pendientes desde los items
-- (solo si el caso nunca generó pendientes, evita duplicados).
-- Al pasar a 'cancelado' cancela sus pendientes sin resolver.
create function public.gestionar_salidas_caso_venta()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.estado = 'entregado' and old.estado is distinct from 'entregado' then
    if not exists (
      select 1 from public.salidas_pendientes where caso_venta_id = new.id
    ) then
      insert into public.salidas_pendientes (caso_venta_id, material_id, cantidad)
      select i.caso_venta_id, i.material_id, i.cantidad
      from public.casos_venta_items i
      where i.caso_venta_id = new.id;
    end if;
  elsif new.estado = 'cancelado' and old.estado is distinct from 'cancelado' then
    update public.salidas_pendientes
      set estado = 'cancelada', resuelta_at = now()
      where caso_venta_id = new.id and estado = 'pendiente';
  end if;
  return new;
end;
$$;

create trigger trg_gestionar_salidas_caso_venta
  after update of estado on public.casos_venta
  for each row execute function public.gestionar_salidas_caso_venta();

-- ---------- Row Level Security ----------
alter table public.clientes            enable row level security;
alter table public.casos_compra        enable row level security;
alter table public.notificaciones      enable row level security;
alter table public.casos_venta         enable row level security;
alter table public.casos_venta_items   enable row level security;
alter table public.salidas_pendientes  enable row level security;
-- emails_procesados: solo lo toca el webhook con service role (bypassa RLS);
-- se habilita RLS sin políticas para bloquear acceso de usuarios normales.
alter table public.emails_procesados   enable row level security;

-- clientes: catálogo → escritura solo gestores (igual que proveedores).
create policy "clientes_lectura" on public.clientes
  for select using (auth.role() = 'authenticated');
create policy "clientes_insert" on public.clientes
  for insert with check (public.es_gestor());
create policy "clientes_update" on public.clientes
  for update using (public.es_gestor());
create policy "clientes_delete" on public.clientes
  for delete using (public.es_gestor());

-- Tablas operativas: cualquier autenticado lee y escribe (como movimientos).
do $$
declare t text;
begin
  foreach t in array array['casos_compra', 'notificaciones', 'casos_venta', 'casos_venta_items', 'salidas_pendientes'] loop
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
