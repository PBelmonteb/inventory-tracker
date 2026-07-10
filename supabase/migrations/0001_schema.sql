-- ============================================================
--  Inventory Tracker — Esquema inicial
--  Ledger de movimientos como fuente de verdad;
--  materiales.stock_actual se mantiene por trigger.
-- ============================================================

-- ---------- Perfiles de usuario (extiende auth.users) ----------
create type public.rol_usuario as enum ('admin', 'gerente', 'operario');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nombre      text not null default '',
  rol         public.rol_usuario not null default 'operario',
  created_at  timestamptz not null default now()
);

-- Crea el perfil automáticamente cuando se registra un usuario.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Catálogos ----------
create table public.categorias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  created_at  timestamptz not null default now()
);

create table public.ubicaciones (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  created_at  timestamptz not null default now()
);

create table public.proveedores (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  contacto    text,
  created_at  timestamptz not null default now()
);

-- ---------- Materiales ----------
create table public.materiales (
  id            uuid primary key default gen_random_uuid(),
  sku           text unique,
  nombre        text not null,
  descripcion   text,
  categoria_id  uuid references public.categorias (id) on delete set null,
  ubicacion_id  uuid references public.ubicaciones (id) on delete set null,
  proveedor_id  uuid references public.proveedores (id) on delete set null,
  unidad        text not null default 'pza',
  stock_actual  numeric(14, 3) not null default 0,
  stock_minimo  numeric(14, 3) not null default 0,
  costo_unitario numeric(14, 2) not null default 0,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index materiales_nombre_idx on public.materiales using gin (to_tsvector('spanish', nombre));
create index materiales_categoria_idx on public.materiales (categoria_id);
create index materiales_ubicacion_idx on public.materiales (ubicacion_id);

-- ---------- Movimientos (ledger) ----------
create type public.tipo_movimiento as enum ('entrada', 'salida', 'ajuste');

create table public.movimientos (
  id          uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materiales (id) on delete cascade,
  tipo        public.tipo_movimiento not null,
  cantidad    numeric(14, 3) not null,
  usuario_id  uuid references public.profiles (id) on delete set null,
  nota        text,
  referencia  text,
  created_at  timestamptz not null default now()
);

create index movimientos_material_idx on public.movimientos (material_id, created_at desc);

-- ---------- Sincronización de stock ----------
-- entrada: suma | salida: resta | ajuste: fija el stock al valor `cantidad`.
create function public.aplicar_movimiento()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.tipo = 'entrada' then
    update public.materiales
      set stock_actual = stock_actual + new.cantidad, updated_at = now()
      where id = new.material_id;
  elsif new.tipo = 'salida' then
    update public.materiales
      set stock_actual = stock_actual - new.cantidad, updated_at = now()
      where id = new.material_id;
  elsif new.tipo = 'ajuste' then
    update public.materiales
      set stock_actual = new.cantidad, updated_at = now()
      where id = new.material_id;
  end if;
  return new;
end;
$$;

create trigger trg_aplicar_movimiento
  after insert on public.movimientos
  for each row execute function public.aplicar_movimiento();

-- Evita stock negativo en salidas.
create function public.validar_movimiento()
returns trigger
language plpgsql
as $$
declare
  stock_disp numeric;
begin
  if new.cantidad <= 0 and new.tipo <> 'ajuste' then
    raise exception 'La cantidad debe ser mayor a cero';
  end if;
  if new.tipo = 'salida' then
    select stock_actual into stock_disp from public.materiales where id = new.material_id;
    if stock_disp < new.cantidad then
      raise exception 'Stock insuficiente: disponible %, solicitado %', stock_disp, new.cantidad;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_validar_movimiento
  before insert on public.movimientos
  for each row execute function public.validar_movimiento();
