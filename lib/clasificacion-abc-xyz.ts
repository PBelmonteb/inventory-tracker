// Clasificación ABC (por valor de consumo) × XYZ (por variabilidad de la
// demanda) — dice qué materiales merecen conteo cíclico frecuente y punto
// de reorden fino, y cuáles no valen ese esfuerzo. Al final del archivo
// también vive el análisis de participación de ventas vs. utilidad
// (idea de junta, ejemplo "Shark Tank": un producto con 40% de las ventas
// pero solo 3% de la utilidad) — eje DISTINTO al de ABC: ABC pesa por
// costo de lo que sale de inventario, esto pesa por ingreso/utilidad real
// de venta ya entregada. Viven en el mismo archivo/pantalla a propósito
// (Clasificación ABC/XYZ) en vez de una pestaña nueva.
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

/* ============================================================
   Participación de ventas vs. utilidad
   ============================================================ */

export interface ItemParticipacion {
  materialId: string;
  ingresoTotal: number;
  pctIngreso: number;
  utilidadTotal: number;
  pctUtilidad: number;
  // utilidad% ÷ ingreso% -- cerca de 1 es "gana lo que le toca por su
  // tamaño"; muy por debajo de 1 es el foco del análisis: pesa mucho en
  // ventas pero no regresa la utilidad proporcional (candidato a
  // reconsiderar si seguir comprándolo). null si no tuvo ventas en la
  // ventana -- no se confunde con "índice 0", que sí sería una alerta.
  indiceEficiencia: number | null;
  // Nombre distinto a ItemClasificado.disponible (datos de demanda) a
  // propósito: MaterialClasificado combina ambas interfaces, y si se
  // llamaran igual el spread en getClasificacionABCXYZ (lib/data.ts) pisaría
  // silenciosamente el "disponible" de ABC/XYZ con este.
  ventasDisponibles: boolean;
}

/** ingresoTotal/utilidadTotal ya vienen agregados por material (ver
 *  getVentasEntregadasPorMaterial en lib/data.ts: Σ precio_unitario×cantidad
 *  y Σ (precio_unitario - costo_unitario)×cantidad de ventas ENTREGADAS). */
export function calcularParticipacionUtilidad(
  ventas: { materialId: string; ingresoTotal: number; utilidadTotal: number }[]
): ItemParticipacion[] {
  const ingresoGlobal = ventas.reduce((a, v) => a + v.ingresoTotal, 0);
  const utilidadGlobal = ventas.reduce((a, v) => a + v.utilidadTotal, 0);

  return ventas.map((v) => {
    const ventasDisponibles = v.ingresoTotal > 0;
    const pctIngreso = ingresoGlobal > 0 ? v.ingresoTotal / ingresoGlobal : 0;
    // La utilidad total de la empresa puede ser negativa o cero en una
    // ventana corta -- dividir entre eso no da un % interpretable, se deja
    // sin dato en vez de mostrar un número engañoso.
    const pctUtilidad =
      ventasDisponibles && utilidadGlobal > 0 ? v.utilidadTotal / utilidadGlobal : 0;
    const indiceEficiencia =
      ventasDisponibles && pctIngreso > 0 && utilidadGlobal > 0
        ? pctUtilidad / pctIngreso
        : null;
    return {
      materialId: v.materialId,
      ingresoTotal: v.ingresoTotal,
      pctIngreso,
      utilidadTotal: v.utilidadTotal,
      pctUtilidad,
      indiceEficiencia,
      ventasDisponibles,
    };
  });
}
