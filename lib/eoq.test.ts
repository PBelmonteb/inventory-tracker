import { describe, expect, it } from "vitest";
import { calcularEOQ } from "@/lib/eoq";

const AHORA = new Date("2026-07-15T00:00:00.000Z");

function haceDias(dias: number): string {
  return new Date(AHORA.getTime() - dias * 86400000).toISOString();
}

describe("calcularEOQ — casos sin datos suficientes", () => {
  it("no disponible sin historial de salidas", () => {
    const r = calcularEOQ({ salidas: [], costoUnitario: 10, ahora: AHORA });
    expect(r.disponible).toBe(false);
    expect(r.razonNoDisponible).toMatch(/sin salidas/i);
  });

  it("no disponible si el material no tiene costo unitario", () => {
    const salidas = Array.from({ length: 30 }, (_, i) => ({
      cantidad: 10,
      created_at: haceDias(i),
    }));
    const r = calcularEOQ({ salidas, costoUnitario: 0, ahora: AHORA });
    expect(r.disponible).toBe(false);
    expect(r.razonNoDisponible).toMatch(/costo unitario/i);
  });
});

describe("calcularEOQ — caso completo", () => {
  it("calcula EOQ con la fórmula clásica √(2DS/H)", () => {
    // Consumo constante de 10/día durante 30 días -> demanda anual = 10*365.
    const salidas = Array.from({ length: 30 }, (_, i) => ({
      cantidad: 10,
      created_at: haceDias(i),
    }));

    const r = calcularEOQ({
      salidas,
      costoUnitario: 100,
      costoOrdenar: 500,
      tasaMantenimientoAnual: 0.2,
      ahora: AHORA,
    });

    expect(r.disponible).toBe(true);
    const demandaAnualEsperada = 10 * 365;
    expect(r.demandaAnual).toBeCloseTo(demandaAnualEsperada, 5);

    const H = 100 * 0.2; // 20
    const eoqEsperado = Math.sqrt((2 * demandaAnualEsperada * 500) / H);
    expect(r.cantidadEconomica).toBeCloseTo(eoqEsperado, 5);
    expect(r.numeroPedidosAlAno).toBeCloseTo(
      demandaAnualEsperada / eoqEsperado,
      5
    );
  });

  it("usa los valores por defecto de S y H cuando no se especifican", () => {
    const salidas = Array.from({ length: 30 }, (_, i) => ({
      cantidad: 5,
      created_at: haceDias(i),
    }));
    const r = calcularEOQ({ salidas, costoUnitario: 50, ahora: AHORA });

    expect(r.disponible).toBe(true);
    expect(r.costoOrdenar).toBe(500);
    expect(r.tasaMantenimientoAnual).toBe(0.2);
  });

  it("una demanda anual mayor produce un EOQ mayor (monotonía básica)", () => {
    const salidasBajas = Array.from({ length: 30 }, (_, i) => ({
      cantidad: 2,
      created_at: haceDias(i),
    }));
    const salidasAltas = Array.from({ length: 30 }, (_, i) => ({
      cantidad: 20,
      created_at: haceDias(i),
    }));

    const rBajo = calcularEOQ({ salidas: salidasBajas, costoUnitario: 50, ahora: AHORA });
    const rAlto = calcularEOQ({ salidas: salidasAltas, costoUnitario: 50, ahora: AHORA });

    expect(rAlto.cantidadEconomica).toBeGreaterThan(rBajo.cantidadEconomica);
  });
});
