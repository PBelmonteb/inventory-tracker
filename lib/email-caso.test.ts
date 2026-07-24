import { describe, expect, it } from "vitest";
import { esRemitenteExterno, matchReferenciaEnAsunto } from "@/lib/email-caso";

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

describe("esRemitenteExterno", () => {
  it("es externo si el dominio no coincide con el propio", () => {
    expect(esRemitenteExterno("compras@proveedor.mx", "miempresa.com")).toBe(true);
  });

  it("no es externo si el dominio coincide con el propio", () => {
    expect(esRemitenteExterno("juan@miempresa.com", "miempresa.com")).toBe(false);
  });

  it("ignora mayúsculas/minúsculas al comparar dominios", () => {
    expect(esRemitenteExterno("Juan@MiEmpresa.COM", "miempresa.com")).toBe(false);
  });

  it("funciona con remitente tipo 'Nombre <a@b.mx>'", () => {
    expect(esRemitenteExterno("Juan Pérez <juan@miempresa.com>", "miempresa.com")).toBe(
      false
    );
  });

  it("sin dominio propio configurado, trata TODO como externo (por defecto desconfiar)", () => {
    expect(esRemitenteExterno("juan@miempresa.com", null)).toBe(true);
  });
});
