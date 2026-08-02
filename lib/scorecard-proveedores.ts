// Scorecard de proveedores — cumplimiento de tiempo de entrega, precio y
// calidad, calculado del historial real de compras YA recibidas (nada
// declarado a mano, nada inventado).
//
//   Tiempo de entrega: por cada compra recibida, "lead time real" = días
//   entre que se creó el caso y que se marcó recibido (mismo criterio que
//   ya usa lib/stock-sugerido.ts para leadTimePromedioDias — no se
//   reinventa la definición). "Cumplió" si ese real quedó dentro de lo
//   comprometido (convenio.dias_entrega_pactado si existe, si no
//   proveedor.dias_entrega_declarado) — quien llama ya resolvió cuál de
//   los dos aplica antes de pasarlo aquí.
//
//   Precio: "cumplió" si el precio unitario pagado (monto/cantidad) no
//   superó el precio pactado en convenio (con 1 centavo de tolerancia por
//   redondeo, no de negocio).
//
//   Calidad: "cumplió" si, de lo recibido con bloqueo de calidad activo
//   (materiales opt-in "requiere_inspeccion_calidad", ver
//   lib/inspeccion-calidad.ts), un gestor ya resolvió la inspección y no
//   rechazó nada. Solo existe dato para materiales que de verdad se
//   inspeccionan — un proveedor que nunca vende algo así simplemente no
//   tiene esta métrica, no cuenta como "cumple 100%" por default.
//
// Las tres métricas solo se calculan sobre los casos que sí tienen un dato
// de referencia (convenio/declarado para entrega y precio; una inspección
// ya resuelta para calidad) — sin eso, no hay "cumplió o no", solo un
// promedio informativo.

const TOLERANCIA_PRECIO_CENTAVOS = 0.01;
const MS_POR_DIA = 1000 * 60 * 60 * 24;

export interface CasoRecibidoParaScorecard {
  proveedorId: string;
  createdAt: string;
  updatedAt: string;
  montoEstimado: number;
  cantidadEstimada: number | null;
  /** Ya resuelto por quien llama: convenio.dias_entrega_pactado ?? proveedor.dias_entrega_declarado ?? null. */
  diasEntregaComprometido: number | null;
  /** Del convenio (proveedor, material) de este caso, si existe. */
  precioPactado: number | null;
  /** Solo si el material tenía bloqueo de calidad Y ya se resolvió la inspección. */
  inspeccionCalidad: { cantidadRecibida: number; cantidadRechazada: number } | null;
}

export interface CumplimientoMetrica {
  pct: number;
  cumplidos: number;
  conDato: number;
}

export interface ScorecardProveedor {
  proveedorId: string;
  numPedidosRecibidos: number;
  valorTotalRecibido: number;
  leadTimePromedioDias: number | null;
  cumplimientoEntrega: CumplimientoMetrica | null;
  cumplimientoPrecio: CumplimientoMetrica | null;
  cumplimientoCalidad: CumplimientoMetrica | null;
  /** Promedio de las métricas disponibles (0-100); null si ninguna tiene dato de referencia. */
  scoreGeneral: number | null;
}

function diasEntre(desde: string, hasta: string): number {
  return (new Date(hasta).getTime() - new Date(desde).getTime()) / MS_POR_DIA;
}

export function calcularScorecardProveedores(
  casos: CasoRecibidoParaScorecard[]
): Record<string, ScorecardProveedor> {
  const porProveedor = new Map<string, CasoRecibidoParaScorecard[]>();
  for (const c of casos) {
    (porProveedor.get(c.proveedorId) ?? porProveedor.set(c.proveedorId, []).get(c.proveedorId)!).push(c);
  }

  const resultado: Record<string, ScorecardProveedor> = {};
  for (const [proveedorId, casosProveedor] of porProveedor) {
    const numPedidosRecibidos = casosProveedor.length;
    const valorTotalRecibido = casosProveedor.reduce((a, c) => a + c.montoEstimado, 0);

    const leadTimes = casosProveedor.map((c) => diasEntre(c.createdAt, c.updatedAt));
    const leadTimePromedioDias =
      leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : null;

    const casosConComprometido = casosProveedor.filter((c) => c.diasEntregaComprometido !== null);
    const cumplidosEntrega = casosConComprometido.filter(
      (c) => diasEntre(c.createdAt, c.updatedAt) <= c.diasEntregaComprometido!
    ).length;
    const cumplimientoEntrega: CumplimientoMetrica | null =
      casosConComprometido.length > 0
        ? {
            pct: (cumplidosEntrega / casosConComprometido.length) * 100,
            cumplidos: cumplidosEntrega,
            conDato: casosConComprometido.length,
          }
        : null;

    const casosConPactado = casosProveedor.filter(
      (c) => c.precioPactado !== null && c.cantidadEstimada !== null && c.cantidadEstimada > 0
    );
    const cumplidosPrecio = casosConPactado.filter(
      (c) => c.montoEstimado / c.cantidadEstimada! <= c.precioPactado! + TOLERANCIA_PRECIO_CENTAVOS
    ).length;
    const cumplimientoPrecio: CumplimientoMetrica | null =
      casosConPactado.length > 0
        ? {
            pct: (cumplidosPrecio / casosConPactado.length) * 100,
            cumplidos: cumplidosPrecio,
            conDato: casosConPactado.length,
          }
        : null;

    const casosConInspeccion = casosProveedor.filter((c) => c.inspeccionCalidad !== null);
    const cumplidosCalidad = casosConInspeccion.filter(
      (c) => c.inspeccionCalidad!.cantidadRechazada === 0
    ).length;
    const cumplimientoCalidad: CumplimientoMetrica | null =
      casosConInspeccion.length > 0
        ? {
            pct: (cumplidosCalidad / casosConInspeccion.length) * 100,
            cumplidos: cumplidosCalidad,
            conDato: casosConInspeccion.length,
          }
        : null;

    const metricasDisponibles = [
      cumplimientoEntrega?.pct,
      cumplimientoPrecio?.pct,
      cumplimientoCalidad?.pct,
    ].filter((v): v is number => v !== undefined);
    const scoreGeneral =
      metricasDisponibles.length > 0
        ? metricasDisponibles.reduce((a, b) => a + b, 0) / metricasDisponibles.length
        : null;

    resultado[proveedorId] = {
      proveedorId,
      numPedidosRecibidos,
      valorTotalRecibido,
      leadTimePromedioDias,
      cumplimientoEntrega,
      cumplimientoPrecio,
      cumplimientoCalidad,
      scoreGeneral,
    };
  }

  return resultado;
}
