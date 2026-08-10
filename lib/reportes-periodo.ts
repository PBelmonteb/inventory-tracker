// Cálculo puro para el dashboard de KPIs gerencial (semanal / mensual /
// trimestral / anual) — ver memoria "dashboard-kpis-gerencial". Solo arma
// el RANGO de fechas y agrega lo que ya trae lib/data.ts en crudo; no
// vuelve a calcular nada que ya exista (getReportes,
// getScorecardProveedores, getClasificacionABCXYZ, getCorridaMRP siguen
// siendo la fuente — esto solo les agrega la vista "qué pasó en este
// periodo" cuando el dato lo permite).
//
// Nace del plan original de reportes en PDF narrados por IA (ver memoria
// "reportes-gerenciales-ia-diseno") — se abandonó el PDF/IA a favor de un
// dashboard interactivo en pantalla, pero este feed de KPIs por periodo
// se reusa tal cual.

import type { ClaseABC, ClaseXYZ } from "@/lib/clasificacion-abc-xyz";

export type TipoReporte = "semanal" | "mensual" | "trimestral" | "anual";

export interface RangoPeriodo {
  inicio: Date; // inclusivo
  fin: Date; // exclusivo
}

const MS_POR_DIA = 1000 * 60 * 60 * 24;
const MS_POR_HORA = 1000 * 60 * 60;

function inicioDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function inicioSemana(d: Date): Date {
  // Lunes como primer día de la semana (0=domingo en JS -> se recorre a 6).
  const dia = inicioDia(d);
  const offset = (dia.getDay() + 6) % 7;
  return new Date(dia.getTime() - offset * MS_POR_DIA);
}

function inicioMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function inicioTrimestre(d: Date): Date {
  const trimestre = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), trimestre * 3, 1);
}

function inicioAno(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

function enRango(iso: string, rango: RangoPeriodo): boolean {
  const t = new Date(iso).getTime();
  return t >= rango.inicio.getTime() && t < rango.fin.getTime();
}

/**
 * Rango del período YA COMPLETADO más reciente respecto a `referencia`
 * (nunca incluye el período en curso) — así el reporte que corre el
 * lunes cubre la semana pasada completa, y el del día 1 cubre el mes que
 * acaba de cerrar, alineado a calendario (no "últimos N días").
 */
export function rangoPeriodo(
  tipo: TipoReporte,
  referencia: Date = new Date()
): RangoPeriodo {
  if (tipo === "semanal") {
    const finSemanaActual = inicioSemana(referencia);
    return {
      inicio: new Date(finSemanaActual.getTime() - 7 * MS_POR_DIA),
      fin: finSemanaActual,
    };
  }
  if (tipo === "mensual") {
    const inicioMesActual = inicioMes(referencia);
    const inicioMesAnterior = new Date(
      inicioMesActual.getFullYear(),
      inicioMesActual.getMonth() - 1,
      1
    );
    return { inicio: inicioMesAnterior, fin: inicioMesActual };
  }
  if (tipo === "trimestral") {
    const inicioTrimActual = inicioTrimestre(referencia);
    const inicioTrimAnterior = new Date(
      inicioTrimActual.getFullYear(),
      inicioTrimActual.getMonth() - 3,
      1
    );
    return { inicio: inicioTrimAnterior, fin: inicioTrimActual };
  }
  // anual
  const inicioAnoActual = inicioAno(referencia);
  const inicioAnoAnterior = new Date(inicioAnoActual.getFullYear() - 1, 0, 1);
  return { inicio: inicioAnoAnterior, fin: inicioAnoActual };
}

/**
 * `cantidad` periodos consecutivos ya completados, terminando en el más
 * reciente respecto a `referencia` — más antiguo primero. Encadena
 * `rangoPeriodo` hacia atrás (usa el inicio de cada rango como nueva
 * referencia) en vez de reinventar la aritmética de calendario.
 */
export function rangosPeriodo(
  tipo: TipoReporte,
  cantidad: number,
  referencia: Date = new Date()
): RangoPeriodo[] {
  const rangos: RangoPeriodo[] = [];
  let ref = referencia;
  for (let i = 0; i < cantidad; i++) {
    const rango = rangoPeriodo(tipo, ref);
    rangos.unshift(rango);
    ref = rango.inicio;
  }
  return rangos;
}

/* ---------------- Compras del periodo ---------------- */

export interface CasoCompraParaResumen {
  estado: string;
  createdAt: string;
  updatedAt: string;
  montoEstimado: number;
}

export interface ResumenCompras {
  casosCreados: number;
  casosAutorizados: number;
  casosRechazados: number;
  montoTotalAutorizado: number;
  tiempoPromedioAutorizacionHoras: number | null;
}

// "Autorizado" no es un estado literal (ver EstadoCasoCompra) — es la
// transición por_autorizar -> ordenado/recibido. No hay columna
// "fecha_autorizado", así que se usa updated_at como proxy de cuándo
// salió de pendiente — mismo criterio que ya usa
// lib/scorecard-proveedores.ts para leadTimePromedioDias (createdAt ->
// updatedAt), no se inventa un criterio nuevo.
export function resumenComprasPeriodo(
  casos: CasoCompraParaResumen[],
  rango: RangoPeriodo
): ResumenCompras {
  const casosCreados = casos.filter((c) => enRango(c.createdAt, rango)).length;

  const autorizados = casos.filter(
    (c) =>
      (c.estado === "ordenado" || c.estado === "recibido") &&
      enRango(c.updatedAt, rango)
  );
  const rechazados = casos.filter(
    (c) => c.estado === "rechazado" && enRango(c.updatedAt, rango)
  );

  const montoTotalAutorizado = autorizados.reduce((a, c) => a + c.montoEstimado, 0);

  const tiempos = autorizados.map(
    (c) => (new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime()) / MS_POR_HORA
  );
  const tiempoPromedioAutorizacionHoras =
    tiempos.length > 0 ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : null;

  return {
    casosCreados,
    casosAutorizados: autorizados.length,
    casosRechazados: rechazados.length,
    montoTotalAutorizado,
    tiempoPromedioAutorizacionHoras,
  };
}

/* ---------------- Ventas del periodo ---------------- */

export interface CasoVentaParaResumen {
  estado: string;
  createdAt: string;
  updatedAt: string;
  monto: number;
}

export interface ResumenVentas {
  casosCreados: number;
  casosEntregados: number;
  casosRechazados: number;
  montoEntregado: number;
}

// A diferencia de casos_compra (donde "ordenado"/"recibido" solo se
// alcanzan vía autorización, nunca como estado inicial), en casos_venta
// "cotizacion" es el estado inicial normal para la mayoría de los casos
// (los que crea gestor/ventas directo) — filtrar por
// estado==="cotizacion" && updated_at contaría de más cualquier edición
// menor. "rechazado" y "entregado" sí son estados inequívocos (solo se
// llega ahí vía una acción explícita), así que el resumen mide throughput
// e ingresos cerrados en vez de forzar el concepto de "velocidad de
// autorización" de compras, que en ventas solo aplica a la minoría de
// casos creados por operario (ese detalle vive mejor en /aprobaciones,
// en tiempo real, que en una tendencia mensual).
export function resumenVentasPeriodo(
  casos: CasoVentaParaResumen[],
  rango: RangoPeriodo
): ResumenVentas {
  const casosCreados = casos.filter((c) => enRango(c.createdAt, rango)).length;

  const entregados = casos.filter(
    (c) => c.estado === "entregado" && enRango(c.updatedAt, rango)
  );
  const rechazados = casos.filter(
    (c) => c.estado === "rechazado" && enRango(c.updatedAt, rango)
  );

  const montoEntregado = entregados.reduce((a, c) => a + c.monto, 0);

  return {
    casosCreados,
    casosEntregados: entregados.length,
    casosRechazados: rechazados.length,
    montoEntregado,
  };
}

/* ---------------- Conteos cíclicos del periodo ---------------- */

export interface ConteoParaResumen {
  estado: string;
  aplicadoAt: string | null;
  items: { stockEsperado: number; cantidadContada: number | null }[];
}

export interface ResumenConteos {
  realizados: number;
  conDiferencia: number;
}

export function resumenConteosPeriodo(
  conteos: ConteoParaResumen[],
  rango: RangoPeriodo
): ResumenConteos {
  const aplicados = conteos.filter(
    (c) => c.estado === "aplicado" && c.aplicadoAt !== null && enRango(c.aplicadoAt, rango)
  );
  const conDiferencia = aplicados.filter((c) =>
    c.items.some(
      (i) => i.cantidadContada !== null && i.cantidadContada !== i.stockEsperado
    )
  ).length;

  return { realizados: aplicados.length, conDiferencia };
}

/* ---------------- Resumen de clasificación ABC/XYZ ---------------- */

// Cuenta por combinación (AX, CZ, etc.) en vez de mandar la lista
// completa de materiales al feed de KPIs — mismo principio de "resumen
// agregado, no dump crudo" que ya se decidió para controlar el costo de
// la IA.
export function resumenClasificacionABCXYZ(
  items: { claseABC: ClaseABC; claseXYZ: ClaseXYZ }[]
): Record<string, number> {
  const conteo: Record<string, number> = {};
  for (const it of items) {
    const clave = `${it.claseABC}${it.claseXYZ}`;
    conteo[clave] = (conteo[clave] ?? 0) + 1;
  }
  return conteo;
}
