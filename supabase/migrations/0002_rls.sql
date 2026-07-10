-- ============================================================
--  Row Level Security
--  Lectura: cualquier usuario autenticado.
--  Movimientos: cualquier autenticado puede crear.
--  Catálogos/materiales: editar/borrar solo admin o gerente.
-- ============================================================

-- Helper: rol del usuario actual.
create function public.mi_rol()
returns public.rol_usuario
language sql
security definer set search_path = public
stable
as $$
  select rol from public.profiles where id = auth.uid();
$$;

create function public.es_gestor()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select public.mi_rol() in ('admin', 'gerente');
$$;

-- Activar RLS
alter table public.profiles    enable row level security;
alter table public.categorias  enable row level security;
alter table public.ubicaciones enable row level security;
alter table public.proveedores enable row level security;
alter table public.materiales  enable row level security;
alter table public.movimientos enable row level security;

-- ---------- profiles ----------
create policy "perfiles_lectura" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "perfil_propio_update" on public.profiles
  for update using (id = auth.uid());
create policy "perfiles_admin_update" on public.profiles
  for update using (public.mi_rol() = 'admin');

-- ---------- Catálogos (categorias, ubicaciones, proveedores) ----------
do $$
declare t text;
begin
  foreach t in array array['categorias', 'ubicaciones', 'proveedores'] loop
    execute format($f$
      create policy "%1$s_lectura" on public.%1$s
        for select using (auth.role() = 'authenticated');
      create policy "%1$s_insert" on public.%1$s
        for insert with check (public.es_gestor());
      create policy "%1$s_update" on public.%1$s
        for update using (public.es_gestor());
      create policy "%1$s_delete" on public.%1$s
        for delete using (public.es_gestor());
    $f$, t);
  end loop;
end $$;

-- ---------- materiales ----------
create policy "materiales_lectura" on public.materiales
  for select using (auth.role() = 'authenticated');
create policy "materiales_insert" on public.materiales
  for insert with check (public.es_gestor());
create policy "materiales_update" on public.materiales
  for update using (public.es_gestor());
create policy "materiales_delete" on public.materiales
  for delete using (public.es_gestor());

-- ---------- movimientos ----------
create policy "movimientos_lectura" on public.movimientos
  for select using (auth.role() = 'authenticated');
create policy "movimientos_insert" on public.movimientos
  for insert with check (auth.role() = 'authenticated');
