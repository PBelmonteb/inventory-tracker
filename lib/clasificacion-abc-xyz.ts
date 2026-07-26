// Clasificación ABC (por valor de consumo) × XYZ (por variabilidad de la
// demanda) — dice qué materiales merecen conteo cíclico frecuente y punto
// de reorden fino, y cuáles no valen ese esfuerzo.
//
//   ABC: ordena los materiales por valor anual consumido (demanda × costo)
//   de mayor a menor y corta por % acumulado (Pareto) —
//     A = el primer 80% del valor (pocos materiales, la mayoría del dinero)
//     B = el siguiente 15% (hasta 95% acumulado)
//     C = el resto
//
//   XYZ: coeficiente de variación (desviación / promedio) de la demanda
//   diaria — mismo dato que ya calcula el punto de reorden (ver
//   lib/stock-sugerido.ts), no se recalcula con otra lógica —
//     X = demanda estable   (CV ≤ 0.5)
//     Y = demanda variable  (0.5 < CV ≤ 1.0)
//     Z = demanda errática  (CV > 1.0)
//
// La combinación (AX, CZ, etc.) es la que decide prioridad: AX es lo más
// valioso Y lo más predecible (conteo de rutina); CZ es lo menos valioso Y
// lo más errático (no vale la pena perseguirlo).

import { calcularDemandaDiaria } from "@/lib/stock-sugerido";

const DIAS_POR_ANO = 365;
const CORTE_A = 0.8;
const CORTE_B = 0.95;
const CORTE_X = 0.5;
const CORTE_Y = 1.0;

export type ClaseABC = "A" | "B" | "C";
export type ClaseXYZ = "X" | "Y" | "Z" | "sin datos";

export interface ItemClasificado {
  materialId: string;
  valorAnual: number;
  pctValor: number;
  pctAcumulado: number;
  claseABC: ClaseABC;
  coeficienteVariacion: number | null;
  claseXYZ: ClaseXYZ;
  demandaPromedioDiaria: number;
  diasHistorial: number;
  disponible: boolean;
  razonNoDisponible?: string;
}

export function clasificarABCXYZ(
  materiales: {
    materialId: string;
    costoUnitario: number;
    salidas: { cantidad: number; created_at: string }[];
  }[],
  ventanaDias?: number,
  ahora?: Date
): ItemClasificado[] {
  const ahoraMs = (ahora ?? new Date()).getTime();

  const base = materiales.map((m) => {
    const demanda = calcularDemandaDiaria(m.salidas, ventanaDias, ahoraMs);
    const valorAnual = demanda.disponible
      ? demanda.promedio * DIAS_POR_ANO * m.costoUnitario
      : 0;
    const coeficienteVariacion =
      demanda.disponible && demanda.promedio > 0
        ? demanda.desviacion / demanda.promedio
        : null;
    return {
      materialId: m.materialId,
      valorAnual,
      demandaPromedioDiaria: demanda.promedio,
      diasHistorial: demanda.diasHistorial,
      coeficienteVariacion,
      disponible: demanda.disponible,
      razonNoDisponible: demanda.razonNoDisponible,
    };
  });

  const valorTotal = base.reduce((a, b) => a + b.valorAnual, 0);
  const ordenado = [...base].sort((a, b) => b.valorAnual - a.valorAnual);

  let acumulado = 0;
  return ordenado.map((it) => {
    const pctValor = valorTotal > 0 ? it.valorAnual / valorTotal : 0;
    // La clase se decide con el acumulado ANTES de sumar este item, no
    // después — si no, un solo material dominante (>80% del valor él
    // solo) cruzaría el corte de A con su propio porcentaje y caería mal
    // en C. Es la convención estándar de ABC: entra en A mientras lo que
    // va acumulado hasta el item anterior siga bajo el corte.
    const acumuladoAntes = acumulado;
    acumulado += pctValor;
    // Sin consumo medible (nunca salió o sin costo) siempre cae en C — no
    // compite por atención de conteo frecuente contra lo que sí se mueve.
    const claseABC: ClaseABC =
      it.valorAnual <= 0
        ? "C"
        : acumuladoAntes < CORTE_A
          ? "A"
          : acumuladoAntes < CORTE_B
            ? "B"
            : "C";
    const claseXYZ: ClaseXYZ =
      it.coeficienteVariacion === null
        ? "sin datos"
        : it.coeficienteVariacion <= CORTE_X
          ? "X"
          : it.coeficienteVariacion <= CORTE_Y
            ? "Y"
            : "Z";
    return {
      materialId: it.materialId,
      valorAnual: it.valorAnual,
      pctValor,
      pctAcumulado: acumulado,
      claseABC,
      coeficienteVariacion: it.coeficienteVariacion,
      claseXYZ,
      demandaPromedioDiaria: it.demandaPromedioDiaria,
      diasHistorial: it.diasHistorial,
      disponible: it.disponible,
      razonNoDisponible: it.razonNoDisponible,
    };
  });
}
