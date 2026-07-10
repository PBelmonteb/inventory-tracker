import { describe, expect, it } from "vitest";
import { daysSince, formatMoney, formatQty, nivelStock, normalizarTexto, puntoAviso } from "@/lib/utils";

describe("nivelStock", () => {
  it("trata stock_minimo <= 0 como 'sin configurar', nunca 'bajo'", () => {
    // Regresión: antes de la migración 0013, un material recién creado
    // (stock_minimo = 0 por default) se marcaba "bajo" con stock_actual = 0.
    expect(
      nivelStock({
        stock_actual: 0,
        stock_minimo: 0,
        aviso_valor: 20,
        aviso_modo: "porcentaje",
      })
    ).toBe("ok");
  });

  it("marca 'bajo' cuando el stock está en o por debajo del mínimo", () => {
    expect(
      nivelStock({
        stock_actual: 8,
        stock_minimo: 8,
        aviso_valor: 20,
        aviso_modo: "porcentaje",
      })
    ).toBe("bajo");
    expect(
      nivelStock({
        stock_actual: 5,
        stock_minimo: 8,
        aviso_valor: 20,
        aviso_modo: "porcentaje",
      })
    ).toBe("bajo");
  });

  it("marca 'aviso' dentro de la franja de aviso en modo porcentaje", () => {
    // mínimo 100, aviso 20% -> punto de aviso 120
    expect(
      nivelStock({
        stock_actual: 110,
        stock_minimo: 100,
        aviso_valor: 20,
        aviso_modo: "porcentaje",
      })
    ).toBe("aviso");
  });

  it("marca 'aviso' dentro de la franja de aviso en modo unidad", () => {
    // mínimo 40, aviso +150 unidades -> punto de aviso 190
    expect(
      nivelStock({
        stock_actual: 150,
        stock_minimo: 40,
        aviso_valor: 150,
        aviso_modo: "unidad",
      })
    ).toBe("aviso");
  });

  it("marca 'ok' por encima de la franja de aviso", () => {
    expect(
      nivelStock({
        stock_actual: 500,
        stock_minimo: 100,
        aviso_valor: 20,
        aviso_modo: "porcentaje",
      })
    ).toBe("ok");
  });
});

describe("puntoAviso", () => {
  it("suma unidades en modo 'unidad'", () => {
    expect(
      puntoAviso({ stock_minimo: 40, aviso_valor: 150, aviso_modo: "unidad" })
    ).toBe(190);
  });

  it("aplica porcentaje en modo 'porcentaje'", () => {
    expect(
      puntoAviso({ stock_minimo: 100, aviso_valor: 20, aviso_modo: "porcentaje" })
    ).toBe(120);
  });
});

describe("formatMoney", () => {
  it("formatea como pesos mexicanos con 2 decimales", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
  });

  it("trata null/undefined como cero", () => {
    expect(formatMoney(null)).toBe("$0.00");
    expect(formatMoney(undefined)).toBe("$0.00");
  });
});

describe("formatQty", () => {
  it("agrega la unidad cuando se provee", () => {
    expect(formatQty(200, "m")).toBe("200 m");
  });

  it("omite la unidad si no se provee", () => {
    expect(formatQty(200)).toBe("200");
  });

  it("trata null/undefined como cero", () => {
    expect(formatQty(null, "pza")).toBe("0 pza");
  });
});

describe("normalizarTexto", () => {
  it("quita acentos y pasa a minúsculas para que la búsqueda los ignore", () => {
    expect(normalizarTexto("Lámina")).toBe("lamina");
    expect(normalizarTexto("Tornillería")).toBe("tornilleria");
  });

  it("trata null/undefined como cadena vacía", () => {
    expect(normalizarTexto(null)).toBe("");
    expect(normalizarTexto(undefined)).toBe("");
  });
});

describe("daysSince", () => {
  it("regresa null si no hay fecha", () => {
    expect(daysSince(null)).toBeNull();
  });

  it("calcula días completos transcurridos", () => {
    const hace3Dias = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(daysSince(hace3Dias)).toBe(3);
  });
});
