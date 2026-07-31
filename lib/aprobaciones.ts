// Bandeja de aprobaciones unificada — todo lo que necesita una decisión de
// un gestor en un solo lugar, sin entrar módulo por módulo (estilo "My
// Inbox" de SAP Fiori: casos por autorizar, conteos cíclicos listos para
// aplicar, solicitudes de compra con varias cotizaciones esperando
// ganadora). Composición pura sobre datos que ya existían; la única pieza
// realmente nueva es getSolicitudesAbiertas() (lib/data.ts), que no tenía
// un fetcher a granel todavía.
//
// getInicioGestor() (lib/inicio.ts) reusa este mismo cálculo para sus
// tarjetas de "Por autorizar"/"Conteos por revisar" — antes de esto había
// tres lugares calculando por separado si un caso "requiere admin"
// (proveedores-view.tsx, lib/actions/autorizacion.ts, lib/inicio.ts);
// ahora el LISTADO tiene una sola fuente. El candado de verdad sigue (y
// debe seguir) viviendo en el server action — esto es solo para decidir
// qué mostrar, nunca autoriza nada por sí mismo.

import {
  getCasosCompra,
  getConteos,
  getInspeccionesCalidad,
  getSolicitudesAbiertas,
  getConfiguracionAutorizacion,
} from "@/lib/data";
import type {
  CasoCompraConRelaciones,
  Conteo,
  InspeccionCalidad,
  SolicitudCompraConRelaciones,
} from "@/lib/types";

export interface CasoPorAutorizar extends CasoCompraConRelaciones {
  requiereAdmin: boolean;
}

export interface BandejaAprobaciones {
  porAutorizar: CasoPorAutorizar[];
  conteosPorRevisar: Conteo[];
  solicitudesPorResolver: SolicitudCompraConRelaciones[];
  inspeccionesPendientes: InspeccionCalidad[];
}

export async function getBandejaAprobaciones(): Promise<BandejaAprobaciones> {
  const [casosCompra, conteos, solicitudes, config, inspecciones] = await Promise.all([
    getCasosCompra(),
    getConteos(),
    getSolicitudesAbiertas(),
    getConfiguracionAutorizacion(),
    getInspeccionesCalidad(),
  ]);

  const porAutorizar: CasoPorAutorizar[] = casosCompra
    .filter((c) => c.estado === "por_autorizar")
    .sort((a, b) => b.monto_estimado - a.monto_estimado)
    .map((c) => ({ ...c, requiereAdmin: c.monto_estimado > config.monto_umbral_admin }));

  const conteosPorRevisar = conteos.filter((c) => c.estado === "contado");

  // Solo cuenta como "por resolver" si de verdad hay más de una cotización
  // viva sin ganadora — una solicitud con una sola oferta no necesita
  // decisión, solo recibirla (eso vive en Proveedores, no aquí).
  const solicitudesPorResolver = solicitudes.filter(
    (s) => s.casos.filter((c) => c.estado !== "cancelado").length > 1
  );

  const inspeccionesPendientes = inspecciones.filter((i) => i.estado === "pendiente");

  return { porAutorizar, conteosPorRevisar, solicitudesPorResolver, inspeccionesPendientes };
}
