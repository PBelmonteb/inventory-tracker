// MRP multinivel — junta TODA la demanda (ventas directas + producción vía
// BOM) y la neta contra stock + lo que ya está en camino, en una sola
// corrida. Es el hueco real que la reposición automática (lib/casos-automaticos.ts)
// no cubre: esa evalúa cada material contra SU PROPIA tendencia histórica de
// salidas, sin enterarse de que un producto compuesto (ej. una ventana) tiene
// ventas pendientes que van a jalar sus componentes. Este módulo sí lo hace.
//
// No es tiempo-fasado (SAP MRP corre por periodos/semanas) — es una sola
// corrida instantánea, consistente con el resto de la app (nada de la
// reposición automática es tiempo-fasado tampoco). El valor no está en el
// fasado, está en juntar y explotar la demanda en un solo pase.
//
// Algoritmo (equivalente a un MRP clásico de un solo periodo):
//   1. Demanda bruta inicial = demanda directa (ventas confirmadas/en
//      producción + salidas pendientes — mismo dato que ya usa Inventario
//      para "Comprometido", ver lib/data.ts getComprometido()).
//   2. Se procesa cada material en orden topológico del grafo de BOM
//      (producto antes que sus componentes) — así, cuando se llega a un
//      componente compartido por varios productos, YA se acumuló la
//      demanda derivada de TODOS sus padres antes de netear una sola vez.
//      Esto es justo lo que resuelve "un producto compuesto compite por el
//      mismo insumo que otro".
//   3. requerimiento neto = max(0, demanda bruta - stock actual - por llegar).
//   4. Si el material es producible y tiene requerimiento neto > 0, ese
//      neto se "explota" hacia sus componentes (cantidad_por_unidad ×
//      requerimiento neto) como demanda derivada.
//   5. Si el material NO es producible y tiene requerimiento neto > 0, la
//      acción sugerida es "comprar"; si SÍ es producible, "producir".
//
// El esquema de bom_items no impide ciclos (A usa B, B usa A) — la UI de
// hoy nunca crea uno, pero por si acaso: se detectan vía Kahn's algorithm
// (nodos que nunca llegan a grado-entrada 0) y se marcan `cicloDetectado`
// en vez de intentar explotarlos (ver bom-editor.tsx: BOM es a un nivel
// "a propósito", nunca se probó con anidamiento real).

export interface BomEdge {
  productoId: string;
  componenteId: string;
  cantidadPorUnidad: number;
}

export interface MaterialParaMRP {
  materialId: string;
  demandaDirecta: number;
  stockActual: number;
  porLlegar: number;
}

export interface FuenteDemanda {
  tipo: "venta_directa" | "produccion_derivada";
  cantidad: number;
  /** Solo si tipo === "produccion_derivada": qué producible generó esta demanda. */
  productoOrigenId?: string;
}

export interface RequerimientoMRP {
  materialId: string;
  demandaDirecta: number;
  demandaDerivada: number;
  demandaBruta: number;
  stockActual: number;
  porLlegar: number;
  disponible: number;
  requerimientoNeto: number;
  esProducible: boolean;
  accion: "ninguna" | "producir" | "comprar";
  fuentes: FuenteDemanda[];
  cicloDetectado: boolean;
}

export interface ResultadoMRP {
  requerimientos: RequerimientoMRP[];
  materialesConCicloBOM: string[];
}

export function correrMRP(
  materiales: MaterialParaMRP[],
  bom: BomEdge[]
): ResultadoMRP {
  const datosPorMaterial = new Map(materiales.map((m) => [m.materialId, m]));

  const bomPorProducto = new Map<string, BomEdge[]>();
  for (const edge of bom) {
    (bomPorProducto.get(edge.productoId) ?? bomPorProducto.set(edge.productoId, []).get(edge.productoId)!).push(
      edge
    );
  }
  const esProducible = new Set(bomPorProducto.keys());

  // Todos los nodos relevantes: los que tienen demanda/stock propio + los
  // que solo aparecen dentro de un BOM (componentes sin fila de demanda
  // directa todavía).
  const nodos = new Set<string>(datosPorMaterial.keys());
  for (const edge of bom) {
    nodos.add(edge.productoId);
    nodos.add(edge.componenteId);
  }

  // Kahn's algorithm: procesar producto ANTES que sus componentes, para
  // que un componente compartido acumule la demanda de TODOS sus padres
  // antes de netear una sola vez.
  const gradoEntrada = new Map<string, number>();
  for (const n of nodos) gradoEntrada.set(n, 0);
  for (const edge of bom) {
    gradoEntrada.set(edge.componenteId, (gradoEntrada.get(edge.componenteId) ?? 0) + 1);
  }

  const cola: string[] = [...nodos]
    .filter((n) => gradoEntrada.get(n) === 0)
    .sort();
  const demandaBrutaAcum = new Map<string, number>();
  const fuentesPorMaterial = new Map<string, FuenteDemanda[]>();
  const procesados = new Set<string>();

  const agregarFuente = (materialId: string, fuente: FuenteDemanda) => {
    if (fuente.cantidad <= 0) return;
    (fuentesPorMaterial.get(materialId) ?? fuentesPorMaterial.set(materialId, []).get(materialId)!).push(fuente);
    demandaBrutaAcum.set(materialId, (demandaBrutaAcum.get(materialId) ?? 0) + fuente.cantidad);
  };

  for (const n of nodos) {
    const directa = datosPorMaterial.get(n)?.demandaDirecta ?? 0;
    if (directa > 0) agregarFuente(n, { tipo: "venta_directa", cantidad: directa });
  }

  const requerimientos: RequerimientoMRP[] = [];
  while (cola.length > 0) {
    const nodo = cola.shift()!;
    if (procesados.has(nodo)) continue;
    procesados.add(nodo);

    const datos = datosPorMaterial.get(nodo);
    const stockActual = datos?.stockActual ?? 0;
    const porLlegarNodo = datos?.porLlegar ?? 0;
    const demandaBruta = demandaBrutaAcum.get(nodo) ?? 0;
    const disponible = stockActual + porLlegarNodo;
    const requerimientoNeto = Math.max(0, demandaBruta - disponible);
    const producible = esProducible.has(nodo);

    requerimientos.push({
      materialId: nodo,
      demandaDirecta: datos?.demandaDirecta ?? 0,
      demandaDerivada: demandaBruta - (datos?.demandaDirecta ?? 0),
      demandaBruta,
      stockActual,
      porLlegar: porLlegarNodo,
      disponible,
      requerimientoNeto,
      esProducible: producible,
      accion: requerimientoNeto <= 0 ? "ninguna" : producible ? "producir" : "comprar",
      fuentes: fuentesPorMaterial.get(nodo) ?? [],
      cicloDetectado: false,
    });

    for (const edge of bomPorProducto.get(nodo) ?? []) {
      if (requerimientoNeto > 0) {
        agregarFuente(edge.componenteId, {
          tipo: "produccion_derivada",
          cantidad: edge.cantidadPorUnidad * requerimientoNeto,
          productoOrigenId: nodo,
        });
      }
      const restante = (gradoEntrada.get(edge.componenteId) ?? 0) - 1;
      gradoEntrada.set(edge.componenteId, restante);
      if (restante === 0) cola.push(edge.componenteId);
    }
  }

  // Lo que nunca llegó a grado-entrada 0 está dentro de (o depende de) un
  // ciclo — se reporta con lo que se alcanzó a saber, marcado, en vez de
  // fingir un requerimiento neto confiable.
  const materialesConCicloBOM = [...nodos].filter((n) => !procesados.has(n)).sort();
  for (const nodo of materialesConCicloBOM) {
    const datos = datosPorMaterial.get(nodo);
    const stockActual = datos?.stockActual ?? 0;
    const porLlegarNodo = datos?.porLlegar ?? 0;
    const demandaBruta = demandaBrutaAcum.get(nodo) ?? 0;
    requerimientos.push({
      materialId: nodo,
      demandaDirecta: datos?.demandaDirecta ?? 0,
      demandaDerivada: demandaBruta - (datos?.demandaDirecta ?? 0),
      demandaBruta,
      stockActual,
      porLlegar: porLlegarNodo,
      disponible: stockActual + porLlegarNodo,
      requerimientoNeto: Math.max(0, demandaBruta - stockActual - porLlegarNodo),
      esProducible: esProducible.has(nodo),
      accion: "ninguna",
      fuentes: fuentesPorMaterial.get(nodo) ?? [],
      cicloDetectado: true,
    });
  }

  return { requerimientos, materialesConCicloBOM };
}
