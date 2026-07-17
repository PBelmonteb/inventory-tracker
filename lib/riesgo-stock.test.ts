import { describe, expect, it } from "vitest";
import { evaluarRiesgoStock } from "@/lib/riesgo-stock";
import type { StockSugerido } from "@/lib/stock-sugerido";
import type { ResultadoEOQ } from "@/lib/eoq";

const SIN_STOCK_SUGERIDO: StockSugerido = {
  disponible: false,
  razonNoDisponible: "Sin salidas registradas todavía.",
  demandaPromedioDiaria: 0,
  desviacionDemandaDiaria: 0,
  leadTimePromedioDias: 0,
  stockSeguridad: 0,
  puntoReorden: 0,
  diasHistorial: 0,
  numeroComprasConsideradas: 0,
};

function stockSugeridoDisponible(
  overrides: Partial<StockSugerido> = {}
): StockSugerido {
  return {
    disponible: true,
    demandaPromedioDiaria: 10,
    desviacionDemandaDiaria: 0,
    leadTimePromedioDias: 5,
    stockSeguridad: 0,
    puntoReorden: 50,
    diasHistorial: 30,
    numeroComprasConsideradas: 2,
    ...overrides,
  };
}

describe("evaluarRiesgoStock — umbral de disparo", () => {
  it("no dispara si el mínimo no está configurado (<=0) y no hay fórmula disponible", () => {
    const r = evaluarRiesgoStock({
      stockActual: 0,
      stockMinimo: 0,
      proveedorDiasEntrega: null,
      stockSugerido: SIN_STOCK_SUGERIDO,
      eoq: null,
    });
    expect(r.debeCrearCaso).toBe(false);
  });

  it("dispara con el mínimo simple cuando no hay fórmula pero el mínimo sí está configurado", () => {
    const r = evaluarRiesgoStock({
      stockActual: 5,
      stockMinimo: 10,
      proveedorDiasEntrega: null,
      stockSugerido: SIN_STOCK_SUGERIDO,
      eoq: null,
    });
    expect(r.debeCrearCaso).toBe(true);
  });

  it("dispara con el punto de reorden calculado cuando hay fórmula disponible", () => {
    const r = evaluarRiesgoStock({
      stockActual: 40,
      stockMinimo: 10, // el mínimo manual quedó desactualizado, no debe usarse
      proveedorDiasEntrega: null,
      stockSugerido: stockSugeridoDisponible({ puntoReorden: 50 }),
      eoq: null,
    });
    expect(r.debeCrearCaso).toBe(true);
  });

  it("no dispara si el stock sigue por encima del punto de reorden", () => {
    const r = evaluarRiesgoStock({
      stockActual: 60,
      stockMinimo: 10,
      proveedorDiasEntrega: null,
      stockSugerido: stockSugeridoDisponible({ puntoReorden: 50 }),
      eoq: null,
    });
    expect(r.debeCrearCaso).toBe(false);
  });
});

describe("evaluarRiesgoStock — nivel de riesgo (tiempo de entrega vs. cobertura)", () => {
  it("medio si no hay tiempo de entrega conocido (ni inferido ni declarado)", () => {
    const r = evaluarRiesgoStock({
      stockActual: 5,
      stockMinimo: 10,
      proveedorDiasEntrega: null,
      stockSugerido: SIN_STOCK_SUGERIDO,
      eoq: null,
    });
    expect(r.nivelRiesgo).toBe("medio");
    expect(r.leadTimeUsado).toBeNull();
  });

  it("alto si hay tiempo de entrega declarado pero no se puede estimar la cobertura", () => {
    const r = evaluarRiesgoStock({
      stockActual: 5,
      stockMinimo: 10,
      proveedorDiasEntrega: 7,
      stockSugerido: SIN_STOCK_SUGERIDO,
      eoq: null,
    });
    expect(r.nivelRiesgo).toBe("alto");
    expect(r.leadTimeUsado).toBe(7);
    expect(r.diasCobertura).toBeNull();
  });

  it("crítico cuando la cobertura restante es menor o igual al tiempo de entrega", () => {
    // demanda 10/día, lead time inferido 5 días -> cobertura crítica si stock <= 50.
    const r = evaluarRiesgoStock({
      stockActual: 40, // 4 días de cobertura vs 5 de entrega
      stockMinimo: 10,
      proveedorDiasEntrega: null,
      stockSugerido: stockSugeridoDisponible({
        puntoReorden: 50,
        leadTimePromedioDias: 5,
        demandaPromedioDiaria: 10,
      }),
      eoq: null,
    });
    expect(r.diasCobertura).toBeCloseTo(4, 5);
    expect(r.nivelRiesgo).toBe("critico");
  });

  it("alto cuando la cobertura tiene un margen corto (entre 1x y 1.5x el tiempo de entrega)", () => {
    const r = evaluarRiesgoStock({
      stockActual: 65, // 6.5 días de cobertura vs 5 de entrega -> 1.3x
      stockMinimo: 10,
      proveedorDiasEntrega: null,
      stockSugerido: stockSugeridoDisponible({
        puntoReorden: 100,
        leadTimePromedioDias: 5,
        demandaPromedioDiaria: 10,
      }),
      eoq: null,
    });
    expect(r.diasCobertura).toBeCloseTo(6.5, 5);
    expect(r.nivelRiesgo).toBe("alto");
  });

  it("medio cuando hay margen amplio frente al tiempo de entrega", () => {
    const r = evaluarRiesgoStock({
      stockActual: 90, // 9 días de cobertura vs 5 de entrega -> 1.8x
      stockMinimo: 10,
      proveedorDiasEntrega: null,
      stockSugerido: stockSugeridoDisponible({
        puntoReorden: 100,
        leadTimePromedioDias: 5,
        demandaPromedioDiaria: 10,
      }),
      eoq: null,
    });
    expect(r.diasCobertura).toBeCloseTo(9, 5);
    expect(r.nivelRiesgo).toBe("medio");
  });

  it("usa el tiempo de entrega declarado del proveedor cuando no hay suficiente historial de compras", () => {
    const r = evaluarRiesgoStock({
      stockActual: 40,
      stockMinimo: 10,
      proveedorDiasEntrega: 8,
      stockSugerido: SIN_STOCK_SUGERIDO,
      eoq: null,
    });
    expect(r.leadTimeUsado).toBe(8);
  });
});

describe("evaluarRiesgoStock — cantidad sugerida", () => {
  it("usa la EOQ cuando está disponible", () => {
    const eoq: ResultadoEOQ = {
      disponible: true,
      demandaAnual: 3650,
      costoOrdenar: 500,
      tasaMantenimientoAnual: 0.2,
      cantidadEconomica: 134.9,
      numeroPedidosAlAno: 27,
    };
    const r = evaluarRiesgoStock({
      stockActual: 40,
      stockMinimo: 10,
      proveedorDiasEntrega: null,
      stockSugerido: stockSugeridoDisponible({ puntoReorden: 50 }),
      eoq,
    });
    expect(r.cantidadSugerida).toBe(135);
  });

  it("usa la brecha hasta el punto de reorden si no hay EOQ", () => {
    const r = evaluarRiesgoStock({
      stockActual: 40,
      stockMinimo: 10,
      proveedorDiasEntrega: null,
      stockSugerido: stockSugeridoDisponible({ puntoReorden: 55 }),
      eoq: null,
    });
    expect(r.cantidadSugerida).toBe(15);
  });

  it("cae al respaldo basado en el mínimo si tampoco hay punto de reorden", () => {
    const r = evaluarRiesgoStock({
      stockActual: 4,
      stockMinimo: 10,
      proveedorDiasEntrega: null,
      stockSugerido: SIN_STOCK_SUGERIDO,
      eoq: null,
    });
    expect(r.cantidadSugerida).toBe(11); // ceil(10*1.5 - 4) = ceil(11) = 11
  });

  it("nunca sugiere menos de 1 unidad", () => {
    const r = evaluarRiesgoStock({
      stockActual: 100,
      stockMinimo: 10,
      proveedorDiasEntrega: null,
      stockSugerido: SIN_STOCK_SUGERIDO,
      eoq: null,
    });
    expect(r.cantidadSugerida).toBeGreaterThanOrEqual(1);
  });
});
