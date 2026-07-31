import { createClient } from "@/lib/supabase/server";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { calcularStockSugerido, type StockSugerido } from "@/lib/stock-sugerido";
import { calcularEOQ, type ResultadoEOQ } from "@/lib/eoq";
import { clasificarABCXYZ, type ItemClasificado } from "@/lib/clasificacion-abc-xyz";
import {
  calcularScorecardProveedores,
  type CasoRecibidoParaScorecard,
  type ScorecardProveedor,
} from "@/lib/scorecard-proveedores";
import { correrMRP, type BomEdge, type MaterialParaMRP, type RequerimientoMRP } from "@/lib/mrp";
import { nivelStock, normalizarTexto } from "@/lib/utils";
import type {
  Auditoria,
  BomItemConMaterial,
  CasoCompraConRelaciones,
  CasoCompraEvento,
  CasoVentaEvento,
  CasoVentaConRelaciones,
  Categoria,
  Cliente,
  ConfiguracionAutorizacion,
  Conteo,
  ConteoConItems,
  ConvenioConRelaciones,
  HistorialPrecio,
  InspeccionCalidad,
  MaterialConRelaciones,
  MovimientoConRelaciones,
  NotificacionConRelaciones,
  ProducibleConReceta,
  ProductoQueUsa,
  Proveedor,
  SalidaPendienteConRelaciones,
  SolicitudCompra,
  SolicitudCompraConRelaciones,
  StockPorUbicacion,
  Traslado,
  Ubicacion,
} from "@/lib/types";

const MATERIAL_SELECT =
  "*, categorias(id,nombre), ubicaciones(id,nombre), proveedores(id,nombre)";

// Orden de urgencia para listas de producibles (getProducibles): lo más
// crítico primero, para que el piso no tenga que escanear toda la lista.
const NIVEL_RANK: Record<"bajo" | "aviso" | "ok", number> = {
  bajo: 0,
  aviso: 1,
  ok: 2,
};

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

// Stock por llegar por material: órdenes de compra ya colocadas con el
// proveedor ("ordenado"), aún sin recibir. "pendiente"/"cotizando" no
// cuentan — todavía no son un compromiso real de entrega. Solo suma casos
// con cantidad_estimada capturada (ver migración 0024); casos sin ese dato
// (p. ej. los que llegaron por correo) simplemente no aportan aquí.
export async function getPorLlegar(): Promise<Record<string, number>> {
  if (DEMO) return store.getPorLlegarPorMaterial();
  const supabase = await createClient();
  const map: Record<string, number> = {};
  const { data } = await supabase
    .from("casos_compra")
    .select("material_id, cantidad_estimada")
    .eq("estado", "ordenado")
    .not("material_id", "is", null);
  for (const c of (data ?? []) as {
    material_id: string;
    cantidad_estimada: number | null;
  }[]) {
    if (!c.cantidad_estimada) continue;
    map[c.material_id] = (map[c.material_id] ?? 0) + Number(c.cantidad_estimada);
  }
  return map;
}

/* ---------------- Stock en tránsito ---------------- */

export async function getTraslados(): Promise<Traslado[]> {
  if (DEMO) return store.getTraslados();
  const supabase = await createClient();
  const { data } = await supabase
    .from("traslados")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as Traslado[]) ?? [];
}

// Cantidad en tránsito por material (ni en origen ni en destino todavía) —
// mismo shape que getComprometido/getPorLlegar, para poder sumarla igual
// de fácil en "Proyectado" (Inventario) y en el MRP.
export async function getEnTransito(): Promise<Record<string, number>> {
  if (DEMO) return store.getEnTransitoPorMaterial();
  const supabase = await createClient();
  const map: Record<string, number> = {};
  const { data } = await supabase
    .from("traslados")
    .select("material_id, cantidad")
    .eq("estado", "en_transito")
    .not("material_id", "is", null);
  for (const t of (data ?? []) as { material_id: string; cantidad: number }[])
    map[t.material_id] = (map[t.material_id] ?? 0) + Number(t.cantidad);
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

// Lookup inverso de getBom: qué producibles usan ESTE material como
// componente — para el material de un componente (ej. un perfil de
// aluminio bajo de stock), poder ir directo a "qué debo producir" en vez de
// tener que recordar/buscar manualmente qué lo usa.
export async function getProductosQueUsan(
  materialId: string
): Promise<ProductoQueUsa[]> {
  if (DEMO) return store.getProductosQueUsan(materialId);
  const supabase = await createClient();
  const { data } = await supabase
    .from("bom_items")
    .select("materiales!bom_items_producto_id_fkey(id,nombre,sku,activo)")
    .eq("componente_id", materialId);
  type Fila = { materiales: { id: string; nombre: string; sku: string | null; activo: boolean } | null };
  return ((data as unknown as Fila[]) ?? [])
    .map((r) => r.materiales)
    .filter((m): m is NonNullable<typeof m> => !!m && m.activo)
    .map((m) => ({ id: m.id, nombre: m.nombre, sku: m.sku }));
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
    }))
    .sort((a, b) => NIVEL_RANK[nivelStock(a.producto)] - NIVEL_RANK[nivelStock(b.producto)]);
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
// una sola gráfica en Reportes). Sin límite, esta tabla crece con cada
// compra/cambio de precio de TODOS los materiales — en una app de "muchas
// transacciones" terminaría mandando miles de puntos a una sola gráfica.
// Se acota a los más recientes (siguen siendo los relevantes para comparar
// tendencias) en vez de traer el historial completo desde el origen.
const LIMITE_HISTORIAL_PRECIOS_TODOS = 3000;

export async function getHistorialPreciosTodos(): Promise<HistorialPrecio[]> {
  if (DEMO) return store.getHistorialPreciosTodos();
  const supabase = await createClient();
  const { data } = await supabase
    .from("historial_precios")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(LIMITE_HISTORIAL_PRECIOS_TODOS);
  // La gráfica espera orden cronológico ascendente; se pidió DESC para
  // quedarse con los N más recientes y aquí se revierte.
  return ((data as HistorialPrecio[]) ?? []).reverse();
}

// Punto de reorden sugerido para "stock mínimo", calculado del historial
// real (ver lib/stock-sugerido.ts) — la lógica del cálculo vive en un solo
// lugar; aquí solo se arma la data cruda que necesita (DEMO vs Supabase).
export async function getStockSugerido(materialId: string): Promise<StockSugerido> {
  if (DEMO) {
    const salidas = store
      .getMovimientosDeMaterial(materialId)
      .filter((m) => m.tipo === "salida")
      .map((m) => ({ cantidad: m.cantidad, created_at: m.created_at }));
    const comprasRecibidas = store
      .getCasosCompra()
      .filter((c) => c.material_id === materialId && c.estado === "recibido")
      .map((c) => ({ created_at: c.created_at, updated_at: c.updated_at }));
    return calcularStockSugerido({ salidas, comprasRecibidas });
  }

  const supabase = await createClient();
  const [{ data: salidas }, { data: comprasRecibidas }] = await Promise.all([
    supabase
      .from("movimientos")
      .select("cantidad, created_at")
      .eq("material_id", materialId)
      .eq("tipo", "salida"),
    supabase
      .from("casos_compra")
      .select("created_at, updated_at")
      .eq("material_id", materialId)
      .eq("estado", "recibido"),
  ]);

  return calcularStockSugerido({
    salidas: salidas ?? [],
    comprasRecibidas: comprasRecibidas ?? [],
  });
}

// Cantidad económica de pedido (ver lib/eoq.ts) — el costo_unitario se
// recibe como parámetro porque quien llama (el formulario de cotización)
// ya lo tiene del material cargado, sin necesidad de otra consulta.
export async function getEOQ(
  materialId: string,
  costoUnitario: number
): Promise<ResultadoEOQ> {
  if (DEMO) {
    const salidas = store
      .getMovimientosDeMaterial(materialId)
      .filter((m) => m.tipo === "salida")
      .map((m) => ({ cantidad: m.cantidad, created_at: m.created_at }));
    return calcularEOQ({ salidas, costoUnitario });
  }

  const supabase = await createClient();
  const { data: salidas } = await supabase
    .from("movimientos")
    .select("cantidad, created_at")
    .eq("material_id", materialId)
    .eq("tipo", "salida");

  return calcularEOQ({ salidas: salidas ?? [], costoUnitario });
}

// Ventana de salidas para clasificar TODOS los materiales de una sola vez —
// mismo default que calcularDemandaDiaria (90 días), acotado aquí para no
// traer el historial completo de salidas de toda la empresa en una consulta.
const VENTANA_DIAS_CLASIFICACION = 90;

export interface MaterialParaClasificar {
  id: string;
  nombre: string;
  sku: string | null;
  costo_unitario: number;
}

// Data cruda para lib/clasificacion-abc-xyz.ts: materiales activos + sus
// salidas recientes agrupadas por material_id, en un solo par de consultas
// (nada de N llamadas por material).
export async function getDatosClasificacionABCXYZ(): Promise<{
  materiales: MaterialParaClasificar[];
  salidasPorMaterial: Record<string, { cantidad: number; created_at: string }[]>;
}> {
  const materialesCompletos = await getMateriales();
  const materiales = materialesCompletos.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    sku: m.sku,
    costo_unitario: m.costo_unitario,
  }));

  let salidas: { material_id: string; cantidad: number; created_at: string }[];
  if (DEMO) {
    salidas = store.getSalidas();
  } else {
    const supabase = await createClient();
    const desde = new Date(
      Date.now() - VENTANA_DIAS_CLASIFICACION * 86400000
    ).toISOString();
    const { data } = await supabase
      .from("movimientos")
      .select("material_id, cantidad, created_at")
      .eq("tipo", "salida")
      .gte("created_at", desde);
    salidas = (data as typeof salidas) ?? [];
  }

  const salidasPorMaterial: Record<
    string,
    { cantidad: number; created_at: string }[]
  > = {};
  for (const s of salidas) {
    (salidasPorMaterial[s.material_id] ??= []).push({
      cantidad: s.cantidad,
      created_at: s.created_at,
    });
  }

  return { materiales, salidasPorMaterial };
}

export interface MaterialClasificado extends ItemClasificado {
  nombre: string;
  sku: string | null;
}

// Junta la data cruda (arriba) con el cálculo puro (lib/clasificacion-abc-xyz.ts)
// y le pega nombre/sku de vuelta — lo único que hace falta para pintar la tabla.
export async function getClasificacionABCXYZ(): Promise<MaterialClasificado[]> {
  const { materiales, salidasPorMaterial } = await getDatosClasificacionABCXYZ();
  const clasificados = clasificarABCXYZ(
    materiales.map((m) => ({
      materialId: m.id,
      costoUnitario: m.costo_unitario,
      salidas: salidasPorMaterial[m.id] ?? [],
    }))
  );
  const porId = new Map(materiales.map((m) => [m.id, m]));
  return clasificados.map((c) => ({
    ...c,
    nombre: porId.get(c.materialId)?.nombre ?? "—",
    sku: porId.get(c.materialId)?.sku ?? null,
  }));
}

// Tope de compras recibidas consideradas para el scorecard — mismo criterio
// de "no traer el historial completo desde el origen" que
// getHistorialPreciosTodos; para el tamaño de empresa que usa esta app, con
// esto sobra para promediar desempeño de proveedores.
const LIMITE_RECIBIDOS_SCORECARD = 3000;

export interface ScorecardProveedorConNombre extends ScorecardProveedor {
  nombre: string;
  diasEntregaDeclarado: number | null;
}

// Junta compras YA recibidas + convenios activos (precio/entrega pactados)
// + el declarado general del proveedor (respaldo si no hay convenio) y le
// pasa todo resuelto a lib/scorecard-proveedores.ts, que solo agrega — la
// resolución "convenio gana sobre declarado" vive en un solo lugar (acá).
export async function getScorecardProveedores(): Promise<ScorecardProveedorConNombre[]> {
  const [proveedores, convenios] = await Promise.all([getProveedores(), getConvenios()]);

  let recibidos: {
    proveedor_id: string | null;
    material_id: string | null;
    created_at: string;
    updated_at: string;
    monto_estimado: number;
    cantidad_estimada: number | null;
  }[];
  if (DEMO) {
    recibidos = store.getCasosCompra().filter((c) => c.estado === "recibido");
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("casos_compra")
      .select("proveedor_id, material_id, created_at, updated_at, monto_estimado, cantidad_estimada")
      .eq("estado", "recibido")
      .order("updated_at", { ascending: false })
      .limit(LIMITE_RECIBIDOS_SCORECARD);
    recibidos = data ?? [];
  }

  const declaradoPorProveedor = new Map(
    proveedores.map((p) => [p.id, p.dias_entrega_declarado])
  );
  const convenioPorProveedorMaterial = new Map(
    convenios
      .filter((c) => c.activo)
      .map((c) => [`${c.proveedor_id}:${c.material_id}`, c])
  );

  const casosParaScorecard: CasoRecibidoParaScorecard[] = recibidos
    .filter((c): c is typeof c & { proveedor_id: string } => c.proveedor_id !== null)
    .map((c) => {
      const convenio = c.material_id
        ? convenioPorProveedorMaterial.get(`${c.proveedor_id}:${c.material_id}`)
        : undefined;
      return {
        proveedorId: c.proveedor_id,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        montoEstimado: c.monto_estimado,
        cantidadEstimada: c.cantidad_estimada,
        diasEntregaComprometido:
          convenio?.dias_entrega_pactado ?? declaradoPorProveedor.get(c.proveedor_id) ?? null,
        precioPactado: convenio?.precio_pactado ?? null,
      };
    });

  const scorePorProveedor = calcularScorecardProveedores(casosParaScorecard);

  return proveedores.map((p) => {
    const s = scorePorProveedor[p.id];
    return {
      proveedorId: p.id,
      nombre: p.nombre,
      diasEntregaDeclarado: p.dias_entrega_declarado,
      numPedidosRecibidos: s?.numPedidosRecibidos ?? 0,
      valorTotalRecibido: s?.valorTotalRecibido ?? 0,
      leadTimePromedioDias: s?.leadTimePromedioDias ?? null,
      cumplimientoEntrega: s?.cumplimientoEntrega ?? null,
      cumplimientoPrecio: s?.cumplimientoPrecio ?? null,
      scoreGeneral: s?.scoreGeneral ?? null,
    };
  });
}

export interface FuenteDemandaConNombre {
  tipo: "venta_directa" | "produccion_derivada";
  cantidad: number;
  productoOrigenNombre?: string;
}

export interface RequerimientoMRPConNombre extends Omit<RequerimientoMRP, "fuentes"> {
  nombre: string;
  sku: string | null;
  unidad: string;
  fuentes: FuenteDemandaConNombre[];
}

export interface ResultadoMRPConNombres {
  requerimientos: RequerimientoMRPConNombre[];
  materialesConCicloBOM: string[];
}

// Corrida MRP: junta demanda directa (getComprometido — ventas
// confirmadas/en producción + salidas pendientes) con el grafo completo de
// BOM, y la neta contra stock + por llegar en una sola pasada (lib/mrp.ts
// hace el trabajo real; aquí solo se junta la data cruda, igual que el
// resto de este archivo).
export async function getCorridaMRP(): Promise<ResultadoMRPConNombres> {
  const [materiales, comprometido, porLlegar, enTransito] = await Promise.all([
    getMateriales(),
    getComprometido(),
    getPorLlegar(),
    getEnTransito(),
  ]);

  let bomRaw: { producto_id: string; componente_id: string; cantidad_por_unidad: number }[];
  if (DEMO) {
    bomRaw = store.getBomItemsTodos();
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("bom_items")
      .select("producto_id, componente_id, cantidad_por_unidad");
    bomRaw = data ?? [];
  }

  const materialesParaMRP: MaterialParaMRP[] = materiales.map((m) => ({
    materialId: m.id,
    demandaDirecta: comprometido[m.id] ?? 0,
    stockActual: m.stock_actual,
    // "Ya está en camino" incluye lo comprado (por llegar de proveedores)
    // Y lo que ya salió de otra de nuestras ubicaciones pero no ha llegado
    // a la suya (en tránsito) — ambos son oferta futura real para el MRP.
    porLlegar: (porLlegar[m.id] ?? 0) + (enTransito[m.id] ?? 0),
  }));
  const bom: BomEdge[] = bomRaw.map((b) => ({
    productoId: b.producto_id,
    componenteId: b.componente_id,
    cantidadPorUnidad: b.cantidad_por_unidad,
  }));

  const resultado = correrMRP(materialesParaMRP, bom);
  const porId = new Map(materiales.map((m) => [m.id, m]));

  const requerimientos: RequerimientoMRPConNombre[] = resultado.requerimientos
    .map((r) => {
      const m = porId.get(r.materialId);
      return {
        ...r,
        nombre: m?.nombre ?? "(material eliminado)",
        sku: m?.sku ?? null,
        unidad: m?.unidad ?? "",
        fuentes: r.fuentes.map((f) => ({
          tipo: f.tipo,
          cantidad: f.cantidad,
          productoOrigenNombre: f.productoOrigenId
            ? (porId.get(f.productoOrigenId)?.nombre ?? "(material eliminado)")
            : undefined,
        })),
      };
    })
    // Solo lo que la corrida realmente tocó: con requerimiento, con
    // demanda (aunque ya esté cubierta — vale mostrarlo), o con ciclo
    // detectado. El resto del catálogo no aporta nada a esta vista.
    .filter((r) => r.requerimientoNeto > 0 || r.demandaBruta > 0 || r.cicloDetectado)
    .sort((a, b) => b.requerimientoNeto - a.requerimientoNeto);

  return { requerimientos, materialesConCicloBOM: resultado.materialesConCicloBOM };
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

const LIMITE_BUSQUEDA_MOVIMIENTOS = 150;

export interface FiltrosMovimientos {
  // Nombre de material o SKU — ambos snapshoteados en el propio
  // movimiento (historial autónomo), no hace falta el join para buscar.
  q?: string;
  referencia?: string; // identificador de caso (OC-xxxx, TRAS-xxxx, CONT-xxxx...)
  cantidad?: number;
  usuarioId?: string;
  ubicacionId?: string;
  fecha?: string; // YYYY-MM-DD, un solo día
}

// Búsqueda de movimientos (/movimientos): a diferencia de
// getMovimientosRecientes (los N más nuevos, sin filtro), esta SÍ busca
// contra el historial completo del lado del servidor — filtrar solo los
// últimos 150 ya cargados no encontraría un movimiento de hace un mes.
export async function buscarMovimientos(
  filtros: FiltrosMovimientos = {}
): Promise<MovimientoConRelaciones[]> {
  if (DEMO) return store.buscarMovimientos(filtros);
  const supabase = await createClient();
  let query = supabase
    .from("movimientos")
    .select(
      "*, materiales(id,nombre,sku,unidad), profiles(id,nombre), ubicaciones(id,nombre)"
    )
    .order("created_at", { ascending: false })
    .limit(LIMITE_BUSQUEDA_MOVIMIENTOS);

  if (filtros.q?.trim()) {
    // Contra las columnas normalizadas (sin acentos, minúsculas — ver
    // migración 0030) para que "silicon" encuentre "Silicón" igual que ya
    // pasa en las búsquedas del lado del cliente (normalizarTexto).
    // ',', '(' y ')' son sintaxis del filtro .or() de PostgREST — se
    // quitan del término para que no rompan la expresión.
    const q = normalizarTexto(filtros.q).replace(/[,()]/g, "");
    if (q)
      query = query.or(
        `material_nombre_normalizado.ilike.%${q}%,material_sku_normalizado.ilike.%${q}%`
      );
  }
  if (filtros.referencia?.trim()) {
    query = query.ilike("referencia", `%${filtros.referencia.trim().replace(/[%_]/g, "")}%`);
  }
  if (filtros.cantidad != null && Number.isFinite(filtros.cantidad)) {
    query = query.eq("cantidad", filtros.cantidad);
  }
  if (filtros.usuarioId) query = query.eq("usuario_id", filtros.usuarioId);
  if (filtros.ubicacionId) query = query.eq("ubicacion_id", filtros.ubicacionId);
  if (filtros.fecha) {
    const inicio = new Date(`${filtros.fecha}T00:00:00`);
    const fin = new Date(`${filtros.fecha}T23:59:59.999`);
    query = query.gte("created_at", inicio.toISOString()).lte("created_at", fin.toISOString());
  }

  const { data } = await query;
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
    // Sin cron en demo: la generación automática de casos se engancha aquí,
    // igual que la sincronización de alertas (ver lib/casos-automaticos.ts).
    store.generarCasosAutomaticosPorStockBajo();
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

// Por defecto, las listas de casos (compra/venta) y salidas pendientes solo
// traen lo abierto + lo cerrado reciente — no TODO el histórico desde el
// origen. En una app de "muchas transacciones" esa tabla solo crece, y sin
// esto cada carga de /proveedores o /clientes se pondría más lenta con el
// tiempo. `todos: true` quita el filtro (link "Ver todos" en la UI).
const DIAS_HISTORICO_DEFECTO = 90;
const CASO_COMPRA_ABIERTO = ["pendiente", "cotizando", "por_autorizar", "ordenado"];
const CASO_VENTA_ABIERTO = ["cotizacion", "confirmado", "en_produccion"];

function fechaCorteHistorico(): string {
  return new Date(Date.now() - DIAS_HISTORICO_DEFECTO * 86400000).toISOString();
}

export async function getCasosCompra(
  opts: { todos?: boolean } = {}
): Promise<CasoCompraConRelaciones[]> {
  if (DEMO) {
    const casos = store.getCasosCompra();
    if (opts.todos) return casos;
    const corte = fechaCorteHistorico();
    return casos.filter(
      (c) => CASO_COMPRA_ABIERTO.includes(c.estado) || c.updated_at >= corte
    );
  }
  const supabase = await createClient();
  // El nombre del FK es obligatorio aquí: casos_compra <-> solicitudes_compra
  // tiene DOS relaciones (solicitud_id, y la inversa cotizacion_ganadora_id),
  // así que PostgREST no puede adivinar cuál embeber sin que se lo digamos.
  let query = supabase
    .from("casos_compra")
    .select(
      "*, proveedores(id,nombre), materiales(id,nombre,sku,unidad), solicitudes_compra!casos_compra_solicitud_id_fkey(codigo)"
    );
  if (!opts.todos) {
    query = query.or(
      `estado.in.(${CASO_COMPRA_ABIERTO.join(",")}),updated_at.gte.${fechaCorteHistorico()}`
    );
  }
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) console.error("getCasosCompra:", error.message);
  return (data as CasoCompraConRelaciones[]) ?? [];
}

export async function getConvenios(): Promise<ConvenioConRelaciones[]> {
  if (DEMO) return store.getConvenios();
  const supabase = await createClient();
  const { data } = await supabase
    .from("convenios_proveedor")
    .select("*, proveedores(id,nombre), materiales(id,nombre,sku,unidad)")
    .order("created_at", { ascending: false });
  return (data as ConvenioConRelaciones[]) ?? [];
}

// Solicitud de compra + sus cotizaciones (una por proveedor) para el modal
// de comparación — components/caso-detalle-modal.tsx.
export async function getSolicitudConCasos(
  solicitudId: string
): Promise<SolicitudCompraConRelaciones | null> {
  if (DEMO) return store.getSolicitudConCasos(solicitudId);
  const supabase = await createClient();
  const [{ data: solicitud }, { data: casos }] = await Promise.all([
    supabase.from("solicitudes_compra").select("*").eq("id", solicitudId).single(),
    supabase
      .from("casos_compra")
      .select("*, proveedores(id,nombre), materiales(id,nombre,sku,unidad)")
      .eq("solicitud_id", solicitudId),
  ]);
  if (!solicitud) return null;
  return {
    ...(solicitud as SolicitudCompra),
    casos: (casos as CasoCompraConRelaciones[]) ?? [],
  };
}

// Todas las solicitudes "abierta" con sus cotizaciones — dos consultas
// planas (solicitudes + casos hijos vía .in()) en vez de una por
// solicitud, mismo criterio de "no N+1" que el resto del archivo. Para la
// bandeja de aprobaciones unificada (/aprobaciones).
export async function getSolicitudesAbiertas(): Promise<SolicitudCompraConRelaciones[]> {
  if (DEMO) return store.getSolicitudesAbiertas();
  const supabase = await createClient();
  const { data: solicitudes } = await supabase
    .from("solicitudes_compra")
    .select("*")
    .eq("estado", "abierta");
  if (!solicitudes || solicitudes.length === 0) return [];

  const ids = solicitudes.map((s) => s.id);
  const { data: casos } = await supabase
    .from("casos_compra")
    .select("*, proveedores(id,nombre), materiales(id,nombre,sku,unidad)")
    .in("solicitud_id", ids);

  const casosPorSolicitud = new Map<string, CasoCompraConRelaciones[]>();
  for (const c of (casos as CasoCompraConRelaciones[]) ?? []) {
    if (!c.solicitud_id) continue;
    (casosPorSolicitud.get(c.solicitud_id) ?? casosPorSolicitud.set(c.solicitud_id, []).get(c.solicitud_id)!).push(c);
  }

  return (solicitudes as SolicitudCompra[]).map((s) => ({
    ...s,
    casos: casosPorSolicitud.get(s.id) ?? [],
  }));
}

// Timeline de un caso (components/caso-timeline.tsx).
export async function getEventosCaso(casoId: string): Promise<CasoCompraEvento[]> {
  if (DEMO) return store.getEventosCaso(casoId);
  const supabase = await createClient();
  const { data } = await supabase
    .from("casos_compra_eventos")
    .select("*")
    .eq("caso_compra_id", casoId)
    .order("created_at", { ascending: true });
  return (data as CasoCompraEvento[]) ?? [];
}

/* ---------------- Portal de clientes ---------------- */

export async function getClientes(): Promise<Cliente[]> {
  if (DEMO) return store.getClientes();
  const supabase = await createClient();
  const { data } = await supabase.from("clientes").select("*").order("nombre");
  return (data as Cliente[]) ?? [];
}

export async function getCasosVenta(
  opts: { todos?: boolean } = {}
): Promise<CasoVentaConRelaciones[]> {
  if (DEMO) {
    const casos = store.getCasosVenta();
    if (opts.todos) return casos;
    const corte = fechaCorteHistorico();
    return casos.filter(
      (c) => CASO_VENTA_ABIERTO.includes(c.estado) || c.updated_at >= corte
    );
  }
  const supabase = await createClient();
  let query = supabase
    .from("casos_venta")
    .select(
      "*, clientes(id,nombre), items:casos_venta_items(*, materiales(id,nombre,sku,unidad,stock_actual))"
    );
  if (!opts.todos) {
    query = query.or(
      `estado.in.(${CASO_VENTA_ABIERTO.join(",")}),updated_at.gte.${fechaCorteHistorico()}`
    );
  }
  const { data } = await query.order("updated_at", { ascending: false });
  return (data as CasoVentaConRelaciones[]) ?? [];
}

// Timeline de un caso de venta (components/caso-venta-timeline.tsx) — mismo
// patrón que getEventosCaso, tabla propia (casos_venta_eventos).
export async function getEventosCasoVenta(
  casoId: string
): Promise<CasoVentaEvento[]> {
  if (DEMO) return store.getEventosCasoVenta(casoId);
  const supabase = await createClient();
  const { data } = await supabase
    .from("casos_venta_eventos")
    .select("*")
    .eq("caso_venta_id", casoId)
    .order("created_at", { ascending: true });
  return (data as CasoVentaEvento[]) ?? [];
}

export async function getSalidasPendientes(
  opts: { todos?: boolean } = {}
): Promise<SalidaPendienteConRelaciones[]> {
  if (DEMO) {
    const salidas = store.getSalidasPendientes();
    if (opts.todos) return salidas;
    const corte = fechaCorteHistorico();
    return salidas.filter((s) => s.estado === "pendiente" || s.created_at >= corte);
  }
  const supabase = await createClient();
  let query = supabase
    .from("salidas_pendientes")
    .select(
      "*, materiales(id,nombre,sku,unidad,stock_actual), casos_venta(id,titulo,referencia, clientes(nombre))"
    );
  if (!opts.todos) {
    query = query.or(`estado.eq.pendiente,created_at.gte.${fechaCorteHistorico()}`);
  }
  const { data } = await query.order("created_at", { ascending: false });
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

/* ---------------- Conteo cíclico ---------------- */

export async function getConteos(): Promise<Conteo[]> {
  if (DEMO) return store.getConteos();
  const supabase = await createClient();
  const { data } = await supabase
    .from("conteos")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as Conteo[]) ?? [];
}

// Detalle completo (con stock_esperado) — SOLO se llama desde
// lib/actions/conteos.ts -> obtenerConteoDetalle, que decide si el
// resultado que de verdad llega al cliente incluye stock_esperado o no
// (el conteo es a ciegas mientras no esté "aplicado"/"cancelado", o
// "contado" visto por alguien que no es gestor).
export async function getConteo(conteoId: string): Promise<ConteoConItems | null> {
  if (DEMO) return store.getConteo(conteoId);
  const supabase = await createClient();
  const [{ data: conteo }, { data: items }] = await Promise.all([
    supabase.from("conteos").select("*").eq("id", conteoId).single(),
    supabase
      .from("conteo_items")
      .select("*")
      .eq("conteo_id", conteoId)
      .order("material_nombre", { ascending: true }),
  ]);
  if (!conteo) return null;
  return { ...(conteo as Conteo), items: (items as ConteoConItems["items"]) ?? [] };
}

// Todos los conteos ya aplicados, con sus items — a diferencia de
// getConteo() (uno a la vez, para la vista de detalle), este trae el
// lote completo. Lo usa el feed de KPIs de los reportes gerenciales
// (lib/reportes-gerenciales.ts) para saber cuántos tuvieron diferencia
// en un periodo dado; ningún otro llamador necesita hoy "todos de un
// jalón".
export async function getConteosAplicadosConItems(): Promise<ConteoConItems[]> {
  if (DEMO) {
    return store
      .getConteos()
      .filter((c) => c.estado === "aplicado")
      .map((c) => store.getConteo(c.id))
      .filter((c): c is ConteoConItems => c !== null);
  }
  const supabase = await createClient();
  const { data: conteos } = await supabase
    .from("conteos")
    .select("*")
    .eq("estado", "aplicado");
  const lista = (conteos as Conteo[]) ?? [];
  if (lista.length === 0) return [];

  const { data: items } = await supabase
    .from("conteo_items")
    .select("*")
    .in(
      "conteo_id",
      lista.map((c) => c.id)
    );

  const itemsPorConteo = new Map<string, ConteoConItems["items"]>();
  for (const item of (items as ConteoConItems["items"]) ?? []) {
    const acc = itemsPorConteo.get(item.conteo_id) ?? [];
    acc.push(item);
    itemsPorConteo.set(item.conteo_id, acc);
  }

  return lista.map((c) => ({ ...c, items: itemsPorConteo.get(c.id) ?? [] }));
}

/* ---------------- Bloqueo de calidad ---------------- */

export async function getInspeccionesCalidad(): Promise<InspeccionCalidad[]> {
  if (DEMO) return store.getInspeccionesCalidad();
  const supabase = await createClient();
  const { data } = await supabase
    .from("inspecciones_calidad")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as InspeccionCalidad[]) ?? [];
}

/* ---------------- Umbral de autorización ---------------- */

export async function getConfiguracionAutorizacion(): Promise<ConfiguracionAutorizacion> {
  if (DEMO) return store.getConfiguracionAutorizacion();
  const supabase = await createClient();
  const { data } = await supabase
    .from("configuracion_autorizacion")
    .select("monto_umbral_admin, updated_at, updated_por_nombre")
    .eq("id", true)
    .single();
  return (
    (data as ConfiguracionAutorizacion) ?? {
      monto_umbral_admin: 50000,
      updated_at: new Date().toISOString(),
      updated_por_nombre: null,
    }
  );
}
