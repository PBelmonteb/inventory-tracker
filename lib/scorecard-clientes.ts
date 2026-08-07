// Scorecard de clientes — valor/confiabilidad del cliente, calculado del
// historial real de casos de venta (nada declarado a mano). Mirror de
// lib/scorecard-proveedores.ts, pero mide al CLIENTE en vez de al
// proveedor: aquí no hay "cumplimiento" que juzgar del otro lado (nosotros
// entregamos, el cliente compra) — las métricas relevantes son valor,
// frecuencia, y qué tan seguido cancela o devuelve.
//
//   Casos "válidos" = todos menos cancelados (cotización/confirmado/
//   en_producción/entregado cuentan como negocio real, aunque no se haya
//   entregado todavía).
//
//   Tasa de cancelación: sobre el total de casos (incluye cancelados) —
//   sin dato de referencia no aplica "0% cancelación" por default, se
//   marca null solo si el cliente no tiene ningún caso.
//
//   Tasa de devolución: solo tiene sentido sobre casos que sí se
//   entregaron (un caso en cotización no puede tener devolución) — null si
//   el cliente no tiene ningún caso entregado todavía.
//
//   Margen estimado: valor vendido menos el costo de los materiales al WAC
//   ACTUAL (no histórico, por eso "estimado") — mismo criterio honesto que
//   el resto del scorecard: no inventa precisión que no existe.

import type { CumplimientoMetrica } from "@/lib/scorecard-proveedores";

export type { CumplimientoMetrica };

export interface CasoVentaParaScorecard {
  clienteId: string;
  cancelado: boolean;
  entregado: boolean;
  monto: number;
  /** Suma de cantidad × costo_unitario (WAC actual) de los items del caso. */
  costoEstimado: number;
  /** True si el caso tiene al menos una fila en devoluciones_venta. */
  tuvoDevolucion: boolean;
}

export interface ScorecardCliente {
  clienteId: string;
  numCasos: number;
  valorTotalVendido: number;
  ticketPromedio: number | null;
  tasaCancelacion: CumplimientoMetrica | null;
  tasaDevolucion: CumplimientoMetrica | null;
  margenEstimado: number | null;
}

export function calcularScorecardClientes(
  casos: CasoVentaParaScorecard[]
): Record<string, ScorecardCliente> {
  const porCliente = new Map<string, CasoVentaParaScorecard[]>();
  for (const c of casos) {
    (porCliente.get(c.clienteId) ?? porCliente.set(c.clienteId, []).get(c.clienteId)!).push(c);
  }

  const resultado: Record<string, ScorecardCliente> = {};
  for (const [clienteId, casosCliente] of porCliente) {
    const casosValidos = casosCliente.filter((c) => !c.cancelado);
    const numCasos = casosValidos.length;
    const valorTotalVendido = casosValidos.reduce((a, c) => a + c.monto, 0);
    const ticketPromedio = numCasos > 0 ? valorTotalVendido / numCasos : null;

    const casosCancelados = casosCliente.filter((c) => c.cancelado).length;
    const tasaCancelacion: CumplimientoMetrica | null =
      casosCliente.length > 0
        ? {
            // "Cumplidos" aquí = no cancelados, para reusar el mismo tono
            // visual (verde = bueno) que el resto de la app.
            pct: ((casosCliente.length - casosCancelados) / casosCliente.length) * 100,
            cumplidos: casosCliente.length - casosCancelados,
            conDato: casosCliente.length,
          }
        : null;

    const entregados = casosValidos.filter((c) => c.entregado);
    const conDevolucion = entregados.filter((c) => c.tuvoDevolucion).length;
    const tasaDevolucion: CumplimientoMetrica | null =
      entregados.length > 0
        ? {
            // "Cumplidos" = sin devolución.
            pct: ((entregados.length - conDevolucion) / entregados.length) * 100,
            cumplidos: entregados.length - conDevolucion,
            conDato: entregados.length,
          }
        : null;

    const margenEstimado =
      numCasos > 0
        ? valorTotalVendido - casosValidos.reduce((a, c) => a + c.costoEstimado, 0)
        : null;

    resultado[clienteId] = {
      clienteId,
      numCasos,
      valorTotalVendido,
      ticketPromedio,
      tasaCancelacion,
      tasaDevolucion,
      margenEstimado,
    };
  }

  return resultado;
}
