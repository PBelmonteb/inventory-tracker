import { describe, expect, it } from "vitest";
import { validarResolucionInspeccion, type ResolucionInspeccion } from "@/lib/inspeccion-calidad";

function res(overrides: Partial<ResolucionInspeccion>): ResolucionInspeccion {
  return {
    cantidadRecibida: 100,
    cantidadLiberada: 100,
    cantidadRechazada: 0,
    motivoRechazo: null,
    ...overrides,
  };
}

describe("validarResolucionInspeccion", () => {
  it("acepta liberar todo", () => {
    expect(validarResolucionInspeccion(res({}))).toEqual({ ok: true });
  });

  it("acepta rechazar todo, con motivo", () => {
    const r = res({ cantidadLiberada: 0, cantidadRechazada: 100, motivoRechazo: "Dañado en tránsito" });
    expect(validarResolucionInspeccion(r)).toEqual({ ok: true });
  });

  it("acepta un split parcial (90 liberado / 10 rechazado), con motivo", () => {
    const r = res({ cantidadLiberada: 90, cantidadRechazada: 10, motivoRechazo: "10 piezas rayadas" });
    expect(validarResolucionInspeccion(r)).toEqual({ ok: true });
  });

  it("rechaza si liberado + rechazado no suma lo recibido", () => {
    const r = res({ cantidadLiberada: 90, cantidadRechazada: 5 });
    const v = validarResolucionInspeccion(r);
    expect(v.ok).toBe(false);
  });

  it("rechaza cantidades negativas", () => {
    const r = res({ cantidadLiberada: -1, cantidadRechazada: 101 });
    expect(validarResolucionInspeccion(r).ok).toBe(false);
  });

  it("exige motivo si hay cantidad rechazada > 0", () => {
    const r = res({ cantidadLiberada: 90, cantidadRechazada: 10, motivoRechazo: null });
    const v = validarResolucionInspeccion(r);
    expect(v).toEqual({ ok: false, error: "Captura el motivo del rechazo" });
  });

  it("motivo vacío o solo espacios cuenta como sin motivo", () => {
    const r = res({ cantidadLiberada: 90, cantidadRechazada: 10, motivoRechazo: "   " });
    expect(validarResolucionInspeccion(r).ok).toBe(false);
  });

  it("no exige motivo si no hay rechazo", () => {
    const r = res({ cantidadLiberada: 100, cantidadRechazada: 0, motivoRechazo: null });
    expect(validarResolucionInspeccion(r)).toEqual({ ok: true });
  });

  it("tolera diferencias de redondeo mínimas (punto flotante)", () => {
    const r = res({
      cantidadRecibida: 0.3,
      cantidadLiberada: 0.1,
      cantidadRechazada: 0.2,
      motivoRechazo: "Prueba de redondeo",
    });
    expect(validarResolucionInspeccion(r)).toEqual({ ok: true });
  });
});
