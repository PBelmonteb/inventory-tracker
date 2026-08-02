import { describe, expect, it } from "vitest";
import { calcularScorecardProveedores, type CasoRecibidoParaScorecard } from "@/lib/scorecard-proveedores";

const AHORA = new Date("2026-07-15T00:00:00.000Z");

function haceDias(dias: number): string {
  return new Date(AHORA.getTime() - dias * 86400000).toISOString();
}

function caso(overrides: Partial<CasoRecibidoParaScorecard>): CasoRecibidoParaScorecard {
  return {
    proveedorId: "p1",
    createdAt: haceDias(10),
    updatedAt: haceDias(5),
    montoEstimado: 1000,
    cantidadEstimada: 100,
    diasEntregaComprometido: null,
    precioPactado: null,
    inspeccionCalidad: null,
    ...overrides,
  };
}

describe("calcularScorecardProveedores — tiempo de entrega", () => {
  it("cumple si el lead time real quedó dentro de lo comprometido", () => {
    const casos = [
      // creado hace 10, recibido hace 5 -> lead time real = 5 días.
      caso({ diasEntregaComprometido: 7 }),
    ];
    const r = calcularScorecardProveedores(casos);
    expect(r.p1.leadTimePromedioDias).toBeCloseTo(5, 5);
    expect(r.p1.cumplimientoEntrega).toEqual({ pct: 100, cumplidos: 1, conDato: 1 });
  });

  it("no cumple si el lead time real superó lo comprometido", () => {
    const casos = [caso({ diasEntregaComprometido: 3 })]; // real = 5 > 3
    const r = calcularScorecardProveedores(casos);
    expect(r.p1.cumplimientoEntrega).toEqual({ pct: 0, cumplidos: 0, conDato: 1 });
  });

  it("casos sin dato comprometido no cuentan para el % de cumplimiento", () => {
    const casos = [
      caso({ diasEntregaComprometido: 7 }), // cumple
      caso({ diasEntregaComprometido: null }), // sin referencia, se excluye
    ];
    const r = calcularScorecardProveedores(casos);
    expect(r.p1.cumplimientoEntrega).toEqual({ pct: 100, cumplidos: 1, conDato: 1 });
    // pero el lead time promedio sí incluye a todos los pedidos.
    expect(r.p1.numPedidosRecibidos).toBe(2);
  });

  it("sin ningún dato comprometido en todo el proveedor, cumplimiento es null (no 0%)", () => {
    const casos = [caso({ diasEntregaComprometido: null })];
    const r = calcularScorecardProveedores(casos);
    expect(r.p1.cumplimientoEntrega).toBeNull();
  });
});

describe("calcularScorecardProveedores — precio", () => {
  it("cumple si el precio unitario pagado no superó el pactado", () => {
    const casos = [caso({ montoEstimado: 1000, cantidadEstimada: 100, precioPactado: 10 })]; // 10 <= 10
    const r = calcularScorecardProveedores(casos);
    expect(r.p1.cumplimientoPrecio).toEqual({ pct: 100, cumplidos: 1, conDato: 1 });
  });

  it("no cumple si pagó más de lo pactado", () => {
    const casos = [caso({ montoEstimado: 1200, cantidadEstimada: 100, precioPactado: 10 })]; // 12 > 10
    const r = calcularScorecardProveedores(casos);
    expect(r.p1.cumplimientoPrecio).toEqual({ pct: 0, cumplidos: 0, conDato: 1 });
  });

  it("casos sin convenio ni cantidad no cuentan para el % de precio", () => {
    const casos = [
      caso({ precioPactado: null }),
      caso({ cantidadEstimada: null, precioPactado: 10 }),
    ];
    const r = calcularScorecardProveedores(casos);
    expect(r.p1.cumplimientoPrecio).toBeNull();
  });
});

describe("calcularScorecardProveedores — calidad", () => {
  it("cumple si la inspección resuelta no rechazó nada", () => {
    const casos = [
      caso({ inspeccionCalidad: { cantidadRecibida: 50, cantidadRechazada: 0 } }),
    ];
    const r = calcularScorecardProveedores(casos);
    expect(r.p1.cumplimientoCalidad).toEqual({ pct: 100, cumplidos: 1, conDato: 1 });
  });

  it("no cumple si se rechazó algo, aunque sea parcial", () => {
    const casos = [
      caso({ inspeccionCalidad: { cantidadRecibida: 50, cantidadRechazada: 5 } }),
    ];
    const r = calcularScorecardProveedores(casos);
    expect(r.p1.cumplimientoCalidad).toEqual({ pct: 0, cumplidos: 0, conDato: 1 });
  });

  it("casos sin inspección (material sin bloqueo de calidad) no cuentan", () => {
    const casos = [
      caso({ inspeccionCalidad: { cantidadRecibida: 50, cantidadRechazada: 0 } }),
      caso({ inspeccionCalidad: null }),
    ];
    const r = calcularScorecardProveedores(casos);
    expect(r.p1.cumplimientoCalidad).toEqual({ pct: 100, cumplidos: 1, conDato: 1 });
    expect(r.p1.numPedidosRecibidos).toBe(2);
  });

  it("sin ninguna inspección resuelta en todo el proveedor, cumplimiento es null (no 100%)", () => {
    const casos = [caso({ inspeccionCalidad: null })];
    const r = calcularScorecardProveedores(casos);
    expect(r.p1.cumplimientoCalidad).toBeNull();
  });
});

describe("calcularScorecardProveedores — score general y agrupación", () => {
  it("promedia solo las métricas que sí tienen dato, e ignora la que no", () => {
    const casos = [
      caso({ diasEntregaComprometido: 7, precioPactado: null }), // entrega 100%, precio sin dato
    ];
    const r = calcularScorecardProveedores(casos);
    expect(r.p1.scoreGeneral).toBeCloseTo(100, 5);
  });

  it("sin ningún dato de referencia (ni entrega ni precio), score es null", () => {
    const casos = [caso({ diasEntregaComprometido: null, precioPactado: null })];
    const r = calcularScorecardProveedores(casos);
    expect(r.p1.scoreGeneral).toBeNull();
  });

  it("agrupa correctamente por proveedor, cada uno con sus propias métricas", () => {
    const casos = [
      caso({ proveedorId: "p1", diasEntregaComprometido: 7 }), // cumple
      caso({ proveedorId: "p2", diasEntregaComprometido: 3 }), // no cumple (real=5)
    ];
    const r = calcularScorecardProveedores(casos);
    expect(r.p1.cumplimientoEntrega?.pct).toBe(100);
    expect(r.p2.cumplimientoEntrega?.pct).toBe(0);
    expect(Object.keys(r).sort()).toEqual(["p1", "p2"]);
  });
});
