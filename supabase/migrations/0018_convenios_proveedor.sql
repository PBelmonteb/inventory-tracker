-- ============================================================
--  Convenios con proveedores: precio pactado + condiciones
--  (cantidad mínima, tiempo de entrega comprometido, condiciones
--  de pago) para un par proveedor+material puntual.
--
--  Se usan para pre-llenar los casos de compra (manual, "solicitar
--  cotización" y la reposición automática de la migración 0017) en
--  vez de adivinar con el WAC o dejar el monto en $0.
-- ============================================================

create table public.convenios_proveedor (
  id                    uuid primary key default gen_random_uuid(),
  proveedor_id          uuid not null references public.proveedores (id) on delete cascade,
  material_id           uuid not null references public.materiales (id) on delete cascade,
  precio_pactado        numeric(14, 2) not null check (precio_pactado > 0),
  cantidad_minima       numeric(14, 3) check (cantidad_minima is null or cantidad_minima > 0),
  dias_entrega_pactado  numeric(6, 1) check (dias_entrega_pactado is null or dias_entrega_pactado > 0),
  condiciones_pago      text,
  -- null = sin vencimiento.
  vigencia_hasta        date,
  notas                 text,
  activo                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index convenios_proveedor_proveedor_idx on public.convenios_proveedor (proveedor_id);
create index convenios_proveedor_material_idx on public.convenios_proveedor (material_id);

-- Un solo convenio activo por par proveedor+material a la vez — evita
-- ambigüedad de qué precio usar. Para cambiar el precio: desactivar el
-- viejo y crear uno nuevo (conserva el historial en vez de sobreescribirlo,
-- mismo espíritu que historial_precios / el resto del historial autónomo).
create unique index convenios_proveedor_material_activo_idx
  on public.convenios_proveedor (proveedor_id, material_id)
  where activo;

alter table public.convenios_proveedor enable row level security;

-- Mismo patrón que bom_items (0016): lectura abierta, escritura solo gestor
-- (son condiciones comerciales negociadas, no una tabla operativa cualquiera).
create policy "convenios_proveedor_lectura" on public.convenios_proveedor
  for select using (auth.role() = 'authenticated');
create policy "convenios_proveedor_insert" on public.convenios_proveedor
  for insert with check (public.es_gestor());
create policy "convenios_proveedor_update" on public.convenios_proveedor
  for update using (public.es_gestor());
create policy "convenios_proveedor_delete" on public.convenios_proveedor
  for delete using (public.es_gestor());

-- ---------- Nueva fuente de historial_precios ----------
-- Al crear un convenio o cambiarle el precio pactado, la app inserta un
-- historial_precios (tipo='costo', fuente='convenio') directo — el insert
-- ya está permitido por la política existente (0006), no hace falta un
-- trigger nuevo. Esta sentencia debe ir sola (sin usar el valor todavía)
-- porque Postgres no permite usar un valor de enum recién agregado dentro
-- de la misma transacción en que se agrega.
alter type public.fuente_precio add value if not exists 'convenio';
