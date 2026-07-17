// Decide si el stock de un material amerita crear automáticamente un caso
// de compra, y qué tan urgente es, en función del tiempo de entrega del
// proveedor frente a cuántos días de cobertura quedan. No reimplementa
// nada de lib/stock-sugerido.ts ni lib/eoq.ts — solo interpreta sus
// resultados para tomar la decisión y explicarla.
//
//   Umbral de disparo = punto de reorden calculado (si hay historial
//   suficiente) o el stock mínimo configurado a mano (respaldo).
//
//   Nivel de riesgo = comparación entre los días de cobertura restante
//   (stock actual / demanda diaria) y el tiempo de entrega usado
//   (inferido del historial si hay >=2 compras recibidas, si no el
//   declarado en el proveedor):
//     - sin tiempo de entrega conocido -> medio (no se puede medir riesgo)
//     - sin demanda suficiente para estimar cobertura -> alto
//     - cobertura <= tiempo de entrega -> crítico (se agota antes de que
//       llegue un pedido nuevo)
//     - cobertura <= 1.5x tiempo de entrega -> alto
//     - si no -> medio

import type { StockSugerido } from "@/lib/stock-sugerido";
import type { ResultadoEOQ } from "@/lib/eoq";
import type { NivelRiesgoStock } from "@/lib/types";

const MULTIPLICADOR_RIESGO_ALTO = 1.5;

export interface RiesgoStock {
  debeCrearCaso: boolean;
  nivelRiesgo: NivelRiesgoStock;
  diasCobertura: number | null;
  leadTimeUsado: number | null;
  cantidadSugerida: number;
  motivo: string;
}

export function evaluarRiesgoStock(params: {
  stockActual: number;
  stockMinimo: number;
  proveedorDiasEntrega: number | null;
  stockSugerido: StockSugerido;
  eoq: ResultadoEOQ | null;
}): RiesgoStock {
  const { stockActual, stockMinimo, proveedorDiasEntrega, stockSugerido, eoq } =
    params;

  // Igual que sincronizar_notificaciones(): stock_minimo <= 0 significa
  // "sin configurar todavía", no "el mínimo real es cero" — no dispara nada
  // por sí solo salvo que ya haya un punto de reorden calculado.
  const umbral = stockSugerido.disponible
    ? stockSugerido.puntoReorden
    : stockMinimo;
  const umbralConfigurado = stockSugerido.disponible || stockMinimo > 0;
  const debeCrearCaso = umbralConfigurado && stockActual <= umbral;

  const leadTimeUsado = stockSugerido.disponible
    ? stockSugerido.leadTimePromedioDias
    : (proveedorDiasEntrega ?? null);

  const demandaPromedioDiaria = stockSugerido.demandaPromedioDiaria;
  const diasCobertura =
    demandaPromedioDiaria > 0 ? stockActual / demandaPromedioDiaria : null;

  const { nivelRiesgo, motivo } = clasificarRiesgo({
    leadTimeUsado,
    diasCobertura,
  });

  const cantidadSugerida = calcularCantidadSugerida({
    stockActual,
    stockMinimo,
    stockSugerido,
    eoq,
  });

  return {
    debeCrearCaso,
    nivelRiesgo,
    diasCobertura,
    leadTimeUsado,
    cantidadSugerida,
    motivo,
  };
}

function clasificarRiesgo(params: {
  leadTimeUsado: number | null;
  diasCobertura: number | null;
}): { nivelRiesgo: NivelRiesgoStock; motivo: string } {
  const { leadTimeUsado, diasCobertura } = params;

  if (leadTimeUsado == null) {
    return {
      nivelRiesgo: "medio",
      motivo:
        "Cruzó el punto de reposición, pero no hay tiempo de entrega declarado ni inferido para medir el riesgo de desabasto.",
    };
  }

  if (diasCobertura == null) {
    return {
      nivelRiesgo: "alto",
      motivo: `Cruzó el punto de reposición; no hay demanda suficiente para estimar cuántos días de cobertura quedan (tiempo de entrega: ~${leadTimeUsado.toFixed(1)} días).`,
    };
  }

  if (diasCobertura <= leadTimeUsado) {
    return {
      nivelRiesgo: "critico",
      motivo: `Quedan ~${diasCobertura.toFixed(1)} días de stock y el proveedor tarda ~${leadTimeUsado.toFixed(1)} días en entregar: el material se agotaría antes de que llegue un pedido nuevo.`,
    };
  }

  if (diasCobertura <= leadTimeUsado * MULTIPLICADOR_RIESGO_ALTO) {
    return {
      nivelRiesgo: "alto",
      motivo: `Quedan ~${diasCobertura.toFixed(1)} días de stock frente a ~${leadTimeUsado.toFixed(1)} días de entrega: margen corto.`,
    };
  }

  return {
    nivelRiesgo: "medio",
    motivo: `Cruzó el punto de reposición con margen frente al tiempo de entrega (~${diasCobertura.toFixed(1)} días de cobertura vs. ~${leadTimeUsado.toFixed(1)} días de entrega).`,
  };
}

function calcularCantidadSugerida(params: {
  stockActual: number;
  stockMinimo: number;
  stockSugerido: StockSugerido;
  eoq: ResultadoEOQ | null;
}): number {
  const { stockActual, stockMinimo, stockSugerido, eoq } = params;

  if (eoq?.disponible) return Math.max(1, Math.ceil(eoq.cantidadEconomica));
  if (stockSugerido.disponible)
    return Math.max(1, Math.ceil(stockSugerido.puntoReorden - stockActual));
  return Math.max(1, Math.ceil(stockMinimo * 1.5 - stockActual));
}
