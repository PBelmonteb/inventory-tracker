import { describe, expect, it } from "vitest";
import {
  rangoPeriodo,
  resumenComprasPeriodo,
  resumenConteosPeriodo,
  resumenClasificacionABCXYZ,
  type CasoCompraParaResumen,
  type ConteoParaResumen,
} from "@/lib/reportes-periodo";

// Compara por componentes locales (año/mes/día), no toISOString(): las
// fechas de rangoPeriodo se arman con el constructor de Date en hora
// local (new Date(año, mes, día)), y toISOString() las convierte a UTC —
// en una zona horaria con offset positivo (adelante de UTC) eso puede
// recorrer la fecha un día, haciendo que el test dependa de en qué
// timezone corra.
function fechaLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("rangoPeriodo", () => {
  it("semanal: cubre la semana lunes-domingo ya completada, sin incluir la actual", () => {
    // Miércoles 2026-07-15 (referencia) -> semana en curso empezó el
    // lunes 2026-07-13; la semana pasada completa es 07-06 a 07-13.
    const referencia = new Date(2026, 6, 15, 10, 0, 0);
    const { inicio, fin } = rangoPeriodo("semanal", referencia);
    expect(fechaLocal(inicio)).toBe("2026-07-06");
    expect(fechaLocal(fin)).toBe("2026-07-13");
  });

  it("semanal: si la referencia ya es lunes, la semana pasada es la anterior completa", () => {
    const referencia = new Date(2026, 6, 13, 6, 0, 0); // lunes
    const { inicio, fin } = rangoPeriodo("semanal", referencia);
    expect(fechaLocal(inicio)).toBe("2026-07-06");
    expect(fechaLocal(fin)).toBe("2026-07-13");
  });

  it("mensual: cubre el mes calendario anterior completo", () => {
    const referencia = new Date(2026, 7, 1);
    const { inicio, fin } = rangoPeriodo("mensual", referencia);
    expect(fechaLocal(inicio)).toBe("2026-07-01");
    expect(fechaLocal(fin)).toBe("2026-08-01");
  });

  it("mensual: cruza de año sin problema (enero -> diciembre del año anterior)", () => {
    const referencia = new Date(2026, 0, 15);
    const { inicio, fin } = rangoPeriodo("mensual", referencia);
    expect(fechaLocal(inicio)).toBe("2025-12-01");
    expect(fechaLocal(fin)).toBe("2026-01-01");
  });

  it("trimestral: cubre el trimestre calendario anterior completo", () => {
    // Octubre está en Q4 (oct-dic); el trimestre anterior es Q3 (jul-sep).
    const referencia = new Date(2026, 9, 5);
    const { inicio, fin } = rangoPeriodo("trimestral", referencia);
    expect(fechaLocal(inicio)).toBe("2026-07-01");
    expect(fechaLocal(fin)).toBe("2026-10-01");
  });

  it("trimestral: Q1 cruza a Q4 del año anterior", () => {
    const referencia = new Date(2026, 1, 10);
    const { inicio, fin } = rangoPeriodo("trimestral", referencia);
    expect(fechaLocal(inicio)).toBe("2025-10-01");
    expect(fechaLocal(fin)).toBe("2026-01-01");
  });
});

describe("resumenComprasPeriodo", () => {
  const rango = { inicio: new Date("2026-07-06"), fin: new Date("2026-07-13") };

  function caso(overrides: Partial<CasoCompraParaResumen>): CasoCompraParaResumen {
    return {
      estado: "ordenado",
      createdAt: "2026-07-08T00:00:00.000Z",
      updatedAt: "2026-07-08T12:00:00.000Z",
      montoEstimado: 1000,
      ...overrides,
    };
  }

  it("cuenta casos creados dentro del rango, sin importar su estado final", () => {
    const casos = [
      caso({ estado: "pendiente", createdAt: "2026-07-08T00:00:00.000Z" }),
      caso({ estado: "por_autorizar", createdAt: "2026-07-09T00:00:00.000Z" }),
      caso({ estado: "pendiente", createdAt: "2026-06-01T00:00:00.000Z" }), // fuera de rango
    ];
    expect(resumenComprasPeriodo(casos, rango).casosCreados).toBe(2);
  });

  it("cuenta autorizados (ordenado/recibido) por updated_at, no por created_at", () => {
    const casos = [
      // creado antes del periodo, pero autorizado (updated_at) dentro.
      caso({ estado: "ordenado", createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-07-09T00:00:00.000Z" }),
      caso({ estado: "recibido", createdAt: "2026-07-06T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z" }),
      caso({ estado: "por_autorizar", updatedAt: "2026-07-09T00:00:00.000Z" }), // aún no autorizado
    ];
    const r = resumenComprasPeriodo(casos, rango);
    expect(r.casosAutorizados).toBe(2);
    expect(r.montoTotalAutorizado).toBe(2000);
  });

  it("cuenta rechazados y calcula tiempo promedio de autorización en horas", () => {
    const casos = [
      caso({
        estado: "ordenado",
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T06:00:00.000Z", // 6 horas
      }),
      caso({
        estado: "ordenado",
        createdAt: "2026-07-08T00:00:00.000Z",
        updatedAt: "2026-07-08T18:00:00.000Z", // 18 horas
      }),
      caso({ estado: "rechazado", updatedAt: "2026-07-09T00:00:00.000Z" }),
    ];
    const r = resumenComprasPeriodo(casos, rango);
    expect(r.casosRechazados).toBe(1);
    expect(r.tiempoPromedioAutorizacionHoras).toBeCloseTo(12, 5);
  });

  it("tiempoPromedioAutorizacionHoras es null si no hubo autorizados en el periodo", () => {
    const r = resumenComprasPeriodo([caso({ estado: "pendiente" })], rango);
    expect(r.tiempoPromedioAutorizacionHoras).toBeNull();
  });
});

describe("resumenConteosPeriodo", () => {
  const rango = { inicio: new Date("2026-07-06"), fin: new Date("2026-07-13") };

  function conteo(overrides: Partial<ConteoParaResumen>): ConteoParaResumen {
    return {
      estado: "aplicado",
      aplicadoAt: "2026-07-08T00:00:00.000Z",
      items: [{ stockEsperado: 10, cantidadContada: 10 }],
      ...overrides,
    };
  }

  it("solo cuenta conteos aplicados dentro del periodo", () => {
    const conteos = [
      conteo({}),
      conteo({ estado: "contado", aplicadoAt: null }), // no aplicado aún
      conteo({ aplicadoAt: "2026-06-01T00:00:00.000Z" }), // fuera de rango
    ];
    expect(resumenConteosPeriodo(conteos, rango).realizados).toBe(1);
  });

  it("marca 'con diferencia' si algún item no coincide", () => {
    const conteos = [
      conteo({ items: [{ stockEsperado: 10, cantidadContada: 10 }] }), // sin diferencia
      conteo({ items: [{ stockEsperado: 10, cantidadContada: 8 }] }), // con diferencia
      conteo({ items: [{ stockEsperado: 10, cantidadContada: null }] }), // sin contar, no cuenta como diferencia
    ];
    const r = resumenConteosPeriodo(conteos, rango);
    expect(r.realizados).toBe(3);
    expect(r.conDiferencia).toBe(1);
  });
});

describe("resumenClasificacionABCXYZ", () => {
  it("cuenta materiales por combinación de clase", () => {
    const items = [
      { claseABC: "A" as const, claseXYZ: "X" as const },
      { claseABC: "A" as const, claseXYZ: "X" as const },
      { claseABC: "A" as const, claseXYZ: "Z" as const },
      { claseABC: "C" as const, claseXYZ: "sin datos" as const },
    ];
    expect(resumenClasificacionABCXYZ(items)).toEqual({
      AX: 2,
      AZ: 1,
      "Csin datos": 1,
    });
  });

  it("lista vacía da un objeto vacío", () => {
    expect(resumenClasificacionABCXYZ([])).toEqual({});
  });
});
