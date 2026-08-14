import { createClient } from "@/lib/supabase/server";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import type { MaterialConRelaciones } from "@/lib/types";
import { getMateriales, getStockPorUbicacionTodos } from "@/lib/data";
import { nivelStock } from "@/lib/utils";

export interface MaterialReporte extends MaterialConRelaciones {
  valor: number;
  ultimaSalida: string | null;
  diasSinConsumo: number | null;
  // Edad para "Edad de inventario": diasSinConsumo si lo hay; si el
  // material nunca se ha consumido, días desde su última entrada (para no
  // tratar una compra recién recibida como "envejecida" solo por no tener
  // salidas todavía); si tampoco hay entrada registrada, null -- se cuenta
  // como el más viejo, mismo criterio conservador que ya usaba "dinero
  // parado" para este caso.
  diasEdad: number | null;
}

export interface MargenMaterial {
  nombre: string;
  sku: string | null;
  costo: number;
  precio: number;
  margen: number;
  margenPct: number;
}

export interface RangoEdadInventario {
  rango: string;
  diasDesde: number;
  diasHasta: number | null;
  valor: number;
  cantidadMateriales: number;
  pct: number;
}

export interface Reportes {
  valorTotal: number;
  comprarAhora: MaterialReporte[];
  // Reemplaza al viejo "dinero parado" (un solo corte binario a los 90
  // días) por 4 franjas de antigüedad a costo -- mismo dato de fondo
  // (diasSinConsumo), agrupado distinto.
  edadInventario: RangoEdadInventario[];
  // Material en la franja "> 90 días" -- la tabla/export que antes era
  // "dineroParado" sigue viviendo aquí, solo que ahora es un subconjunto
  // explícito de edadInventario en vez de un cálculo aparte.
  materialesEnvejecidos: MaterialReporte[];
  valorEnvejecido: number;
  porCategoria: { nombre: string; valor: number }[];
  porUbicacion: { nombre: string; valor: number }[];
  margenes: MargenMaterial[];
  totalMateriales: number;
}

const DIAS_PARADO = 90;

const RANGOS_EDAD: { rango: string; diasDesde: number; diasHasta: number | null }[] = [
  { rango: "0–30 días", diasDesde: 0, diasHasta: 30 },
  { rango: "31–60 días", diasDesde: 31, diasHasta: 60 },
  { rango: "61–90 días", diasDesde: 61, diasHasta: DIAS_PARADO },
  { rango: "> 90 días", diasDesde: DIAS_PARADO + 1, diasHasta: null },
];

export async function getReportes(): Promise<Reportes> {
  const [materiales, stockPorUbicacionMap] = await Promise.all([
    getMateriales(),
    getStockPorUbicacionTodos(),
  ]);

  // Última salida (y última entrada, para el fallback de edad) por
  // material — solo importa si fue hace menos de DIAS_PARADO (o no); una
  // vez que pasó ese umbral da igual qué tan viejo sea, así que basta con
  // mirar una ventana (con margen) en vez de traer el historial completo,
  // que en una app de "muchas transacciones" solo crece con el tiempo.
  const VENTANA_DIAS = DIAS_PARADO + 30;
  let salidas: { material_id: string; created_at: string }[] | null;
  let entradas: { material_id: string; created_at: string }[] | null;
  if (DEMO) {
    salidas = store.getSalidas();
    entradas = store.getEntradas();
  } else {
    const supabase = await createClient();
    const desde = new Date(Date.now() - VENTANA_DIAS * 86400000).toISOString();
    const [{ data: salidasData }, { data: entradasData }] = await Promise.all([
      supabase
        .from("movimientos")
        .select("material_id, created_at")
        .eq("tipo", "salida")
        .gte("created_at", desde)
        .order("created_at", { ascending: false }),
      supabase
        .from("movimientos")
        .select("material_id, created_at")
        .eq("tipo", "entrada")
        .gte("created_at", desde)
        .order("created_at", { ascending: false }),
    ]);
    salidas = salidasData;
    entradas = entradasData;
  }

  const ultimaSalidaPorMaterial = new Map<string, string>();
  for (const s of salidas ?? []) {
    if (!ultimaSalidaPorMaterial.has(s.material_id)) {
      ultimaSalidaPorMaterial.set(s.material_id, s.created_at);
    }
  }
  const ultimaEntradaPorMaterial = new Map<string, string>();
  for (const e of entradas ?? []) {
    if (!ultimaEntradaPorMaterial.has(e.material_id)) {
      ultimaEntradaPorMaterial.set(e.material_id, e.created_at);
    }
  }

  const ahora = Date.now();
  const enriquecidos: MaterialReporte[] = materiales.map((m) => {
    const ultimaSalida = ultimaSalidaPorMaterial.get(m.id) ?? null;
    const diasSinConsumo = ultimaSalida
      ? Math.floor((ahora - new Date(ultimaSalida).getTime()) / 86400000)
      : null;

    let diasEdad: number | null;
    if (diasSinConsumo !== null) {
      diasEdad = diasSinConsumo;
    } else {
      const ultimaEntrada = ultimaEntradaPorMaterial.get(m.id) ?? null;
      diasEdad = ultimaEntrada
        ? Math.floor((ahora - new Date(ultimaEntrada).getTime()) / 86400000)
        : null;
    }

    return {
      ...m,
      valor: m.stock_actual * m.costo_unitario,
      ultimaSalida,
      diasSinConsumo,
      diasEdad,
    };
  });

  const valorTotal = enriquecidos.reduce((a, m) => a + m.valor, 0);

  const comprarAhora = enriquecidos
    .filter((m) => nivelStock(m) === "bajo")
    .sort((a, b) => a.stock_actual - a.stock_minimo - (b.stock_actual - b.stock_minimo));

  // Edad de inventario: reparte el valor en stock en 4 franjas por
  // antigüedad. Sin historial de salida NI entrada (diasEdad null) cuenta
  // como el más viejo -- mismo criterio conservador que ya usaba "dinero
  // parado" (mejor sobre-avisar que dejar pasar stock realmente parado).
  const conValor = enriquecidos.filter((m) => m.valor > 0);
  const valorConEdad = conValor.reduce((a, m) => a + m.valor, 0);
  const edadInventario: RangoEdadInventario[] = RANGOS_EDAD.map((r) => {
    const enRango = conValor.filter((m) => {
      const dias = m.diasEdad ?? Infinity;
      return dias >= r.diasDesde && (r.diasHasta === null || dias <= r.diasHasta);
    });
    const valor = enRango.reduce((a, m) => a + m.valor, 0);
    return {
      rango: r.rango,
      diasDesde: r.diasDesde,
      diasHasta: r.diasHasta,
      valor,
      cantidadMateriales: enRango.length,
      pct: valorConEdad > 0 ? (valor / valorConEdad) * 100 : 0,
    };
  });

  const materialesEnvejecidos = conValor
    .filter((m) => (m.diasEdad ?? Infinity) > DIAS_PARADO)
    .sort((a, b) => b.valor - a.valor);
  const valorEnvejecido = materialesEnvejecidos.reduce((a, m) => a + m.valor, 0);

  // Valor por categoría.
  const mapaCat = new Map<string, number>();
  for (const m of enriquecidos) {
    const nombre = m.categorias?.nombre ?? "Sin categoría";
    mapaCat.set(nombre, (mapaCat.get(nombre) ?? 0) + m.valor);
  }
  const porCategoria = [...mapaCat.entries()]
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor);

  // Valor por ubicación: reparte el costo (WAC) de cada material entre sus
  // ubicaciones reales (o su ubicación por defecto si nunca se desglosó).
  const mapaUbic = new Map<string, number>();
  for (const m of enriquecidos) {
    const filas = stockPorUbicacionMap[m.id] ?? [
      {
        ubicacion_id: m.ubicacion_id,
        ubicacion_nombre: m.ubicaciones?.nombre ?? "Sin ubicación",
        stock: m.stock_actual,
      },
    ];
    for (const f of filas) {
      mapaUbic.set(
        f.ubicacion_nombre,
        (mapaUbic.get(f.ubicacion_nombre) ?? 0) + f.stock * m.costo_unitario
      );
    }
  }
  const porUbicacion = [...mapaUbic.entries()]
    .map(([nombre, valor]) => ({ nombre, valor }))
    .sort((a, b) => b.valor - a.valor);

  // Margen por material (solo los que ya tienen precio de venta).
  const margenes: MargenMaterial[] = enriquecidos
    .filter((m) => m.precio_venta > 0)
    .map((m) => {
      const margen = m.precio_venta - m.costo_unitario;
      return {
        nombre: m.nombre,
        sku: m.sku,
        costo: m.costo_unitario,
        precio: m.precio_venta,
        margen,
        margenPct: m.precio_venta > 0 ? (margen / m.precio_venta) * 100 : 0,
      };
    })
    .sort((a, b) => a.margenPct - b.margenPct);

  return {
    valorTotal,
    comprarAhora,
    edadInventario,
    materialesEnvejecidos,
    valorEnvejecido,
    porCategoria,
    porUbicacion,
    margenes,
    totalMateriales: materiales.length,
  };
}

export { DIAS_PARADO };
