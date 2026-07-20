import { describe, expect, it } from "vitest";
import {
  construirCorreoCotizacion,
  construirCorreoOrdenConvenio,
} from "@/lib/plantillas-correo";

const MATERIAL = { nombre: "Perfil aluminio 1\"", sku: "PERF-001", unidad: "m" };

describe("construirCorreoCotizacion", () => {
  it("pide precio, incluye material, sku y cantidad", () => {
    const { asunto, cuerpo } = construirCorreoCotizacion({
      material: MATERIAL,
      proveedorNombre: "Aluminios del Norte",
      cantidad: 150,
    });
    expect(asunto).toContain("Solicitud de cotización");
    expect(asunto).toContain(MATERIAL.nombre);
    expect(cuerpo).toContain("Aluminios del Norte");
    expect(cuerpo).toContain("PERF-001");
    expect(cuerpo).toMatch(/150/);
    expect(cuerpo).toMatch(/solicitamos cotización/i);
    // No debe mencionar un precio — todavía no se conoce.
    expect(cuerpo).not.toMatch(/\$/);
  });

  it("usa 'proveedor' genérico si no hay nombre", () => {
    const { cuerpo } = construirCorreoCotizacion({
      material: MATERIAL,
      proveedorNombre: null,
      cantidad: 10,
    });
    expect(cuerpo).toMatch(/Estimados proveedor/);
  });
});

describe("construirCorreoOrdenConvenio", () => {
  it("confirma la orden con precio, total, condiciones y referencia", () => {
    const { asunto, cuerpo } = construirCorreoOrdenConvenio({
      material: MATERIAL,
      proveedorNombre: "Aluminios del Norte",
      cantidad: 100,
      precioUnitario: 80,
      condicionesPago: "30 días fecha factura",
      diasEntregaPactado: 7,
      referencia: "OC-123456",
    });
    expect(asunto).toContain("Orden de compra OC-123456");
    expect(cuerpo).toMatch(/confirmamos la siguiente orden/i);
    expect(cuerpo).toContain("$80.00");
    expect(cuerpo).toContain("$8,000.00"); // total = 80 * 100
    expect(cuerpo).toContain("30 días fecha factura");
    expect(cuerpo).toMatch(/~7 días/);
    expect(cuerpo).toContain("OC-123456");
  });

  it("omite las líneas de entrega/condiciones cuando no vienen en el convenio", () => {
    const { cuerpo } = construirCorreoOrdenConvenio({
      material: MATERIAL,
      proveedorNombre: "Aluminios del Norte",
      cantidad: 10,
      precioUnitario: 80,
      condicionesPago: null,
      diasEntregaPactado: null,
      referencia: "OC-999",
    });
    expect(cuerpo).not.toMatch(/Tiempo de entrega acordado/);
    expect(cuerpo).not.toMatch(/Condiciones de pago/);
  });
});
