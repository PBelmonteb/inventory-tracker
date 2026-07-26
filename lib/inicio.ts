// Landing personalizado por rol ("Inicio") — en vez de que todos aterricen
// en /inventario, cada quien ve lo que de verdad le toca hoy: el gestor,
// KPIs + lo que necesita aprobar; el operario, sus pendientes y el estado
// de lo que él mismo mandó. Puro trabajo de composición — cada pieza
// (conteos, MRP, aprobaciones, reportes) ya existía; esto solo las junta y
// recorta a lo accionable, sin cálculo nuevo.

import {
  getCasosCompra,
  getCasosVenta,
  getSalidasPendientes,
  getNotificaciones,
  getCorridaMRP,
  type RequerimientoMRPConNombre,
} from "@/lib/data";
import { getBandejaAprobaciones, type CasoPorAutorizar } from "@/lib/aprobaciones";
import { getReportes, type MaterialReporte } from "@/lib/reportes";
import type {
  CasoCompraConRelaciones,
  CasoVentaConRelaciones,
  SalidaPendienteConRelaciones,
  Conteo,
  NotificacionConRelaciones,
} from "@/lib/types";

const LIMITE_LISTA = 6;
const ABIERTO_COMPRA = ["pendiente", "cotizando", "por_autorizar", "ordenado"];
const ABIERTO_VENTA = ["cotizacion", "confirmado", "en_produccion"];

export interface InicioGestor {
  kpis: {
    valorInventario: number;
    materialesStockBajo: number;
    casosPorAutorizar: number;
    conteosPorRevisar: number;
    solicitudesPorResolver: number;
    mrpAccionesPendientes: number;
  };
  porAutorizar: CasoPorAutorizar[];
  conteosPorRevisar: Conteo[];
  mrpAcciones: RequerimientoMRPConNombre[];
  stockBajo: MaterialReporte[];
}

export async function getInicioGestor(): Promise<InicioGestor> {
  const [bandeja, mrp, reportes] = await Promise.all([
    getBandejaAprobaciones(),
    getCorridaMRP(),
    getReportes(),
  ]);

  const mrpAccionable = mrp.requerimientos.filter((r) => r.accion !== "ninguna");

  return {
    kpis: {
      valorInventario: reportes.valorTotal,
      materialesStockBajo: reportes.comprarAhora.length,
      casosPorAutorizar: bandeja.porAutorizar.length,
      conteosPorRevisar: bandeja.conteosPorRevisar.length,
      solicitudesPorResolver: bandeja.solicitudesPorResolver.length,
      mrpAccionesPendientes: mrpAccionable.length,
    },
    porAutorizar: bandeja.porAutorizar.slice(0, LIMITE_LISTA),
    conteosPorRevisar: bandeja.conteosPorRevisar.slice(0, LIMITE_LISTA),
    mrpAcciones: mrpAccionable.slice(0, LIMITE_LISTA),
    stockBajo: reportes.comprarAhora.slice(0, LIMITE_LISTA),
  };
}

export interface InicioOperario {
  misCasosEnviados: CasoCompraConRelaciones[];
  responsabilidadesCompra: CasoCompraConRelaciones[];
  responsabilidadesVenta: CasoVentaConRelaciones[];
  salidasPendientes: SalidaPendienteConRelaciones[];
  notificaciones: NotificacionConRelaciones[];
}

export async function getInicioOperario(profileId: string): Promise<InicioOperario> {
  const [casosCompra, casosVenta, salidas, notificaciones] = await Promise.all([
    getCasosCompra(),
    getCasosVenta(),
    getSalidasPendientes(),
    getNotificaciones(),
  ]);

  // "Sus autorizaciones enviadas": lo que él mismo mandó, para que vea en
  // qué quedó (autorizado/rechazado/esperando) sin tener que preguntar.
  const misCasosEnviados = casosCompra
    .filter((c) => c.creado_por_id === profileId)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, LIMITE_LISTA);

  const responsabilidadesCompra = casosCompra
    .filter((c) => c.responsable_id === profileId && ABIERTO_COMPRA.includes(c.estado))
    .slice(0, LIMITE_LISTA);

  const responsabilidadesVenta = casosVenta
    .filter((c) => c.responsable_id === profileId && ABIERTO_VENTA.includes(c.estado))
    .slice(0, LIMITE_LISTA);

  const salidasPendientes = salidas
    .filter((s) => s.responsable_id === profileId && s.estado === "pendiente")
    .slice(0, LIMITE_LISTA);

  return {
    misCasosEnviados,
    responsabilidadesCompra,
    responsabilidadesVenta,
    salidasPendientes,
    // Ya vienen acotadas a lo que le toca a este usuario (RLS +
    // usuario_id null = global) — ver Notificacion en lib/types.ts.
    notificaciones: notificaciones.slice(0, LIMITE_LISTA),
  };
}
