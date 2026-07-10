import { createClient } from "@/lib/supabase/server";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import type {
  Auditoria,
  BomItemConMaterial,
  CasoCompraConRelaciones,
  CasoVentaConRelaciones,
  Categoria,
  Cliente,
  HistorialPrecio,
  MaterialConRelaciones,
  MovimientoConRelaciones,
  NotificacionConRelaciones,
  ProducibleConReceta,
  Proveedor,
  SalidaPendienteConRelaciones,
  StockPorUbicacion,
  Ubicacion,
} from "@/lib/types";

const MATERIAL_SELECT =
  "*, categorias(id,nombre), ubicaciones(id,nombre), proveedores(id,nombre)";

export async function getMateriales(): Promise<MaterialConRelaciones[]> {
  if (DEMO) return store.getMateriales();
  const supabase = await createClient();
  const { data } = await supabase
    .from("materiales")
    .select(MATERIAL_SELECT)
    .eq("activo", true)
    .order("nombre");
  return (data as MaterialConRelaciones[]) ?? [];
}

export async function getMaterial(
  id: string
): Promise<MaterialConRelaciones | null> {
  if (DEMO) return store.getMaterial(id);
  const supabase = await createClient();
  const { data } = await supabase
    .from("materiales")
    .select(MATERIAL_SELECT)
    .eq("id", id)
    .single();
  return (data as MaterialConRelaciones) ?? null;
}

// Stock comprometido por material (reservas): casos de venta confirmados/en
// producción + salidas pendientes. Devuelve un mapa material_id -> cantidad.
export async function getComprometido(): Promise<Record<string, number>> {
  if (DEMO) return store.getComprometidoPorMaterial();
  const supabase = await createClient();
  const map: Record<string, number> = {};
  const add = (id: string, qty: number) => {
    map[id] = (map[id] ?? 0) + Number(qty);
  };

  // Traemos los items con el estado del caso embebido y filtramos en JS
  // (evita problemas del filtro embebido de PostgREST sobre columnas enum).
  const { data: items } = await supabase
    .from("casos_venta_items")
    .select("material_id, cantidad, casos_venta(estado)");
  for (const it of (items ?? []) as unknown as {
    material_id: string;
    cantidad: number;
    casos_venta: { estado: string } | { estado: string }[] | null;
  }[]) {
    const cv = Array.isArray(it.casos_venta)
      ? it.casos_venta[0]
      : it.casos_venta;
    if (cv?.estado === "confirmado" || cv?.estado === "en_produccion")
      add(it.material_id, it.cantidad);
  }

  const { data: pend } = await supabase
    .from("salidas_pendientes")
    .select("material_id, cantidad")
    .eq("estado", "pendiente");
  for (const s of (pend ?? []) as { material_id: string; cantidad: number }[])
    add(s.material_id, s.cantidad);

  return map;
}

type UbicNombre = { nombre: string } | { nombre: string }[] | null;
const nombreDeRelacion = (u: UbicNombre): string | undefined =>
  Array.isArray(u) ? u[0]?.nombre : u?.nombre;

// Desglose de stock de un material por ubicación. Si nunca tuvo un
// movimiento con ubicación explícita, regresa una sola fila implícita con
// su ubicación por defecto y el stock total (sin backfill de datos).
export async function getStockPorUbicacion(
  materialId: string
): Promise<StockPorUbicacion[]> {
  if (DEMO) return store.getStockPorUbicacion(materialId);
  const supabase = await createClient();
  const [{ data: filas }, { data: material }] = await Promise.all([
    supabase
      .from("material_stock_ubicacion")
      .select("ubicacion_id, stock, ubicaciones(nombre)")
      .eq("material_id", materialId),
    supabase
      .from("materiales")
      .select("stock_actual, ubicacion_id, ubicaciones(nombre)")
      .eq("id", materialId)
      .single(),
  ]);

  if (!filas || filas.length === 0) {
    if (!material) return [];
    return [
      {
        ubicacion_id: material.ubicacion_id,
        ubicacion_nombre:
          nombreDeRelacion(material.ubicaciones as UbicNombre) ??
          "Sin ubicación",
        stock: material.stock_actual,
      },
    ];
  }

  return filas
    .map((f) => ({
      ubicacion_id: f.ubicacion_id,
      ubicacion_nombre:
        nombreDeRelacion(f.ubicaciones as UbicNombre) ?? "Sin ubicación",
      stock: f.stock,
    }))
    .sort((a, b) => b.stock - a.stock);
}

// Receta de producción de un material ("1 ventana = X perfil + Y herrajes").
export async function getBom(materialId: string): Promise<BomItemConMaterial[]> {
  if (DEMO) return store.getBom(materialId);
  const supabase = await createClient();
  const { data } = await supabase
    .from("bom_items")
    .select(
      "*, componente:materiales!bom_items_componente_id_fkey(id,nombre,sku,unidad,stock_actual)"
    )
    .eq("producto_id", materialId);
  return (data as unknown as BomItemConMaterial[]) ?? [];
}

// Materiales que tienen al menos una receta configurada (para /produccion).
// Dos consultas simples en vez de un embed anidado de dos niveles.
export async function getProducibles(): Promise<ProducibleConReceta[]> {
  if (DEMO) return store.getProducibles();
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("bom_items")
    .select(
      "*, componente:materiales!bom_items_componente_id_fkey(id,nombre,sku,unidad,stock_actual)"
    );
  if (!items || items.length === 0) return [];

  const productoIds = [...new Set(items.map((i) => i.producto_id as string))];
  const { data: productos } = await supabase
    .from("materiales")
    .select(MATERIAL_SELECT)
    .in("id", productoIds)
    .eq("activo", true);

  const porId = new Map(
    ((productos as unknown as MaterialConRelaciones[]) ?? []).map((p) => [p.id, p])
  );

  const recetaPorProducto = new Map<string, BomItemConMaterial[]>();
  for (const row of items as unknown as BomItemConMaterial[]) {
    if (!porId.has(row.producto_id)) continue; // producto inactivo o no encontrado
    const lista = recetaPorProducto.get(row.producto_id) ?? [];
    lista.push(row);
    recetaPorProducto.set(row.producto_id, lista);
  }

  return productoIds
    .filter((id) => porId.has(id))
    .map((id) => ({
      producto: porId.get(id)!,
      receta: recetaPorProducto.get(id) ?? [],
    }));
}

// Desglose por ubicación de TODOS los materiales activos (para el reporte
// de valor por ubicación). Un solo par de consultas, sin N llamadas.
export async function getStockPorUbicacionTodos(): Promise<
  Record<string, StockPorUbicacion[]>
> {
  if (DEMO) return store.getStockPorUbicacionTodos();
  const supabase = await createClient();
  const [{ data: filas }, { data: materialesRows }] = await Promise.all([
    supabase
      .from("material_stock_ubicacion")
      .select("material_id, ubicacion_id, stock, ubicaciones(nombre)"),
    supabase
      .from("materiales")
      .select("id, stock_actual, ubicacion_id, ubicaciones(nombre)")
      .eq("activo", true),
  ]);

  const porMaterial: Record<string, StockPorUbicacion[]> = {};
  const conFilas = new Set<string>();
  for (const f of filas ?? []) {
    (porMaterial[f.material_id] ??= []).push({
      ubicacion_id: f.ubicacion_id,
      ubicacion_nombre:
        nombreDeRelacion(f.ubicaciones as UbicNombre) ?? "Sin ubicación",
      stock: f.stock,
    });
    conFilas.add(f.material_id);
  }
  for (const m of materialesRows ?? []) {
    if (!conFilas.has(m.id)) {
      porMaterial[m.id] = [
        {
          ubicacion_id: m.ubicacion_id,
          ubicacion_nombre:
            nombreDeRelacion(m.ubicaciones as UbicNombre) ?? "Sin ubicación",
          stock: m.stock_actual,
        },
      ];
    }
  }
  return porMaterial;
}

// Historial de costo/venta de TODOS los materiales (para comparar varios en
// una sola gráfica en Reportes).
export async function getHistorialPreciosTodos(): Promise<HistorialPrecio[]> {
  if (DEMO) return store.getHistorialPreciosTodos();
  const supabase = await createClient();
  const { data } = await supabase
    .from("historial_precios")
    .select("*")
    .order("created_at", { ascending: true });
  return (data as HistorialPrecio[]) ?? [];
}

export async function getAuditoria(limite = 200): Promise<Auditoria[]> {
  if (DEMO) return store.getAuditoria(limite);
  const supabase = await createClient();
  const { data } = await supabase
    .from("auditoria")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limite);
  return (data as Auditoria[]) ?? [];
}

export async function getHistorialPrecios(
  materialId: string
): Promise<HistorialPrecio[]> {
  if (DEMO) return store.getHistorialPrecios(materialId);
  const supabase = await createClient();
  const { data } = await supabase
    .from("historial_precios")
    .select("*")
    .eq("material_id", materialId)
    .order("created_at", { ascending: true });
  return (data as HistorialPrecio[]) ?? [];
}

export async function getMovimientosDeMaterial(
  materialId: string
): Promise<MovimientoConRelaciones[]> {
  if (DEMO) return store.getMovimientosDeMaterial(materialId);
  const supabase = await createClient();
  const { data } = await supabase
    .from("movimientos")
    .select("*, profiles(id,nombre), ubicaciones(id,nombre)")
    .eq("material_id", materialId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as MovimientoConRelaciones[]) ?? [];
}

export async function getMovimientosRecientes(
  limite = 50
): Promise<MovimientoConRelaciones[]> {
  if (DEMO) return store.getMovimientosRecientes(limite);
  const supabase = await createClient();
  const { data } = await supabase
    .from("movimientos")
    .select(
      "*, materiales(id,nombre,sku,unidad), profiles(id,nombre), ubicaciones(id,nombre)"
    )
    .order("created_at", { ascending: false })
    .limit(limite);
  return (data as MovimientoConRelaciones[]) ?? [];
}

export async function getCategorias(): Promise<Categoria[]> {
  if (DEMO) return store.getCategorias();
  const supabase = await createClient();
  const { data } = await supabase.from("categorias").select("*").order("nombre");
  return (data as Categoria[]) ?? [];
}

export async function getUbicaciones(): Promise<Ubicacion[]> {
  if (DEMO) return store.getUbicaciones();
  const supabase = await createClient();
  const { data } = await supabase
    .from("ubicaciones")
    .select("*")
    .order("nombre");
  return (data as Ubicacion[]) ?? [];
}

export async function getProveedores(): Promise<Proveedor[]> {
  if (DEMO) return store.getProveedores();
  const supabase = await createClient();
  const { data } = await supabase
    .from("proveedores")
    .select("*")
    .order("nombre");
  return (data as Proveedor[]) ?? [];
}

/* ---------------- Portal de proveedores ---------------- */

// La sincronización en lectura ES la automatización: cada visita al portal
// (force-dynamic) reconcilia las alertas contra el stock actual.
export async function getNotificaciones(): Promise<
  NotificacionConRelaciones[]
> {
  if (DEMO) {
    store.sincronizarNotificaciones();
    return store.getNotificaciones();
  }
  const supabase = await createClient();
  await supabase.rpc("sincronizar_notificaciones");
  const { data } = await supabase
    .from("notificaciones")
    .select(
      "*, materiales(id,nombre,sku,unidad,stock_actual,stock_minimo), proveedores(id,nombre,contacto)"
    )
    .neq("estado", "atendida")
    .order("created_at", { ascending: false });
  return (data as NotificacionConRelaciones[]) ?? [];
}

export async function getCasosCompra(): Promise<CasoCompraConRelaciones[]> {
  if (DEMO) return store.getCasosCompra();
  const supabase = await createClient();
  const { data } = await supabase
    .from("casos_compra")
    .select("*, proveedores(id,nombre), materiales(id,nombre,sku)")
    .order("updated_at", { ascending: false });
  return (data as CasoCompraConRelaciones[]) ?? [];
}

/* ---------------- Portal de clientes ---------------- */

export async function getClientes(): Promise<Cliente[]> {
  if (DEMO) return store.getClientes();
  const supabase = await createClient();
  const { data } = await supabase.from("clientes").select("*").order("nombre");
  return (data as Cliente[]) ?? [];
}

export async function getCasosVenta(): Promise<CasoVentaConRelaciones[]> {
  if (DEMO) return store.getCasosVenta();
  const supabase = await createClient();
  const { data } = await supabase
    .from("casos_venta")
    .select(
      "*, clientes(id,nombre), items:casos_venta_items(*, materiales(id,nombre,sku,unidad,stock_actual))"
    )
    .order("updated_at", { ascending: false });
  return (data as CasoVentaConRelaciones[]) ?? [];
}

export async function getSalidasPendientes(): Promise<
  SalidaPendienteConRelaciones[]
> {
  if (DEMO) return store.getSalidasPendientes();
  const supabase = await createClient();
  const { data } = await supabase
    .from("salidas_pendientes")
    .select(
      "*, materiales(id,nombre,sku,unidad,stock_actual), casos_venta(id,titulo,referencia, clientes(nombre))"
    )
    .order("created_at", { ascending: false });
  type Fila = SalidaPendienteConRelaciones & {
    casos_venta:
      | (NonNullable<SalidaPendienteConRelaciones["casos_venta"]> & {
          clientes?: { nombre: string } | null;
        })
      | null;
  };
  return ((data as Fila[]) ?? []).map((sp) => ({
    ...sp,
    casos_venta: sp.casos_venta
      ? {
          id: sp.casos_venta.id,
          titulo: sp.casos_venta.titulo,
          referencia: sp.casos_venta.referencia,
          cliente_nombre: sp.casos_venta.clientes?.nombre ?? null,
        }
      : null,
  }));
}
