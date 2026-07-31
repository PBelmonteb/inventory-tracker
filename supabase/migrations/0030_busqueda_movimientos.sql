-- ============================================================
--  Búsqueda de movimientos (/movimientos): columnas generadas
--  sin acentos + minúsculas para que "silicon" encuentre "Silicón"
--  vía ILIKE normal — mismo criterio que ya usa normalizarTexto()
--  del lado del cliente (lib/utils.ts) para Inventario/Proveedores,
--  ahora también disponible para un filtro server-side (necesario
--  aquí porque el historial de movimientos es demasiado grande
--  para filtrarlo completo en el cliente).
-- ============================================================

create extension if not exists unaccent with schema extensions;

alter table public.movimientos
  add column if not exists material_nombre_normalizado text
    generated always as (extensions.unaccent(lower(coalesce(material_nombre, '')))) stored,
  add column if not exists material_sku_normalizado text
    generated always as (extensions.unaccent(lower(coalesce(material_sku, '')))) stored;
