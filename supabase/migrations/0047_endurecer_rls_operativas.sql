-- ============================================================
--  Cierra la misma familia de hueco que 0046 cerró en profiles: varias
--  tablas "operativas" tienen "for update using (auth.role() =
--  'authenticated')" -- cualquier usuario autenticado, cualquier rol,
--  puede actualizar cualquier columna de cualquier fila, directo contra
--  Supabase, saltándose todos los candados que la app sí aplica en las
--  Server Actions (requireGestor(), umbral de autorización, conteo a
--  ciegas...). Esta migración NO toca esas policies (siguen dejando
--  entrar a cualquier autenticado, a propósito -- así ya funcionaba
--  media app): agrega triggers que congelan las columnas realmente
--  sensibles a menos que quien llama tenga el rol correcto, usando
--  es_gestor() (0002_rls.sql) -- que sí refleja el rol real de quien iba
--  a la sesión original, incluso cuando la escritura pasa por una función
--  security definer como aplicar_conteo().
--
--  Alcance de esta pasada: casos_compra_eventos (bitácora), conteos y
--  conteo_items (integridad del conteo "a ciegas"), y el RPC
--  aplicar_conteo() (no tenía NINGÚN candado de rol propio -- solo lo
--  protegía requireGestor() del lado de la Server Action, saltable
--  llamando al RPC directo). Pendiente para una pasada aparte: casos_compra
--  (el envío automático por convenio complica congelar "estado" sin
--  romperlo -- necesita rastrear con cuidado ese camino primero),
--  casos_venta, casos_venta_items, salidas_pendientes,
--  solicitudes_compra, notificaciones, y un barrido del resto de los RPCs
--  security definer por si les falta el mismo candado que a
--  aplicar_conteo().
-- ============================================================

-- ---------- casos_compra_eventos: la bitácora no se edita, solo se agrega ----------
-- Sin esto, cualquier autenticado podía reescribir el timeline de un caso
-- (quién autorizó qué, cuándo) -- nada en la app la actualiza nunca
-- (lib/eventos-caso.ts solo hace insert), así que quitarla no rompe nada.
-- Mismo patrón que ya tenía bien casos_venta_eventos desde el principio.
drop policy if exists "casos_compra_eventos_update" on public.casos_compra_eventos;

-- ---------- conteo_items: proteger lo esperado y la identidad del item ----------
-- capturarConteoItem (cualquier autenticado, a propósito -- el operario
-- hace el recorrido físico) solo debe poder tocar cantidad_contada y
-- quién/cuándo contó. stock_esperado es el dato que hace "ciego" al
-- conteo -- si cualquiera lo puede leer/escribir directo, deja de serlo.
create or replace function public.proteger_columnas_sensibles_conteo_item()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if public.es_gestor() then
    return new;
  end if;
  new.stock_esperado := old.stock_esperado;
  new.conteo_id := old.conteo_id;
  new.material_id := old.material_id;
  new.material_nombre := old.material_nombre;
  new.material_sku := old.material_sku;
  new.ubicacion_id := old.ubicacion_id;
  new.ubicacion_nombre := old.ubicacion_nombre;
  new.movimiento_id := old.movimiento_id;
  return new;
end;
$$;

drop trigger if exists conteo_items_proteger_columnas_sensibles on public.conteo_items;
create trigger conteo_items_proteger_columnas_sensibles
  before update on public.conteo_items
  for each row execute function public.proteger_columnas_sensibles_conteo_item();

-- ---------- conteos: solo un gestor cancela o aplica ----------
-- Pasar a "contado" lo puede disparar cualquier autenticado (capturarConteoItem
-- al completar el último item, o cerrarConteo -- ese ya es gestor-only y
-- cae en la rama de arriba). "cancelado" es decisión de gestor
-- (cancelarConteo ya lo exige en JS). "aplicado" nunca debería llegar por
-- un update directo -- solo por el RPC aplicar_conteo(), que además ya
-- queda protegido abajo.
create or replace function public.proteger_transiciones_conteo()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if public.es_gestor() then
    return new;
  end if;
  if new.estado is distinct from old.estado and new.estado <> 'contado' then
    raise exception 'No autorizado para cambiar el conteo a este estado';
  end if;
  return new;
end;
$$;

drop trigger if exists conteos_proteger_transiciones on public.conteos;
create trigger conteos_proteger_transiciones
  before update on public.conteos
  for each row execute function public.proteger_transiciones_conteo();

-- ---------- aplicar_conteo(): le faltaba su propio candado ----------
-- El único candado que tenía era requireGestor() del lado de
-- lib/actions/conteos.ts (aplicarConteo) -- el RPC en sí mismo no
-- comprobaba nada más que "el conteo ya está contado". Cualquier
-- autenticado podía llamar supabase.rpc('aplicar_conteo', {p_conteo})
-- directo -- incluido el mismo operario que hizo el conteo a ciegas,
-- aplicándoselo a sí mismo sin que ningún gestor lo revisara, generando
-- los movimientos de ajuste reales de una vez.
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
  if not public.es_gestor() then
    raise exception 'No autorizado';
  end if;

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
