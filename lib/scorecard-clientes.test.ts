import { describe, expect, it } from "vitest";
import { calcularScorecardClientes, type CasoVentaParaScorecard } from "@/lib/scorecard-clientes";

function caso(overrides: Partial<CasoVentaParaScorecard>): CasoVentaParaScorecard {
  return {
    clienteId: "c1",
    cancelado: false,
    entregado: false,
    monto: 1000,
    costoEstimado: 400,
    tuvoDevolucion: false,
    ...overrides,
  };
}

describe("calcularScorecardClientes — casos y valor", () => {
  it("cuenta casos cancelados en el total pero los excluye del valor vendido", () => {
    const casos = [caso({}), caso({ cancelado: true, monto: 500 })];
    const r = calcularScorecardClientes(casos);
    expect(r.c1.numCasos).toBe(1);
    expect(r.c1.valorTotalVendido).toBe(1000);
    expect(r.c1.ticketPromedio).toBe(1000);
  });

  it("ticket promedio es null sin ningún caso válido", () => {
    const casos = [caso({ cancelado: true })];
    const r = calcularScorecardClientes(casos);
    expect(r.c1.numCasos).toBe(0);
    expect(r.c1.ticketPromedio).toBeNull();
  });
});

describe("calcularScorecardClientes — tasa de cancelación", () => {
  it("mide sobre el total de casos, incluidos los cancelados", () => {
    const casos = [caso({}), caso({}), caso({ cancelado: true })];
    const r = calcularScorecardClientes(casos);
    expect(r.c1.tasaCancelacion).toEqual({ pct: (2 / 3) * 100, cumplidos: 2, conDato: 3 });
  });

  it("es null si el cliente no tiene ningún caso", () => {
    const r = calcularScorecardClientes([]);
    expect(r.c1).toBeUndefined();
  });
});

describe("calcularScorecardClientes — tasa de devolución", () => {
  it("solo se mide sobre casos entregados", () => {
    const casos = [
      caso({ entregado: true, tuvoDevolucion: true }),
      caso({ entregado: true, tuvoDevolucion: false }),
      caso({ entregado: false }), // cotización, no cuenta
    ];
    const r = calcularScorecardClientes(casos);
    expect(r.c1.tasaDevolucion).toEqual({ pct: 50, cumplidos: 1, conDato: 2 });
  });

  it("es null si el cliente no tiene ningún caso entregado todavía", () => {
    const casos = [caso({ entregado: false })];
    const r = calcularScorecardClientes(casos);
    expect(r.c1.tasaDevolucion).toBeNull();
  });
});

describe("calcularScorecardClientes — margen estimado", () => {
  it("resta el costo estimado de los casos válidos al valor vendido", () => {
    const casos = [caso({ monto: 1000, costoEstimado: 400 }), caso({ monto: 500, costoEstimado: 100 })];
    const r = calcularScorecardClientes(casos);
    expect(r.c1.margenEstimado).toBe(1000);
  });

  it("no cuenta el costo de casos cancelados", () => {
    const casos = [caso({ monto: 1000, costoEstimado: 400 }), caso({ cancelado: true, costoEstimado: 999 })];
    const r = calcularScorecardClientes(casos);
    expect(r.c1.margenEstimado).toBe(600);
  });
});
