import { describe, expect, it } from "vitest";
import { correrMRP, type BomEdge, type MaterialParaMRP } from "@/lib/mrp";

function mat(overrides: Partial<MaterialParaMRP> & { materialId: string }): MaterialParaMRP {
  return { demandaDirecta: 0, stockActual: 0, porLlegar: 0, ...overrides };
}

function porId(resultado: ReturnType<typeof correrMRP>, id: string) {
  return resultado.requerimientos.find((r) => r.materialId === id)!;
}

describe("correrMRP — material simple (sin BOM)", () => {
  it("requerimiento neto = demanda directa - stock - por llegar", () => {
    const r = correrMRP(
      [mat({ materialId: "perfil", demandaDirecta: 100, stockActual: 30, porLlegar: 20 })],
      []
    );
    const perfil = porId(r, "perfil");
    expect(perfil.demandaBruta).toBe(100);
    expect(perfil.disponible).toBe(50);
    expect(perfil.requerimientoNeto).toBe(50);
    expect(perfil.accion).toBe("comprar");
    expect(perfil.esProducible).toBe(false);
  });

  it("stock + por llegar suficientes -> sin requerimiento, sin acción", () => {
    const r = correrMRP(
      [mat({ materialId: "perfil", demandaDirecta: 50, stockActual: 30, porLlegar: 20 })],
      []
    );
    expect(porId(r, "perfil").requerimientoNeto).toBe(0);
    expect(porId(r, "perfil").accion).toBe("ninguna");
  });
});

describe("correrMRP — explosión BOM de un nivel", () => {
  const bom: BomEdge[] = [{ productoId: "ventana", componenteId: "perfil", cantidadPorUnidad: 4 }];

  it("demanda de venta del producible explota hacia el componente", () => {
    const r = correrMRP(
      [
        mat({ materialId: "ventana", demandaDirecta: 10, stockActual: 0, porLlegar: 0 }),
        mat({ materialId: "perfil", demandaDirecta: 0, stockActual: 0, porLlegar: 0 }),
      ],
      bom
    );
    const ventana = porId(r, "ventana");
    expect(ventana.requerimientoNeto).toBe(10);
    expect(ventana.accion).toBe("producir");

    const perfil = porId(r, "perfil");
    expect(perfil.demandaDerivada).toBe(40); // 10 ventanas × 4 perfiles c/u
    expect(perfil.requerimientoNeto).toBe(40);
    expect(perfil.accion).toBe("comprar");
    expect(perfil.fuentes).toEqual([
      { tipo: "produccion_derivada", cantidad: 40, productoOrigenId: "ventana" },
    ]);
  });

  it("si el producible ya tiene stock suficiente, NO explota demanda al componente", () => {
    const r = correrMRP(
      [
        mat({ materialId: "ventana", demandaDirecta: 10, stockActual: 10, porLlegar: 0 }),
        mat({ materialId: "perfil", demandaDirecta: 0, stockActual: 0, porLlegar: 0 }),
      ],
      bom
    );
    expect(porId(r, "ventana").requerimientoNeto).toBe(0);
    expect(porId(r, "perfil").requerimientoNeto).toBe(0);
    expect(porId(r, "perfil").fuentes).toEqual([]);
  });

  it("un componente con demanda directa PROPIA suma la derivada + la directa", () => {
    // El perfil también se vende suelto, además de usarse en la ventana.
    const r = correrMRP(
      [
        mat({ materialId: "ventana", demandaDirecta: 10 }),
        mat({ materialId: "perfil", demandaDirecta: 5 }),
      ],
      bom
    );
    const perfil = porId(r, "perfil");
    expect(perfil.demandaDirecta).toBe(5);
    expect(perfil.demandaDerivada).toBe(40);
    expect(perfil.demandaBruta).toBe(45);
  });
});

describe("correrMRP — el caso que motivó la feature: dos productos compiten por el mismo insumo", () => {
  it("suma la demanda derivada de AMBOS padres antes de netear una sola vez", () => {
    const bom: BomEdge[] = [
      { productoId: "ventana", componenteId: "perfil", cantidadPorUnidad: 4 },
      { productoId: "puerta", componenteId: "perfil", cantidadPorUnidad: 6 },
    ];
    const r = correrMRP(
      [
        mat({ materialId: "ventana", demandaDirecta: 10 }),
        mat({ materialId: "puerta", demandaDirecta: 5 }),
        mat({ materialId: "perfil", stockActual: 20 }),
      ],
      bom
    );
    const perfil = porId(r, "perfil");
    // 10×4 (ventana) + 5×6 (puerta) = 70, menos 20 en stock = 50.
    expect(perfil.demandaBruta).toBe(70);
    expect(perfil.requerimientoNeto).toBe(50);
    expect(perfil.fuentes).toHaveLength(2);
  });
});

describe("correrMRP — multinivel (producible dentro de producible)", () => {
  it("explota recursivamente: ensamble -> subensamble -> materia prima", () => {
    const bom: BomEdge[] = [
      { productoId: "ventana", componenteId: "marco", cantidadPorUnidad: 1 },
      { productoId: "marco", componenteId: "perfil", cantidadPorUnidad: 4 },
    ];
    const r = correrMRP(
      [
        mat({ materialId: "ventana", demandaDirecta: 10 }),
        mat({ materialId: "marco" }),
        mat({ materialId: "perfil" }),
      ],
      bom
    );
    expect(porId(r, "ventana").requerimientoNeto).toBe(10);
    expect(porId(r, "marco").requerimientoNeto).toBe(10);
    expect(porId(r, "marco").accion).toBe("producir");
    expect(porId(r, "perfil").requerimientoNeto).toBe(40);
    expect(porId(r, "perfil").accion).toBe("comprar");
  });
});

describe("correrMRP — ciclos en el BOM (el esquema no los impide, la UI nunca los crea)", () => {
  it("detecta el ciclo, lo marca, y no entra en loop infinito", () => {
    const bom: BomEdge[] = [
      { productoId: "a", componenteId: "b", cantidadPorUnidad: 1 },
      { productoId: "b", componenteId: "a", cantidadPorUnidad: 1 },
    ];
    const r = correrMRP([mat({ materialId: "a", demandaDirecta: 5 }), mat({ materialId: "b" })], bom);
    expect(r.materialesConCicloBOM.sort()).toEqual(["a", "b"]);
    expect(porId(r, "a").cicloDetectado).toBe(true);
    expect(porId(r, "b").cicloDetectado).toBe(true);
  });

  it("un ciclo en una rama no rompe el cálculo de materiales normales fuera de él", () => {
    const bom: BomEdge[] = [
      { productoId: "a", componenteId: "b", cantidadPorUnidad: 1 },
      { productoId: "b", componenteId: "a", cantidadPorUnidad: 1 },
      { productoId: "ventana", componenteId: "perfil", cantidadPorUnidad: 4 },
    ];
    const r = correrMRP(
      [
        mat({ materialId: "a", demandaDirecta: 5 }),
        mat({ materialId: "b" }),
        mat({ materialId: "ventana", demandaDirecta: 3 }),
        mat({ materialId: "perfil" }),
      ],
      bom
    );
    expect(porId(r, "perfil").requerimientoNeto).toBe(12);
    expect(porId(r, "perfil").cicloDetectado).toBe(false);
  });
});
