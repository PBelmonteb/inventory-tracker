// Cantidad económica de pedido (EOQ) — "¿cuánto pido cada vez?", en vez de
// la heurística ingenua de "el doble del mínimo" que se usaba antes en el
// formulario de solicitar cotización.
//
//   EOQ = √(2 × D × S / H)
//
//   D = demanda anual (unidades) — se deriva del mismo historial de
//       salidas que usa el punto de reorden (ver lib/stock-sugerido.ts).
//   S = costo de ordenar UN pedido (fijo, sin importar cuánto se pida).
//       No se deriva de los datos — es una decisión de negocio. Placeholder
//       configurable: $500 MXN por pedido.
//   H = costo de mantener UNA pieza en inventario un año = costo_unitario
//       (el WAC del material) × tasa de mantenimiento anual. Placeholder
//       configurable: 20% anual (regla de dedo de la industria: 15-30%,
//       cubre capital inmovilizado + almacenaje + mermas/obsolescencia).
//
// Ambos supuestos (S y tasa H) son parámetros del cálculo, no verdades
// fijas — el día que el usuario quiera ajustarlos por su cuenta, es cosa
// de exponerlos en una pantalla de configuración y dejar de usar el default.

import { calcularDemandaDiaria } from "@/lib/stock-sugerido";

export const COSTO_ORDENAR_DEFECTO = 500; // MXN por pedido
export const TASA_MANTENIMIENTO_DEFECTO = 0.2; // 20% anual del costo unitario
const DIAS_POR_ANO = 365;

export interface ResultadoEOQ {
  disponible: boolean;
  razonNoDisponible?: string;
  demandaAnual: number;
  costoOrdenar: number;
  tasaMantenimientoAnual: number;
  cantidadEconomica: number;
  numeroPedidosAlAno: number;
}

const SIN_DATOS: Omit<ResultadoEOQ, "disponible" | "razonNoDisponible"> = {
  demandaAnual: 0,
  costoOrdenar: 0,
  tasaMantenimientoAnual: 0,
  cantidadEconomica: 0,
  numeroPedidosAlAno: 0,
};

export function calcularEOQ(params: {
  salidas: { cantidad: number; created_at: string }[];
  costoUnitario: number;
  costoOrdenar?: number;
  tasaMantenimientoAnual?: number;
  ventanaDias?: number;
  ahora?: Date;
}): ResultadoEOQ {
  const costoOrdenar = params.costoOrdenar ?? COSTO_ORDENAR_DEFECTO;
  const tasaMantenimientoAnual =
    params.tasaMantenimientoAnual ?? TASA_MANTENIMIENTO_DEFECTO;

  const demanda = calcularDemandaDiaria(
    params.salidas,
    params.ventanaDias,
    (params.ahora ?? new Date()).getTime()
  );

  if (!demanda.disponible) {
    return {
      disponible: false,
      razonNoDisponible: demanda.razonNoDisponible,
      ...SIN_DATOS,
      costoOrdenar,
      tasaMantenimientoAnual,
    };
  }

  if (!(params.costoUnitario > 0)) {
    return {
      disponible: false,
      razonNoDisponible:
        "Este material no tiene costo unitario registrado todavía.",
      ...SIN_DATOS,
      costoOrdenar,
      tasaMantenimientoAnual,
    };
  }

  const demandaAnual = demanda.promedio * DIAS_POR_ANO;
  const H = params.costoUnitario * tasaMantenimientoAnual;

  if (!(demandaAnual > 0) || !(H > 0)) {
    return {
      disponible: false,
      razonNoDisponible:
        "No hay demanda anual estimada suficiente para calcular una cantidad económica útil.",
      ...SIN_DATOS,
      costoOrdenar,
      tasaMantenimientoAnual,
    };
  }

  const cantidadEconomica = Math.sqrt((2 * demandaAnual * costoOrdenar) / H);
  const numeroPedidosAlAno = demandaAnual / cantidadEconomica;

  return {
    disponible: true,
    demandaAnual,
    costoOrdenar,
    tasaMantenimientoAnual,
    cantidadEconomica,
    numeroPedidosAlAno,
  };
}
