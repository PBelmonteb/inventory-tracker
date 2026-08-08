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
  SolicitudCompraConRelaciones,
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
  // Cotizaciones de venta que él mismo mandó a autorizar (ver migración
  // 0043_autorizacion_casos_venta.sql) — mismo espíritu que
  // misCasosEnviados del lado de compras.
  misCasosVentaEnviados: CasoVentaConRelaciones[];
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

  const misCasosVentaEnviados = casosVenta
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
    misCasosVentaEnviados,
    responsabilidadesCompra,
    responsabilidadesVenta,
    salidasPendientes,
    // Ya vienen acotadas a lo que le toca a este usuario (RLS +
    // usuario_id null = global) — ver Notificacion en lib/types.ts.
    notificaciones: notificaciones.slice(0, LIMITE_LISTA),
  };
}

// Igual que InicioGestor pero recortado a lo de compras: nada de
// valorInventario/conteos (eso no es su trabajo) — solo lo que puede
// decidir (autorizar/rechazar caso, elegir cotización ganadora).
export interface InicioCompras {
  kpis: {
    casosPorAutorizar: number;
    solicitudesPorResolver: number;
  };
  porAutorizar: CasoPorAutorizar[];
  solicitudesPorResolver: SolicitudCompraConRelaciones[];
  notificaciones: NotificacionConRelaciones[];
}

export async function getInicioCompras(): Promise<InicioCompras> {
  const [bandeja, notificaciones] = await Promise.all([
    getBandejaAprobaciones(),
    getNotificaciones(),
  ]);

  return {
    kpis: {
      casosPorAutorizar: bandeja.porAutorizar.length,
      solicitudesPorResolver: bandeja.solicitudesPorResolver.length,
    },
    porAutorizar: bandeja.porAutorizar.slice(0, LIMITE_LISTA),
    solicitudesPorResolver: bandeja.solicitudesPorResolver.slice(0, LIMITE_LISTA),
    notificaciones: notificaciones.slice(0, LIMITE_LISTA),
  };
}

// Igual espíritu que InicioCompras pero del lado de ventas: casos de venta
// activos y salidas pendientes por confirmar — nada de compras/inventario.
// A diferencia de compras, no hay umbral por monto (ver migración
// 0043_autorizacion_casos_venta.sql) — cualquier caso "por_autorizar" lo
// puede autorizar cualquier gestor/ventas, sin distinción admin/gerente.
export interface InicioVentas {
  kpis: {
    casosActivos: number;
    salidasPorConfirmar: number;
    casosPorAutorizar: number;
  };
  casosActivos: CasoVentaConRelaciones[];
  salidasPendientes: SalidaPendienteConRelaciones[];
  porAutorizar: CasoVentaConRelaciones[];
  notificaciones: NotificacionConRelaciones[];
}

export async function getInicioVentas(): Promise<InicioVentas> {
  const [casosVenta, salidas, notificaciones] = await Promise.all([
    getCasosVenta(),
    getSalidasPendientes(),
    getNotificaciones(),
  ]);

  const casosActivos = casosVenta.filter((c) => ABIERTO_VENTA.includes(c.estado));
  const salidasPendientes = salidas.filter((s) => s.estado === "pendiente");
  const porAutorizar = casosVenta.filter((c) => c.estado === "por_autorizar");

  return {
    kpis: {
      casosActivos: casosActivos.length,
      salidasPorConfirmar: salidasPendientes.length,
      casosPorAutorizar: porAutorizar.length,
    },
    casosActivos: casosActivos.slice(0, LIMITE_LISTA),
    salidasPendientes: salidasPendientes.slice(0, LIMITE_LISTA),
    porAutorizar: porAutorizar.slice(0, LIMITE_LISTA),
    notificaciones: notificaciones.slice(0, LIMITE_LISTA),
  };
}
