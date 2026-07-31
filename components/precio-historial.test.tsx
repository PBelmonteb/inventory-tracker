// @vitest-environment jsdom
//
// PrecioHistorial ya tuvo un bug real (jul 2026): cuando costo y precio de
// venta se capturan en el mismo instante exacto, Recharts genera keys de
// React duplicadas al dibujar el eje X. Se arregló forzando que cada punto
// avance al menos 1ms (construirSerie, ahora exportado para poder probarlo
// directamente).
//
// Recharts bajo jsdom es frágil (depende de mediciones reales de layout que
// jsdom no provee) — en vez de pelear con eso, se mockea `recharts` para
// poder inspeccionar el prop `data` que realmente le llega al LineChart, que
// es donde vivía el bug. Así se prueba el componente completo (no solo la
// función aislada) sin depender de que Recharts renderice de verdad.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { construirSerie, PrecioHistorial } from "./precio-historial";
import type { HistorialPrecio, MaterialConRelaciones } from "@/lib/types";

let ultimaDataLineChart: { fecha: number }[] | null = null;

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  LineChart: ({ data, children }: { data: { fecha: number }[]; children: React.ReactNode }) => {
    ultimaDataLineChart = data;
    return <div data-testid="line-chart">{children}</div>;
  },
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

function material(overrides: Partial<MaterialConRelaciones> = {}): MaterialConRelaciones {
  return {
    id: "m1",
    sku: "SKU-1",
    nombre: "Material de prueba",
    descripcion: null,
    categoria_id: null,
    ubicacion_id: null,
    proveedor_id: null,
    unidad: "pza",
    stock_actual: 10,
    stock_minimo: 5,
    aviso_valor: 20,
    aviso_modo: "porcentaje",
    costo_unitario: 10,
    precio_venta: 15,
    activo: true,
    requiere_inspeccion_calidad: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    categorias: null,
    ubicaciones: null,
    proveedores: null,
    ...overrides,
  };
}

function puntoHistorial(overrides: Partial<HistorialPrecio>): HistorialPrecio {
  return {
    id: Math.random().toString(),
    material_id: "m1",
    material_nombre: "Material de prueba",
    material_sku: "SKU-1",
    tipo: "costo",
    valor: 10,
    fuente: "inicial",
    proveedor_id: null,
    cantidad: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("construirSerie", () => {
  it("fuerza fechas únicas cuando costo y venta llegan en el mismo instante exacto", () => {
    const mismoInstante = "2026-07-03T19:27:54.577Z";
    const historial = [
      puntoHistorial({ tipo: "costo", valor: 10, created_at: mismoInstante }),
      puntoHistorial({ tipo: "venta", valor: 15, created_at: mismoInstante }),
    ];

    const serie = construirSerie(historial);
    const fechas = serie.map((p) => p.fecha);

    expect(new Set(fechas).size).toBe(fechas.length); // sin duplicados
    expect(serie[1].fecha).toBeGreaterThan(serie[0].fecha);
  });

  it("no altera fechas que ya son distintas", () => {
    const historial = [
      puntoHistorial({ tipo: "costo", valor: 10, created_at: "2026-01-01T00:00:00.000Z" }),
      puntoHistorial({ tipo: "venta", valor: 15, created_at: "2026-02-01T00:00:00.000Z" }),
    ];
    const serie = construirSerie(historial);
    expect(serie[0].fecha).toBe(new Date("2026-01-01T00:00:00.000Z").getTime());
    expect(serie[1].fecha).toBe(new Date("2026-02-01T00:00:00.000Z").getTime());
  });
});

describe("<PrecioHistorial />", () => {
  it("muestra el mensaje de 'sin historial suficiente' con menos de 2 puntos", () => {
    render(<PrecioHistorial material={material()} historial={[]} />);
    expect(
      screen.getByText(/aún no hay suficiente historial/i)
    ).toBeInTheDocument();
  });

  it("muestra costo, precio de venta y margen calculados", () => {
    render(
      <PrecioHistorial
        material={material({ costo_unitario: 10, precio_venta: 15 })}
        historial={[
          puntoHistorial({ tipo: "costo", valor: 10, created_at: "2026-01-01T00:00:00.000Z" }),
          puntoHistorial({ tipo: "venta", valor: 15, created_at: "2026-02-01T00:00:00.000Z" }),
        ]}
      />
    );
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("$15.00")).toBeInTheDocument();
    expect(screen.getByText("$5.00")).toBeInTheDocument(); // margen
  });

  it("le pasa a la gráfica datos sin fechas duplicadas, incluso con costo+venta simultáneos", () => {
    const mismoInstante = "2026-07-03T19:27:54.577Z";
    render(
      <PrecioHistorial
        material={material()}
        historial={[
          puntoHistorial({ tipo: "costo", valor: 10, created_at: mismoInstante }),
          puntoHistorial({ tipo: "venta", valor: 15, created_at: mismoInstante }),
        ]}
      />
    );

    expect(ultimaDataLineChart).not.toBeNull();
    const fechas = ultimaDataLineChart!.map((p) => p.fecha);
    expect(new Set(fechas).size).toBe(fechas.length);
  });
});
