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
}

export interface MargenMaterial {
  nombre: string;
  sku: string | null;
  costo: number;
  precio: number;
  margen: number;
  margenPct: number;
}

export interface Reportes {
  valorTotal: number;
  comprarAhora: MaterialReporte[];
  dineroParado: MaterialReporte[];
  valorParado: number;
  porCategoria: { nombre: string; valor: number }[];
  porUbicacion: { nombre: string; valor: number }[];
  margenes: MargenMaterial[];
  totalMateriales: number;
}

const DIAS_PARADO = 90;

export async function getReportes(): Promise<Reportes> {
  const [materiales, stockPorUbicacionMap] = await Promise.all([
    getMateriales(),
    getStockPorUbicacionTodos(),
  ]);

  // Última salida por material.
  let salidas: { material_id: string; created_at: string }[] | null;
  if (DEMO) {
    salidas = store.getSalidas();
  } else {
    const supabase = await createClient();
    const { data } = await supabase
      .from("movimientos")
      .select("material_id, created_at")
      .eq("tipo", "salida")
      .order("created_at", { ascending: false });
    salidas = data;
  }

  const ultimaSalidaPorMaterial = new Map<string, string>();
  for (const s of salidas ?? []) {
    if (!ultimaSalidaPorMaterial.has(s.material_id)) {
      ultimaSalidaPorMaterial.set(s.material_id, s.created_at);
    }
  }

  const ahora = Date.now();
  const enriquecidos: MaterialReporte[] = materiales.map((m) => {
    const ultimaSalida = ultimaSalidaPorMaterial.get(m.id) ?? null;
    const diasSinConsumo = ultimaSalida
      ? Math.floor((ahora - new Date(ultimaSalida).getTime()) / 86400000)
      : null;
    return {
      ...m,
      valor: m.stock_actual * m.costo_unitario,
      ultimaSalida,
      diasSinConsumo,
    };
  });

  const valorTotal = enriquecidos.reduce((a, m) => a + m.valor, 0);

  const comprarAhora = enriquecidos
    .filter((m) => nivelStock(m) === "bajo")
    .sort((a, b) => a.stock_actual - a.stock_minimo - (b.stock_actual - b.stock_minimo));

  // Dinero parado: hay stock con valor, pero sin consumo reciente.
  const dineroParado = enriquecidos
    .filter(
      (m) =>
        m.valor > 0 &&
        (m.diasSinConsumo === null || m.diasSinConsumo >= DIAS_PARADO)
    )
    .sort((a, b) => b.valor - a.valor);

  const valorParado = dineroParado.reduce((a, m) => a + m.valor, 0);

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
    dineroParado,
    valorParado,
    porCategoria,
    porUbicacion,
    margenes,
    totalMateriales: materiales.length,
  };
}

export { DIAS_PARADO };
