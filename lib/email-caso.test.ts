import { describe, expect, it } from "vitest";
import { matchReferenciaEnAsunto } from "@/lib/email-caso";

const CASOS = [
  { id: "c1", referencia: "OC-123456" },
  { id: "c2", referencia: "OC-654321-0" },
  { id: "c3", referencia: "SOL-999888" },
  { id: "c4", referencia: null },
];

describe("matchReferenciaEnAsunto", () => {
  it("encuentra el código al inicio del asunto", () => {
    expect(matchReferenciaEnAsunto("OC-123456 — cotización lista", CASOS)?.id).toBe(
      "c1"
    );
  });

  it("encuentra el código al final, entre corchetes", () => {
    expect(
      matchReferenciaEnAsunto("Re: Solicitud de cotización [OC-123456]", CASOS)?.id
    ).toBe("c1");
  });

  it("encuentra un código con sufijo de proveedor (OC-xxxxxx-N)", () => {
    expect(matchReferenciaEnAsunto("RE: [OC-654321-0]", CASOS)?.id).toBe("c2");
  });

  it("encuentra un código de solicitud (SOL-...)", () => {
    expect(matchReferenciaEnAsunto("Cotización para [SOL-999888]", CASOS)?.id).toBe(
      "c3"
    );
  });

  it("ignora mayúsculas/minúsculas", () => {
    expect(matchReferenciaEnAsunto("re: [oc-123456]", CASOS)?.id).toBe("c1");
  });

  it("regresa null si no hay ningún código en el asunto", () => {
    expect(matchReferenciaEnAsunto("Solicitud de cotización de aluminio", CASOS)).toBeNull();
  });

  it("regresa null si el código no corresponde a ningún caso conocido", () => {
    expect(matchReferenciaEnAsunto("Re: [OC-000000]", CASOS)).toBeNull();
  });

  it("no explota con casos sin referencia (null)", () => {
    expect(matchReferenciaEnAsunto("[OC-123456]", CASOS)).not.toBeNull();
  });
});
