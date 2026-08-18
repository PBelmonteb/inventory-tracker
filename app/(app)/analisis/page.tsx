import { redirect } from "next/navigation";
import { AnalisisView } from "@/components/analisis-view";
import { getCurrentProfile, esGestor, esAdmin } from "@/lib/auth";
import { getReportes, DIAS_PARADO } from "@/lib/reportes";
import { getTendenciaKPIs } from "@/lib/reportes-gerenciales";
import { KPI_IDS_POR_DEFECTO } from "@/lib/kpis-dashboard";
import { aiInsightsConfigurado } from "@/lib/actions/ai-insights";
import type { TipoReporte } from "@/lib/reportes-periodo";
import {
  getClasificacionABCXYZ,
  getCorridaMRP,
  getHistorialPreciosTodos,
  getMateriales,
  getVistasGuardadas,
} from "@/lib/data";

export const dynamic = "force-dynamic";

// Reportes/Dashboard/AI Insights son territorio de admin (dueño) — un
// gerente solo ve Clasificación y MRP. Ver análisis de la sesión: qué
// necesita saber un encargado del día a día vs. qué es de dueño.
const TABS_GERENTE = ["clasificacion", "mrp"] as const;
const TABS_ADMIN = ["reportes", "clasificacion", "mrp", "dashboard", "ai-insights"] as const;
const TIPOS_PERIODO = ["semanal", "mensual", "trimestral", "anual"] as const;
// Cuántos periodos consecutivos mostrar en la tendencia por granularidad
// — suficiente para ver un patrón sin saturar la gráfica.
const CANTIDAD_PERIODOS: Record<TipoReporte, number> = {
  semanal: 8,
  mensual: 12,
  trimestral: 8,
  anual: 5,
};

export default async function AnalisisPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; tipo?: string; kpis?: string }>;
}) {
  // Junta Reportes, Clasificación ABC/XYZ, MRP y el Dashboard de KPIs —
  // antes 3 páginas sueltas, las 3 gestor-only (Reportes no tenía el
  // bloqueo server-side que sí tenían sus hermanas — se corrigió al
  // fusionar, no era intencional que fuera la excepción).
  const profile = await getCurrentProfile();
  if (!esGestor(profile)) redirect("/inventario");
  const esAdminUser = esAdmin(profile);

  const sp = await searchParams;
  const tabsPermitidas = esAdminUser ? TABS_ADMIN : TABS_GERENTE;
  const tabInicial = tabsPermitidas.find((t) => t === sp.tab) ?? tabsPermitidas[0];
  const tipoPeriodo =
    TIPOS_PERIODO.find((t) => t === sp.tipo) ?? "mensual";
  const kpisActivos = sp.kpis !== undefined ? sp.kpis.split(",").filter(Boolean) : KPI_IDS_POR_DEFECTO;

  // Clasificación y MRP son de todo gestor; el resto (dinero, tendencia,
  // IA) ni se consulta si quien pide la página no es admin — mismo
  // criterio "a ciegas" que el conteo cíclico: si no toca verlo, no se
  // serializa hacia el navegador, no basta con esconder el tab en el cliente.
  const [clasificacion, mrp] = await Promise.all([
    getClasificacionABCXYZ(),
    getCorridaMRP(),
  ]);
  const mrpAccionesPendientes = mrp.requerimientos.filter((r) => r.accion !== "ninguna").length;

  let datosAdmin:
    | {
        reportes: Awaited<ReturnType<typeof getReportes>>;
        materiales: Awaited<ReturnType<typeof getMateriales>>;
        historial: Awaited<ReturnType<typeof getHistorialPreciosTodos>>;
        tendencia: Awaited<ReturnType<typeof getTendenciaKPIs>>;
        vistas: Awaited<ReturnType<typeof getVistasGuardadas>>;
        aiConfigurado: boolean;
      }
    | null = null;

  if (esAdminUser) {
    const [reportes, materiales, historial, tendencia, vistas, aiConfigurado] =
      await Promise.all([
        getReportes(),
        getMateriales(),
        getHistorialPreciosTodos(),
        getTendenciaKPIs(tipoPeriodo, CANTIDAD_PERIODOS[tipoPeriodo]),
        getVistasGuardadas("analisis"),
        aiInsightsConfigurado(),
      ]);
    datosAdmin = { reportes, materiales, historial, tendencia, vistas, aiConfigurado };
  }

  return (
    <AnalisisView
      esAdmin={esAdminUser}
      reportes={datosAdmin?.reportes}
      diasParado={DIAS_PARADO}
      materiales={datosAdmin?.materiales}
      historial={datosAdmin?.historial}
      clasificacion={clasificacion}
      mrpRequerimientos={mrp.requerimientos}
      mrpMaterialesConCicloBOM={mrp.materialesConCicloBOM}
      tipoPeriodo={tipoPeriodo}
      tendencia={datosAdmin?.tendencia}
      estadoActualKPIs={
        datosAdmin
          ? {
              valorInventario: datosAdmin.reportes.valorTotal,
              valorEnvejecido: datosAdmin.reportes.valorEnvejecido,
              materialesStockBajo: datosAdmin.reportes.comprarAhora.length,
              mrpAccionesPendientes,
            }
          : undefined
      }
      kpisActivos={kpisActivos}
      vistas={datosAdmin?.vistas}
      tabInicial={tabInicial}
      aiInsightsConfigurado={datosAdmin?.aiConfigurado}
    />
  );
}
