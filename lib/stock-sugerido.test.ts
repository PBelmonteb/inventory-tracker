import { describe, expect, it } from "vitest";
import { calcularStockSugerido } from "@/lib/stock-sugerido";

const AHORA = new Date("2026-07-15T00:00:00.000Z");

function haceDias(dias: number): string {
  return new Date(AHORA.getTime() - dias * 86400000).toISOString();
}

describe("calcularStockSugerido — casos sin datos suficientes", () => {
  it("no disponible si no hay salidas registradas", () => {
    const r = calcularStockSugerido({
      salidas: [],
      comprasRecibidas: [],
      ahora: AHORA,
    });
    expect(r.disponible).toBe(false);
    expect(r.razonNoDisponible).toMatch(/sin salidas/i);
  });

  it("no disponible si el historial de salidas es más corto que el mínimo (14 días)", () => {
    const r = calcularStockSugerido({
      salidas: [{ cantidad: 5, created_at: haceDias(3) }],
      comprasRecibidas: [],
      ahora: AHORA,
    });
    expect(r.disponible).toBe(false);
    expect(r.razonNoDisponible).toMatch(/días de historial/i);
  });

  it("no disponible si hay historial de demanda pero menos de 2 compras recibidas", () => {
    const salidas = Array.from({ length: 20 }, (_, i) => ({
      cantidad: 10,
      created_at: haceDias(i * 2),
    }));
    const r = calcularStockSugerido({
      salidas,
      comprasRecibidas: [{ created_at: haceDias(60), updated_at: haceDias(55) }],
      ahora: AHORA,
    });
    expect(r.disponible).toBe(false);
    expect(r.razonNoDisponible).toMatch(/tiempo de entrega/i);
    // Aun sin poder calcular el punto de reorden, ya sabemos la demanda.
    expect(r.demandaPromedioDiaria).toBeGreaterThan(0);
  });
});

describe("calcularStockSugerido — caso completo", () => {
  it("calcula demanda, desviación, lead time y punto de reorden correctamente", () => {
    // Consumo constante de 10/día durante 30 días -> demanda promedio 10,
    // desviación 0 (consumo perfectamente estable).
    const salidas = Array.from({ length: 30 }, (_, i) => ({
      cantidad: 10,
      created_at: haceDias(i),
    }));
    // Dos compras recibidas con lead time de 4 y 6 días -> promedio 5 días.
    const comprasRecibidas = [
      { created_at: haceDias(20), updated_at: haceDias(16) }, // 4 días
      { created_at: haceDias(40), updated_at: haceDias(34) }, // 6 días
    ];

    const r = calcularStockSugerido({ salidas, comprasRecibidas, ahora: AHORA });

    expect(r.disponible).toBe(true);
    expect(r.demandaPromedioDiaria).toBeCloseTo(10, 5);
    expect(r.desviacionDemandaDiaria).toBeCloseTo(0, 5);
    expect(r.leadTimePromedioDias).toBeCloseTo(5, 5);
    // Desviación 0 -> stock de seguridad 0 (consumo perfectamente predecible).
    expect(r.stockSeguridad).toBeCloseTo(0, 5);
    // Punto de reorden = 10 * 5 + 0 = 50.
    expect(r.puntoReorden).toBeCloseTo(50, 5);
  });

  it("agrega stock de seguridad cuando la demanda es variable", () => {
    // Alterna 0 y 20 cada otro día -> promedio 10, con variabilidad real.
    const salidas = Array.from({ length: 30 }, (_, i) => ({
      cantidad: i % 2 === 0 ? 20 : 0,
      created_at: haceDias(i),
    }));
    const comprasRecibidas = [
      { created_at: haceDias(20), updated_at: haceDias(15) }, // 5 días
      { created_at: haceDias(40), updated_at: haceDias(35) }, // 5 días
    ];

    const r = calcularStockSugerido({ salidas, comprasRecibidas, ahora: AHORA });

    expect(r.disponible).toBe(true);
    expect(r.demandaPromedioDiaria).toBeCloseTo(10, 5);
    expect(r.desviacionDemandaDiaria).toBeCloseTo(10, 5); // stddev de [20,0,20,0,...]
    expect(r.leadTimePromedioDias).toBeCloseTo(5, 5);
    // stock de seguridad = 1.65 * 10 * sqrt(5) ≈ 36.9
    expect(r.stockSeguridad).toBeCloseTo(1.65 * 10 * Math.sqrt(5), 5);
    // punto de reorden = 10*5 + stockSeguridad ≈ 86.9
    expect(r.puntoReorden).toBeCloseTo(50 + r.stockSeguridad, 5);
  });

  it("ignora salidas fuera de la ventana de análisis (90 días por defecto)", () => {
    const salidasRecientes = Array.from({ length: 20 }, (_, i) => ({
      cantidad: 5,
      created_at: haceDias(i),
    }));
    const salidaMuyVieja = { cantidad: 999, created_at: haceDias(500) };
    const comprasRecibidas = [
      { created_at: haceDias(20), updated_at: haceDias(15) },
      { created_at: haceDias(40), updated_at: haceDias(35) },
    ];

    const r = calcularStockSugerido({
      salidas: [...salidasRecientes, salidaMuyVieja],
      comprasRecibidas,
      ahora: AHORA,
    });

    // Si la salida de hace 500 días se incluyera, la demanda promedio se
    // dispararía muchísimo — confirma que quedó fuera de la ventana.
    expect(r.demandaPromedioDiaria).toBeLessThan(10);
  });
});
