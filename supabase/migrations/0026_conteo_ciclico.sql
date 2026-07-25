-- ============================================================
--  Conteo cíclico (physical inventory a ciegas) + umbral de
--  autorización por monto.
-- ============================================================

-- ---------- Conteo cíclico ----------
create type public.estado_conteo as enum ('abierto', 'contado', 'aplicado', 'cancelado');

create table public.conteos (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text not null unique,
  titulo              text not null,
  estado              public.estado_conteo not null default 'abierto',
  creado_por_id       uuid references public.profiles (id) on delete set null,
  creado_por_nombre   text,
  aplicado_por_id     uuid references public.profiles (id) on delete set null,
  aplicado_por_nombre text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  aplicado_at         timestamptz
);

-- Snapshots de material/ubicación (sobrevive a que se borren después,
-- mismo patrón que el resto de la app — ver historial_precios,
-- casos_compra). stock_esperado NUNCA se manda al cliente mientras el
-- conteo no esté "aplicado": el conteo es a ciegas (ver lib/actions/conteos.ts).
create table public.conteo_items (
  id                uuid primary key default gen_random_uuid(),
  conteo_id         uuid not null references public.conteos (id) on delete cascade,
  material_id       uuid references public.materiales (id) on delete set null,
  material_nombre   text not null,
  material_sku      text,
  ubicacion_id      uuid references public.ubicaciones (id) on delete set null,
  ubicacion_nombre  text,
  stock_esperado    numeric(14, 3) not null,
  cantidad_contada  numeric(14, 3),
  contado_por_id    uuid references public.profiles (id) on delete set null,
  contado_por_nombre text,
  contado_at        timestamptz,
  movimiento_id     uuid references public.movimientos (id) on delete set null,
  created_at        timestamptz not null default now()
);

create index conteo_items_conteo_idx on public.conteo_items (conteo_id);

alter table public.conteos       enable row level security;
alter table public.conteo_items  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['conteos', 'conteo_items'] loop
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

-- Aplica un conteo "contado": por cada item cuya cantidad contada sea
-- distinta de lo esperado, inserta un movimiento tipo "ajuste" (que ya
-- sabe fijar el stock de ESA ubicación al valor exacto — ver
-- aplicar_movimiento() en 0011_multi_ubicacion.sql, no se reimplementa
-- nada aquí). Items sin varianza no generan ruido en el historial.
create or replace function public.aplicar_conteo(p_conteo uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  cn public.conteos%rowtype;
  it record;
  mov_id uuid;
begin
  select * into cn from public.conteos where id = p_conteo for update;
  if not found then
    raise exception 'Conteo no encontrado';
  end if;
  if cn.estado <> 'contado' then
    raise exception 'Este conteo no está listo para aplicarse';
  end if;

  for it in
    select * from public.conteo_items
    where conteo_id = p_conteo
      and material_id is not null
      and cantidad_contada is not null
      and cantidad_contada <> stock_esperado
  loop
    insert into public.movimientos
      (material_id, tipo, cantidad, ubicacion_id, usuario_id, nota, referencia)
    values
      (it.material_id, 'ajuste', it.cantidad_contada, it.ubicacion_id, auth.uid(),
       'Conteo cíclico — ' || cn.codigo, cn.codigo)
    returning id into mov_id;

    update public.conteo_items set movimiento_id = mov_id where id = it.id;
  end loop;

  update public.conteos
    set estado = 'aplicado', aplicado_por_id = auth.uid(), aplicado_at = now(), updated_at = now()
    where id = p_conteo;
end;
$$;

-- ---------- Umbral de autorización por monto ----------
-- Tabla singleton (una sola fila — id booleano forzado a "true").
create table public.configuracion_autorizacion (
  id                  boolean primary key default true,
  monto_umbral_admin  numeric(14, 2) not null default 50000,
  updated_at          timestamptz not null default now(),
  updated_por_id      uuid references public.profiles (id) on delete set null,
  updated_por_nombre  text,
  constraint configuracion_autorizacion_singleton check (id)
);
insert into public.configuracion_autorizacion (id) values (true);

alter table public.configuracion_autorizacion enable row level security;
create policy "configuracion_autorizacion_lectura" on public.configuracion_autorizacion
  for select using (auth.role() = 'authenticated');
-- Solo admin (no gerente) puede cambiar el umbral — mismo helper que ya
-- usa el resto de la app (0002_rls.sql), pero comparando el rol exacto
-- en vez de es_gestor() (que trata admin y gerente igual).
create policy "configuracion_autorizacion_update" on public.configuracion_autorizacion
  for update using (public.mi_rol() = 'admin');
