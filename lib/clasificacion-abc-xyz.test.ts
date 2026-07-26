import { describe, expect, it } from "vitest";
import { clasificarABCXYZ } from "@/lib/clasificacion-abc-xyz";

const AHORA = new Date("2026-07-15T00:00:00.000Z");

function haceDias(dias: number): string {
  return new Date(AHORA.getTime() - dias * 86400000).toISOString();
}

function salidasConstantes(cantidad: number, dias = 30) {
  return Array.from({ length: dias }, (_, i) => ({
    cantidad,
    created_at: haceDias(i),
  }));
}

describe("clasificarABCXYZ — ABC por valor de consumo", () => {
  it("el material de mayor valor cae en A y el de menor en C", () => {
    const resultado = clasificarABCXYZ(
      [
        { materialId: "caro", costoUnitario: 1000, salidas: salidasConstantes(10) },
        { materialId: "barato", costoUnitario: 1, salidas: salidasConstantes(1) },
      ],
      undefined,
      AHORA
    );

    const caro = resultado.find((r) => r.materialId === "caro")!;
    const barato = resultado.find((r) => r.materialId === "barato")!;
    expect(caro.claseABC).toBe("A");
    expect(barato.claseABC).toBe("C");
    expect(caro.pctAcumulado).toBeLessThan(barato.pctAcumulado);
  });

  it("material sin salidas nunca compite por A/B — cae en C con valor 0", () => {
    const resultado = clasificarABCXYZ(
      [
        { materialId: "activo", costoUnitario: 100, salidas: salidasConstantes(10) },
        { materialId: "quieto", costoUnitario: 500, salidas: [] },
      ],
      undefined,
      AHORA
    );

    const quieto = resultado.find((r) => r.materialId === "quieto")!;
    expect(quieto.valorAnual).toBe(0);
    expect(quieto.claseABC).toBe("C");
    expect(quieto.disponible).toBe(false);
    expect(quieto.razonNoDisponible).toMatch(/sin salidas/i);
  });

  it("los porcentajes de valor de todos los materiales suman 1 (o 0 si nadie consume)", () => {
    const resultado = clasificarABCXYZ(
      [
        { materialId: "a", costoUnitario: 10, salidas: salidasConstantes(5) },
        { materialId: "b", costoUnitario: 20, salidas: salidasConstantes(3) },
        { materialId: "c", costoUnitario: 5, salidas: salidasConstantes(1) },
      ],
      undefined,
      AHORA
    );
    const sumaPct = resultado.reduce((acc, r) => acc + r.pctValor, 0);
    expect(sumaPct).toBeCloseTo(1, 5);
  });
});

describe("clasificarABCXYZ — XYZ por variabilidad de la demanda", () => {
  it("demanda perfectamente constante cae en X (CV = 0)", () => {
    const resultado = clasificarABCXYZ(
      [{ materialId: "estable", costoUnitario: 10, salidas: salidasConstantes(10) }],
      undefined,
      AHORA
    );
    expect(resultado[0].coeficienteVariacion).toBeCloseTo(0, 5);
    expect(resultado[0].claseXYZ).toBe("X");
  });

  it("demanda muy errática (un pico aislado, el resto en cero) cae en Z", () => {
    // Una salida chica antigua (para tener >=14 días de historial) y un
    // pico grande reciente -> desviación >> promedio -> CV alto.
    const resultado = clasificarABCXYZ(
      [
        {
          materialId: "erratico",
          costoUnitario: 10,
          salidas: [
            { cantidad: 500, created_at: haceDias(5) },
            { cantidad: 0.001, created_at: haceDias(20) },
          ],
        },
      ],
      30,
      AHORA
    );
    expect(resultado[0].claseXYZ).toBe("Z");
  });

  it("sin historial suficiente, la clase XYZ es 'sin datos', no una letra inventada", () => {
    const resultado = clasificarABCXYZ(
      [{ materialId: "nuevo", costoUnitario: 10, salidas: [] }],
      undefined,
      AHORA
    );
    expect(resultado[0].coeficienteVariacion).toBeNull();
    expect(resultado[0].claseXYZ).toBe("sin datos");
  });
});
