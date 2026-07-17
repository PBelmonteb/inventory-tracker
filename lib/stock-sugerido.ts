// Punto de reorden (cuándo pedir) calculado del historial real, en vez de
// que el operario/gestor tenga que adivinar un número para "stock mínimo".
//
//   Punto de reorden = (demanda promedio diaria × tiempo de entrega en días)
//                       + stock de seguridad
//
//   Stock de seguridad = Z × desviación de la demanda diaria × √(tiempo de entrega)
//
// Z = 1.65 cubre ~95% de los casos ante variabilidad de consumo y de tiempos
// de entrega (nivel de servicio fijo por ahora — no configurable por
// material, para no sumar otro campo antes de validar que esto se usa).
//
// Nada de esto reemplaza el "stock mínimo" a la fuerza: si no hay historial
// suficiente, se marca `disponible: false` con la razón, y quien edite el
// material sigue pudiendo capturarlo a mano.

const Z_NIVEL_SERVICIO_95 = 1.65;
const VENTANA_DIAS_DEFECTO = 90;
const MIN_DIAS_HISTORIAL = 14;
const MIN_COMPRAS_PARA_LEAD_TIME = 2;
const MS_POR_DIA = 1000 * 60 * 60 * 24;

export interface DemandaDiaria {
  disponible: boolean;
  razonNoDisponible?: string;
  promedio: number;
  desviacion: number;
  diasHistorial: number;
}

// Compartida entre el punto de reorden (este archivo) y EOQ (lib/eoq.ts) —
// ambos necesitan la misma demanda diaria promedio/desviación, no tiene
// caso calcularla dos veces con lógica distinta.
export function calcularDemandaDiaria(
  salidas: { cantidad: number; created_at: string }[],
  ventanaDias: number = VENTANA_DIAS_DEFECTO,
  ahoraMs: number = Date.now()
): DemandaDiaria {
  // Día calendario absoluto (desde epoch) — evita el desfase de "ahora
  // mismo" (con horas/minutos) contra timestamps de "hace N días exactos"
  // que producía un error de conteo de +/-1 día con floor/ceil relativos.
  const diaAbsoluto = (ms: number) => Math.floor(ms / MS_POR_DIA);

  if (salidas.length === 0) {
    return {
      disponible: false,
      razonNoDisponible: "Sin salidas registradas todavía.",
      promedio: 0,
      desviacion: 0,
      diasHistorial: 0,
    };
  }

  const diaHoy = diaAbsoluto(ahoraMs);
  const primeraSalidaMs = Math.min(
    ...salidas.map((s) => new Date(s.created_at).getTime())
  );
  const diaPrimeraSalida = diaAbsoluto(primeraSalidaMs);
  const diasHistorial = Math.min(ventanaDias, diaHoy - diaPrimeraSalida + 1);

  if (diasHistorial < MIN_DIAS_HISTORIAL) {
    return {
      disponible: false,
      razonNoDisponible: `Solo hay ${Math.max(0, diasHistorial)} días de historial de salidas (se necesitan al menos ${MIN_DIAS_HISTORIAL}).`,
      promedio: 0,
      desviacion: 0,
      diasHistorial,
    };
  }

  // Consumo por día dentro de la ventana efectiva (los días sin salida
  // cuentan como 0 — si no, la variabilidad real del consumo queda
  // subestimada).
  const dias = diasHistorial;
  const inicioDiaVentana = diaHoy - dias + 1;
  const consumoPorDia = new Array(dias).fill(0);
  for (const s of salidas) {
    const diaSalida = diaAbsoluto(new Date(s.created_at).getTime());
    if (diaSalida < inicioDiaVentana) continue;
    const idx = Math.min(dias - 1, Math.max(0, diaSalida - inicioDiaVentana));
    consumoPorDia[idx] += s.cantidad;
  }

  const promedio = consumoPorDia.reduce((a, b) => a + b, 0) / dias;
  const varianza =
    consumoPorDia.reduce((acc, c) => acc + (c - promedio) ** 2, 0) / dias;
  const desviacion = Math.sqrt(varianza);

  return { disponible: true, promedio, desviacion, diasHistorial };
}

export interface StockSugerido {
  disponible: boolean;
  razonNoDisponible?: string;
  demandaPromedioDiaria: number;
  desviacionDemandaDiaria: number;
  leadTimePromedioDias: number;
  stockSeguridad: number;
  puntoReorden: number;
  diasHistorial: number;
  numeroComprasConsideradas: number;
}

const SIN_DATOS: Omit<StockSugerido, "disponible" | "razonNoDisponible"> = {
  demandaPromedioDiaria: 0,
  desviacionDemandaDiaria: 0,
  leadTimePromedioDias: 0,
  stockSeguridad: 0,
  puntoReorden: 0,
  diasHistorial: 0,
  numeroComprasConsideradas: 0,
};

export function calcularStockSugerido(params: {
  /** Todas las salidas históricas del material (no hace falta pre-filtrar por fecha). */
  salidas: { cantidad: number; created_at: string }[];
  /** Casos de compra ya recibidos de este material. */
  comprasRecibidas: { created_at: string; updated_at: string }[];
  ventanaDias?: number;
  ahora?: Date;
}): StockSugerido {
  const ahoraMs = (params.ahora ?? new Date()).getTime();
  const demanda = calcularDemandaDiaria(
    params.salidas,
    params.ventanaDias ?? VENTANA_DIAS_DEFECTO,
    ahoraMs
  );

  if (!demanda.disponible) {
    return {
      disponible: false,
      razonNoDisponible: demanda.razonNoDisponible,
      ...SIN_DATOS,
      diasHistorial: demanda.diasHistorial,
    };
  }

  const numeroComprasConsideradas = params.comprasRecibidas.length;
  if (numeroComprasConsideradas < MIN_COMPRAS_PARA_LEAD_TIME) {
    return {
      disponible: false,
      razonNoDisponible: `Solo hay ${numeroComprasConsideradas} compra(s) recibida(s) — se necesitan al menos ${MIN_COMPRAS_PARA_LEAD_TIME} para estimar el tiempo de entrega.`,
      ...SIN_DATOS,
      demandaPromedioDiaria: demanda.promedio,
      desviacionDemandaDiaria: demanda.desviacion,
      diasHistorial: demanda.diasHistorial,
      numeroComprasConsideradas,
    };
  }

  const leadTimes = params.comprasRecibidas.map(
    (c) =>
      (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) /
      MS_POR_DIA
  );
  const leadTimePromedioDias =
    leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length;

  const stockSeguridad =
    Z_NIVEL_SERVICIO_95 *
    demanda.desviacion *
    Math.sqrt(Math.max(0, leadTimePromedioDias));
  const puntoReorden = demanda.promedio * leadTimePromedioDias + stockSeguridad;

  return {
    disponible: true,
    demandaPromedioDiaria: demanda.promedio,
    desviacionDemandaDiaria: demanda.desviacion,
    leadTimePromedioDias,
    stockSeguridad,
    puntoReorden,
    diasHistorial: demanda.diasHistorial,
    numeroComprasConsideradas,
  };
}
