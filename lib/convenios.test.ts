import { describe, expect, it } from "vitest";
import { esConvenioVigente } from "@/lib/convenios";

const HOY = new Date("2026-07-17T15:00:00.000Z");

describe("esConvenioVigente", () => {
  it("vigente si está activo y sin fecha de vencimiento", () => {
    expect(
      esConvenioVigente({ activo: true, vigencia_hasta: null }, HOY)
    ).toBe(true);
  });

  it("no vigente si está inactivo, aunque no haya vencido", () => {
    expect(
      esConvenioVigente(
        { activo: false, vigencia_hasta: "2027-01-01" },
        HOY
      )
    ).toBe(false);
  });

  it("no vigente si la fecha de vencimiento ya pasó", () => {
    expect(
      esConvenioVigente({ activo: true, vigencia_hasta: "2026-07-16" }, HOY)
    ).toBe(false);
  });

  it("vigente el mismo día en que vence (límite)", () => {
    expect(
      esConvenioVigente({ activo: true, vigencia_hasta: "2026-07-17" }, HOY)
    ).toBe(true);
  });

  it("vigente si la fecha de vencimiento es futura", () => {
    expect(
      esConvenioVigente({ activo: true, vigencia_hasta: "2026-07-18" }, HOY)
    ).toBe(true);
  });
});
