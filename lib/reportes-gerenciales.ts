// Compone el "feed" de KPIs para los reportes gerenciales automáticos
// (semanal / mensual / trimestral) — ver memoria
// "reportes-gerenciales-ia-diseno". Puro trabajo de composición, mismo
// patrón que lib/inicio.ts: cada pieza (getReportes,
// getScorecardProveedores, getClasificacionABCXYZ, getCorridaMRP,
// getCasosCompra) ya existía; esto solo las junta y les agrega el
// recorte "qué pasó en este periodo" donde aplica — lib/reportes-periodo.ts
// hace ese cálculo puro.
//
// Todavía NO llama a ninguna IA ni genera el PDF — eso queda pendiente de
// que el usuario traiga la plantilla mock y decida poner la Anthropic
// API key. Este módulo solo arma el JSON que se le pasaría.

import { getReportes } from "@/lib/reportes";
import {
  getCasosCompra,
  getConteosAplicadosConItems,
  getScorecardProveedores,
  getClasificacionABCXYZ,
  getCorridaMRP,
  type ScorecardProveedorConNombre,
} from "@/lib/data";
import {
  rangoPeriodo,
  resumenComprasPeriodo,
  resumenConteosPeriodo,
  resumenClasificacionABCXYZ,
  type TipoReporte,
  type ResumenCompras,
  type ResumenConteos,
} from "@/lib/reportes-periodo";

function formatoFecha(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface KPIsPeriodo {
  tipo: TipoReporte;
  periodoInicio: string; // YYYY-MM-DD, inclusivo
  periodoFin: string; // YYYY-MM-DD, exclusivo
  inventario: {
    valorTotal: number;
    valorParado: number;
    materialesStockBajo: number;
    totalMateriales: number;
  };
  compras: ResumenCompras;
  conteos: ResumenConteos;
  mrpAccionesPendientes: number;
  scorecardProveedores: ScorecardProveedorConNombre[];
  // Cuenta por combinación (AX, CZ, etc.) en vez de la lista completa de
  // materiales — mismo criterio de "resumen agregado, no dump crudo" que
  // se decidió para controlar el costo de la IA.
  clasificacionABCXYZResumen: Record<string, number>;
}

/**
 * Arma el feed completo de KPIs para un tipo de reporte, listo para
 * pasarle a la IA cuando esa parte se construya. `referencia` es el
 * "ahora" desde el que se cuenta el periodo ya completado (por defecto,
 * la fecha real) — parametrizable para poder generar un reporte de un
 * periodo pasado a mano.
 */
export async function getKPIsPeriodo(
  tipo: TipoReporte,
  referencia: Date = new Date()
): Promise<KPIsPeriodo> {
  const rango = rangoPeriodo(tipo, referencia);

  const [reportes, scorecard, clasificacion, mrp, casos, conteosAplicados] = await Promise.all([
    getReportes(),
    getScorecardProveedores(),
    getClasificacionABCXYZ(),
    getCorridaMRP(),
    getCasosCompra({ todos: true }),
    getConteosAplicadosConItems(),
  ]);

  const compras = resumenComprasPeriodo(
    casos.map((c) => ({
      estado: c.estado,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      montoEstimado: c.monto_estimado,
    })),
    rango
  );

  const conteos = resumenConteosPeriodo(
    conteosAplicados.map((c) => ({
      estado: c.estado,
      aplicadoAt: c.aplicado_at,
      items: c.items.map((it) => ({
        stockEsperado: it.stock_esperado,
        cantidadContada: it.cantidad_contada,
      })),
    })),
    rango
  );

  const mrpAccionesPendientes = mrp.requerimientos.filter((r) => r.accion !== "ninguna").length;

  return {
    tipo,
    periodoInicio: formatoFecha(rango.inicio),
    periodoFin: formatoFecha(rango.fin),
    inventario: {
      valorTotal: reportes.valorTotal,
      valorParado: reportes.valorParado,
      materialesStockBajo: reportes.comprarAhora.length,
      totalMateriales: reportes.totalMateriales,
    },
    compras,
    conteos,
    mrpAccionesPendientes,
    scorecardProveedores: scorecard,
    clasificacionABCXYZResumen: resumenClasificacionABCXYZ(clasificacion),
  };
}
