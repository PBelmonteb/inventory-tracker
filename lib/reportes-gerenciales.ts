// Compone el feed de KPIs para el dashboard gerencial (semanal / mensual /
// trimestral / anual) — ver memoria "dashboard-kpis-gerencial". Puro
// trabajo de composición, mismo patrón que lib/inicio.ts: cada pieza
// (getReportes, getScorecardProveedores, getClasificacionABCXYZ,
// getCorridaMRP, getCasosCompra, getCasosVenta) ya existía; esto solo las
// junta y les agrega el recorte "qué pasó en este periodo" donde aplica —
// lib/reportes-periodo.ts hace ese cálculo puro.
//
// Nace del plan original de reportes en PDF narrados por IA (memoria
// "reportes-gerenciales-ia-diseno", nunca se construyó — bloqueado en una
// plantilla que no llegó). `getKPIsPeriodo` (un solo periodo) se queda tal
// cual por si algo más lo necesita; `getTendenciaKPIs` (abajo) es la pieza
// nueva para el dashboard, que sí necesita varios periodos consecutivos.

import { getReportes } from "@/lib/reportes";
import {
  getCasosCompra,
  getCasosVenta,
  getConteosAplicadosConItems,
  getScorecardProveedores,
  getClasificacionABCXYZ,
  getCorridaMRP,
  type ScorecardProveedorConNombre,
} from "@/lib/data";
import {
  rangoPeriodo,
  rangosPeriodo,
  resumenComprasPeriodo,
  resumenVentasPeriodo,
  resumenConteosPeriodo,
  resumenClasificacionABCXYZ,
  type TipoReporte,
  type ResumenCompras,
  type ResumenVentas,
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

export interface PuntoTendencia {
  periodoInicio: string; // YYYY-MM-DD, inclusivo
  periodoFin: string; // YYYY-MM-DD, exclusivo
  compras: ResumenCompras;
  ventas: ResumenVentas;
  conteos: ResumenConteos;
}

/**
 * Tendencia de `cantidad` periodos consecutivos ya completados (más
 * antiguo primero) — para el dashboard de KPIs. A diferencia de llamar
 * `getKPIsPeriodo` N veces, trae `casos_compra`/`casos_venta`/conteos
 * UNA SOLA VEZ y calcula los N resúmenes localmente sobre los mismos
 * datos — evita repetir la consulta más pesada N veces solo porque
 * cambia el rango de fechas con el que se filtra en memoria.
 */
export async function getTendenciaKPIs(
  tipo: TipoReporte,
  cantidad: number,
  referencia: Date = new Date()
): Promise<PuntoTendencia[]> {
  const rangos = rangosPeriodo(tipo, cantidad, referencia);

  const [casosCompra, casosVenta, conteosAplicados] = await Promise.all([
    getCasosCompra({ todos: true }),
    getCasosVenta({ todos: true }),
    getConteosAplicadosConItems(),
  ]);

  const comprasParaResumen = casosCompra.map((c) => ({
    estado: c.estado,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    montoEstimado: c.monto_estimado,
  }));
  const ventasParaResumen = casosVenta.map((c) => ({
    estado: c.estado,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    monto: c.monto,
  }));
  const conteosParaResumen = conteosAplicados.map((c) => ({
    estado: c.estado,
    aplicadoAt: c.aplicado_at,
    items: c.items.map((it) => ({
      stockEsperado: it.stock_esperado,
      cantidadContada: it.cantidad_contada,
    })),
  }));

  return rangos.map((rango) => ({
    periodoInicio: formatoFecha(rango.inicio),
    periodoFin: formatoFecha(rango.fin),
    compras: resumenComprasPeriodo(comprasParaResumen, rango),
    ventas: resumenVentasPeriodo(ventasParaResumen, rango),
    conteos: resumenConteosPeriodo(conteosParaResumen, rango),
  }));
}
