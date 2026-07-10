-- ============================================================
--  Bitácora de auditoría: quién crea / edita / da de baja
--  materiales y catálogos. Vía triggers (captura toda ruta).
--  Excluye los cambios automáticos de stock/costo (WAC) para
--  no ahogar la bitácora con ruido.
-- ============================================================

create table if not exists public.auditoria (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid references public.profiles (id) on delete set null,
  usuario_nombre text,
  accion         text not null,   -- 'crear' | 'editar' | 'eliminar'
  entidad        text not null,   -- 'material' | 'categoria' | ...
  entidad_id     uuid,
  entidad_nombre text,
  created_at     timestamptz not null default now()
);
create index if not exists auditoria_created_idx
  on public.auditoria (created_at desc);

alter table public.auditoria enable row level security;
-- Solo gestores pueden leer la bitácora.
create policy "auditoria_lectura" on public.auditoria
  for select using (public.es_gestor());

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  jn jsonb := to_jsonb(new);
  jo jsonb := to_jsonb(old);
  v_accion text;
  v_id uuid;
  v_nombre text;
  v_usuario text;
begin
  if tg_op = 'INSERT' then
    v_accion := 'crear'; v_id := (jn->>'id')::uuid; v_nombre := jn->>'nombre';
  elsif tg_op = 'UPDATE' then
    v_accion := 'editar'; v_id := (jn->>'id')::uuid; v_nombre := jn->>'nombre';
    -- Baja lógica de material (activo true -> false) cuenta como eliminar.
    if (jo->>'activo') = 'true' and (jn->>'activo') = 'false' then
      v_accion := 'eliminar';
    end if;
  else
    v_accion := 'eliminar'; v_id := (jo->>'id')::uuid; v_nombre := jo->>'nombre';
  end if;

  select nombre into v_usuario from public.profiles where id = auth.uid();

  insert into public.auditoria
    (usuario_id, usuario_nombre, accion, entidad, entidad_id, entidad_nombre)
  values
    (auth.uid(), v_usuario, v_accion, tg_argv[0], v_id, v_nombre);

  return coalesce(new, old);
end;
$$;

-- Materiales: solo columnas "de negocio" (NO stock_actual ni costo_unitario,
-- que cambian solos con movimientos/WAC).
drop trigger if exists trg_aud_materiales on public.materiales;
create trigger trg_aud_materiales
  after insert or delete or update of
    nombre, sku, descripcion, categoria_id, ubicacion_id, proveedor_id,
    unidad, stock_minimo, precio_venta, aviso_valor, aviso_modo, activo
  on public.materiales
  for each row execute function public.registrar_auditoria('material');

-- Catálogos: cualquier cambio.
drop trigger if exists trg_aud_categorias on public.categorias;
create trigger trg_aud_categorias after insert or update or delete
  on public.categorias for each row
  execute function public.registrar_auditoria('categoria');

drop trigger if exists trg_aud_ubicaciones on public.ubicaciones;
create trigger trg_aud_ubicaciones after insert or update or delete
  on public.ubicaciones for each row
  execute function public.registrar_auditoria('ubicacion');

drop trigger if exists trg_aud_proveedores on public.proveedores;
create trigger trg_aud_proveedores after insert or update or delete
  on public.proveedores for each row
  execute function public.registrar_auditoria('proveedor');

drop trigger if exists trg_aud_clientes on public.clientes;
create trigger trg_aud_clientes after insert or update or delete
  on public.clientes for each row
  execute function public.registrar_auditoria('cliente');
