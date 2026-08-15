import { redirect } from "next/navigation";
import { AnalisisView } from "@/components/analisis-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
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

const TABS = ["reportes", "clasificacion", "mrp", "dashboard", "ai-insights"] as const;
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

  const sp = await searchParams;
  const tabInicial = TABS.find((t) => t === sp.tab) ?? "reportes";
  const tipoPeriodo =
    TIPOS_PERIODO.find((t) => t === sp.tipo) ?? "mensual";
  const kpisActivos = sp.kpis !== undefined ? sp.kpis.split(",").filter(Boolean) : KPI_IDS_POR_DEFECTO;

  const [reportes, materiales, historial, clasificacion, mrp, tendencia, vistas] =
    await Promise.all([
      getReportes(),
      getMateriales(),
      getHistorialPreciosTodos(),
      getClasificacionABCXYZ(),
      getCorridaMRP(),
      getTendenciaKPIs(tipoPeriodo, CANTIDAD_PERIODOS[tipoPeriodo]),
      getVistasGuardadas("analisis"),
    ]);

  const mrpAccionesPendientes = mrp.requerimientos.filter((r) => r.accion !== "ninguna").length;

  return (
    <AnalisisView
      reportes={reportes}
      diasParado={DIAS_PARADO}
      materiales={materiales}
      historial={historial}
      clasificacion={clasificacion}
      mrpRequerimientos={mrp.requerimientos}
      mrpMaterialesConCicloBOM={mrp.materialesConCicloBOM}
      tipoPeriodo={tipoPeriodo}
      tendencia={tendencia}
      estadoActualKPIs={{
        valorInventario: reportes.valorTotal,
        valorEnvejecido: reportes.valorEnvejecido,
        materialesStockBajo: reportes.comprarAhora.length,
        mrpAccionesPendientes,
      }}
      kpisActivos={kpisActivos}
      vistas={vistas}
      tabInicial={tabInicial}
      aiInsightsConfigurado={await aiInsightsConfigurado()}
    />
  );
}
