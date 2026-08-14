// Catálogo de KPIs del dashboard gerencial — lista fija que el gerente
// activa/desactiva desde la UI (sin fórmulas libres, ver memoria
// "dashboard-kpis-gerencial"). Cada entrada sabe leer su propio valor,
// ya sea de un `PuntoTendencia` (KPIs con historial real por periodo) o
// del snapshot "de hoy" (KPIs sin historial guardado en ningún lado).

import type { PuntoTendencia } from "@/lib/reportes-gerenciales";

export type CategoriaKPI = "compras" | "ventas" | "conteos" | "actual";
export type FormatoKPI = "moneda" | "numero" | "horas";

// Snapshot de "ahora mismo" — no hay dónde se haya guardado el valor de
// ayer/el mes pasado (reconstruirlo de verdad requeriría WAC histórico
// desde movimientos, un proyecto aparte). Se muestran como tarjeta fija,
// nunca como una línea de tendencia (sería una línea plana engañosa).
export interface EstadoActualKPIs {
  valorInventario: number;
  // Valor del inventario en la franja "> 90 días" de la edad de inventario
  // (ver lib/reportes.ts) -- reemplaza al viejo "dinero parado" binario.
  valorEnvejecido: number;
  materialesStockBajo: number;
  mrpAccionesPendientes: number;
}

export interface DefinicionKPI {
  id: string;
  label: string;
  categoria: CategoriaKPI;
  formato: FormatoKPI;
  tendenciable: boolean;
  valorTendencia?: (punto: PuntoTendencia) => number;
  valorActual?: (estado: EstadoActualKPIs) => number;
}

export const CATALOGO_KPIS: DefinicionKPI[] = [
  {
    id: "comprasCreadas",
    label: "Casos de compra creados",
    categoria: "compras",
    formato: "numero",
    tendenciable: true,
    valorTendencia: (p) => p.compras.casosCreados,
  },
  {
    id: "comprasAutorizadas",
    label: "Casos de compra autorizados",
    categoria: "compras",
    formato: "numero",
    tendenciable: true,
    valorTendencia: (p) => p.compras.casosAutorizados,
  },
  {
    id: "comprasRechazadas",
    label: "Casos de compra rechazados",
    categoria: "compras",
    formato: "numero",
    tendenciable: true,
    valorTendencia: (p) => p.compras.casosRechazados,
  },
  {
    id: "comprasMontoAutorizado",
    label: "Monto autorizado (compras)",
    categoria: "compras",
    formato: "moneda",
    tendenciable: true,
    valorTendencia: (p) => p.compras.montoTotalAutorizado,
  },
  {
    id: "comprasTiempoAutorizacion",
    label: "Tiempo de autorización (compras)",
    categoria: "compras",
    formato: "horas",
    tendenciable: true,
    valorTendencia: (p) => p.compras.tiempoPromedioAutorizacionHoras ?? 0,
  },
  {
    id: "ventasCreadas",
    label: "Cotizaciones creadas",
    categoria: "ventas",
    formato: "numero",
    tendenciable: true,
    valorTendencia: (p) => p.ventas.casosCreados,
  },
  {
    id: "ventasEntregadas",
    label: "Casos de venta entregados",
    categoria: "ventas",
    formato: "numero",
    tendenciable: true,
    valorTendencia: (p) => p.ventas.casosEntregados,
  },
  {
    id: "ventasRechazadas",
    label: "Cotizaciones rechazadas",
    categoria: "ventas",
    formato: "numero",
    tendenciable: true,
    valorTendencia: (p) => p.ventas.casosRechazados,
  },
  {
    id: "ventasMontoEntregado",
    label: "Monto entregado (ventas)",
    categoria: "ventas",
    formato: "moneda",
    tendenciable: true,
    valorTendencia: (p) => p.ventas.montoEntregado,
  },
  {
    id: "conteosRealizados",
    label: "Conteos realizados",
    categoria: "conteos",
    formato: "numero",
    tendenciable: true,
    valorTendencia: (p) => p.conteos.realizados,
  },
  {
    id: "conteosConDiferencia",
    label: "Conteos con diferencia",
    categoria: "conteos",
    formato: "numero",
    tendenciable: true,
    valorTendencia: (p) => p.conteos.conDiferencia,
  },
  {
    id: "valorInventario",
    label: "Valor de inventario (hoy)",
    categoria: "actual",
    formato: "moneda",
    tendenciable: false,
    valorActual: (e) => e.valorInventario,
  },
  {
    id: "valorEnvejecido",
    label: "Inventario envejecido (>90 días, hoy)",
    categoria: "actual",
    formato: "moneda",
    tendenciable: false,
    valorActual: (e) => e.valorEnvejecido,
  },
  {
    id: "stockBajo",
    label: "Materiales en stock bajo (hoy)",
    categoria: "actual",
    formato: "numero",
    tendenciable: false,
    valorActual: (e) => e.materialesStockBajo,
  },
  {
    id: "mrpAcciones",
    label: "Acciones MRP pendientes (hoy)",
    categoria: "actual",
    formato: "numero",
    tendenciable: false,
    valorActual: (e) => e.mrpAccionesPendientes,
  },
];

export const KPI_IDS_POR_DEFECTO = [
  "comprasAutorizadas",
  "comprasMontoAutorizado",
  "ventasEntregadas",
  "ventasMontoEntregado",
  "valorInventario",
  "stockBajo",
];

export function obtenerDefinicionKPI(id: string): DefinicionKPI | undefined {
  return CATALOGO_KPIS.find((k) => k.id === id);
}
