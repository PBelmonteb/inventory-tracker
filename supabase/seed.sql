-- ============================================================
--  Datos de ejemplo (ejecutar en el SQL Editor de Supabase).
--  Se ejecuta como service role => ignora RLS.
--  El stock_actual lo calcula el trigger a partir de los movimientos.
-- ============================================================

-- ---------- Catálogos ----------
insert into public.categorias (nombre) values
  ('Perfiles de aluminio'),
  ('Láminas'),
  ('Herrajes'),
  ('Tornillería'),
  ('Consumibles')
on conflict do nothing;

insert into public.ubicaciones (nombre) values
  ('Almacén A'),
  ('Almacén B'),
  ('Patio'),
  ('Estante 1')
on conflict do nothing;

insert into public.proveedores (nombre, contacto) values
  ('Aluminios del Norte', 'ventas@aluminorte.mx'),
  ('Herrajes MTY', 'pedidos@herrajesmty.mx'),
  ('Tornillos SA', 'contacto@tornillossa.mx')
on conflict do nothing;

-- ---------- Materiales ----------
insert into public.materiales (sku, nombre, descripcion, categoria_id, ubicacion_id, proveedor_id, unidad, stock_minimo, costo_unitario)
values
  ('PERF-001', 'Perfil aluminio 1" natural',  'Perfil estructural 1 pulgada',
     (select id from public.categorias where nombre='Perfiles de aluminio'),
     (select id from public.ubicaciones where nombre='Almacén A'),
     (select id from public.proveedores where nombre='Aluminios del Norte'),
     'm', 200, 85.50),
  ('PERF-002', 'Perfil aluminio 2" blanco',   'Perfil ventana 2 pulgadas',
     (select id from public.categorias where nombre='Perfiles de aluminio'),
     (select id from public.ubicaciones where nombre='Almacén A'),
     (select id from public.proveedores where nombre='Aluminios del Norte'),
     'm', 150, 132.00),
  ('LAM-001',  'Lámina aluminio 1mm',          'Lámina lisa calibre 1mm',
     (select id from public.categorias where nombre='Láminas'),
     (select id from public.ubicaciones where nombre='Almacén B'),
     (select id from public.proveedores where nombre='Aluminios del Norte'),
     'pza', 50, 410.00),
  ('HER-001',  'Bisagra reforzada',            'Bisagra para puerta de aluminio',
     (select id from public.categorias where nombre='Herrajes'),
     (select id from public.ubicaciones where nombre='Estante 1'),
     (select id from public.proveedores where nombre='Herrajes MTY'),
     'pza', 100, 28.90),
  ('HER-002',  'Cerradura corrediza',          'Cerradura para ventana corrediza',
     (select id from public.categorias where nombre='Herrajes'),
     (select id from public.ubicaciones where nombre='Estante 1'),
     (select id from public.proveedores where nombre='Herrajes MTY'),
     'pza', 40, 64.00),
  ('TOR-001',  'Tornillo autorroscante #8',    'Caja de 1000 piezas',
     (select id from public.categorias where nombre='Tornillería'),
     (select id from public.ubicaciones where nombre='Estante 1'),
     (select id from public.proveedores where nombre='Tornillos SA'),
     'caja', 10, 220.00),
  ('CON-001',  'Silicón estructural',          'Cartucho 300ml',
     (select id from public.categorias where nombre='Consumibles'),
     (select id from public.ubicaciones where nombre='Almacén B'),
     (select id from public.proveedores where nombre='Herrajes MTY'),
     'pza', 60, 95.00),
  ('PERF-003', 'Perfil aluminio 3" anodizado', 'Perfil cancelería 3 pulgadas — LOTE PARADO',
     (select id from public.categorias where nombre='Perfiles de aluminio'),
     (select id from public.ubicaciones where nombre='Patio'),
     (select id from public.proveedores where nombre='Aluminios del Norte'),
     'm', 80, 175.00)
on conflict (sku) do nothing;

-- ---------- Movimientos (construyen el stock) ----------
-- Entradas recientes
insert into public.movimientos (material_id, tipo, cantidad, nota, referencia, created_at) values
  ((select id from public.materiales where sku='PERF-001'), 'entrada', 500, 'Compra inicial', 'OC-1001', now() - interval '40 days'),
  ((select id from public.materiales where sku='PERF-002'), 'entrada', 300, 'Compra inicial', 'OC-1001', now() - interval '40 days'),
  ((select id from public.materiales where sku='LAM-001'),  'entrada', 120, 'Compra inicial', 'OC-1002', now() - interval '35 days'),
  ((select id from public.materiales where sku='HER-001'),  'entrada', 800, 'Compra inicial', 'OC-1003', now() - interval '30 days'),
  ((select id from public.materiales where sku='HER-002'),  'entrada', 200, 'Compra inicial', 'OC-1003', now() - interval '30 days'),
  ((select id from public.materiales where sku='TOR-001'),  'entrada', 25,  'Compra inicial', 'OC-1004', now() - interval '20 days'),
  ((select id from public.materiales where sku='CON-001'),  'entrada', 150, 'Compra inicial', 'OC-1005', now() - interval '15 days');

-- Material PARADO: gran compra hace 6 meses, sin consumo desde entonces.
insert into public.movimientos (material_id, tipo, cantidad, nota, referencia, created_at) values
  ((select id from public.materiales where sku='PERF-003'), 'entrada', 600, 'Compra grande — nunca se usó', 'OC-0500', now() - interval '180 days');

-- Salidas (consumo en producción)
insert into public.movimientos (material_id, tipo, cantidad, nota, referencia, created_at) values
  ((select id from public.materiales where sku='PERF-001'), 'salida', 350, 'Producción ventanas', 'OP-2001', now() - interval '10 days'),
  ((select id from public.materiales where sku='PERF-002'), 'salida', 180, 'Producción ventanas', 'OP-2001', now() - interval '8 days'),
  ((select id from public.materiales where sku='LAM-001'),  'salida', 80,  'Producción puertas',  'OP-2002', now() - interval '5 days'),
  ((select id from public.materiales where sku='HER-001'),  'salida', 720, 'Producción puertas',  'OP-2002', now() - interval '3 days'),
  ((select id from public.materiales where sku='TOR-001'),  'salida', 18,  'Consumo general',     'OP-2003', now() - interval '2 days');
