"use client";

import { useState } from "react";
import { BarChart3, Grid3x3, GitBranch, LayoutDashboard, Sparkles } from "lucide-react";
import { ReportesView } from "@/components/reportes-view";
import { ClasificacionView } from "@/components/clasificacion-view";
import { MRPView } from "@/components/mrp-view";
import { KpiDashboardView } from "@/components/kpi-dashboard-view";
import { AiInsightsView } from "@/components/ai-insights-view";
import type { Reportes } from "@/lib/reportes";
import type { MaterialClasificado, RequerimientoMRPConNombre } from "@/lib/data";
import type { HistorialPrecio, MaterialConRelaciones, VistaGuardada } from "@/lib/types";
import type { PuntoTendencia } from "@/lib/reportes-gerenciales";
import type { TipoReporte } from "@/lib/reportes-periodo";
import type { EstadoActualKPIs } from "@/lib/kpis-dashboard";

type TabId = "reportes" | "clasificacion" | "mrp" | "dashboard" | "ai-insights";

// soloAdmin: territorio de dueño (dinero — márgenes, tendencia de KPIs
// financieros, IA sobre esos datos), no del encargado. Un gerente solo ve
// Clasificación y MRP -- responden "qué compro/produzco", no "cómo va el
// negocio". Ver memoria de la sesión: análisis de qué debería ver cada rol.
const TODAS_LAS_TABS: {
  id: TabId;
  label: string;
  Icon: typeof BarChart3;
  soloAdmin?: boolean;
}[] = [
  { id: "reportes", label: "Reportes", Icon: BarChart3, soloAdmin: true },
  { id: "clasificacion", label: "Clasificación ABC/XYZ", Icon: Grid3x3 },
  { id: "mrp", label: "MRP", Icon: GitBranch },
  { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard, soloAdmin: true },
  { id: "ai-insights", label: "AI Insights", Icon: Sparkles, soloAdmin: true },
];

// Junta 3 páginas que antes vivían sueltas en el menú (Reportes,
// Clasificación, MRP) — todas son "análisis con los datos ya existentes",
// mismo criterio de agrupar que ya se usó en Proveedores (pestañas). Cada
// vista se reusa tal cual, esto solo decide cuál se muestra.
//
// Los props financieros (reportes/historial/tendencia/vistas/
// aiInsightsConfigurado) llegan undefined cuando quien ve esto no es
// admin -- la página server-side ya ni siquiera los consulta (mismo
// criterio "a ciegas" que el conteo cíclico: si no toca verlo, no se
// serializa hacia el navegador). El filtro de tabs de aquí es la segunda
// capa, no la única.
export function AnalisisView({
  esAdmin,
  reportes,
  diasParado,
  materiales,
  historial,
  clasificacion,
  mrpRequerimientos,
  mrpMaterialesConCicloBOM,
  tipoPeriodo,
  tendencia,
  estadoActualKPIs,
  kpisActivos,
  vistas,
  tabInicial,
  aiInsightsConfigurado,
}: {
  esAdmin: boolean;
  reportes?: Reportes;
  diasParado: number;
  materiales?: MaterialConRelaciones[];
  historial?: HistorialPrecio[];
  clasificacion: MaterialClasificado[];
  mrpRequerimientos: RequerimientoMRPConNombre[];
  mrpMaterialesConCicloBOM: string[];
  tipoPeriodo: TipoReporte;
  tendencia?: PuntoTendencia[];
  estadoActualKPIs?: EstadoActualKPIs;
  kpisActivos: string[];
  vistas?: VistaGuardada[];
  tabInicial?: TabId;
  aiInsightsConfigurado?: boolean;
}) {
  const TABS = esAdmin ? TODAS_LAS_TABS : TODAS_LAS_TABS.filter((t) => !t.soloAdmin);
  const primeraTab = TABS[0].id;
  const [tab, setTab] = useState<TabId>(
    tabInicial && TABS.some((t) => t.id === tabInicial) ? tabInicial : primeraTab
  );

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
          Análisis
        </h1>
        <p className="mt-1 text-sm text-muted">
          Reportes, clasificación de materiales y planeación de requerimientos.
        </p>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors " +
              (tab === t.id
                ? "bg-accent text-accent-fg"
                : "text-muted hover:bg-surface-2 hover:text-fg")
            }
          >
            <t.Icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {esAdmin && tab === "reportes" && reportes && materiales && historial && (
        <ReportesView
          reportes={reportes}
          diasParado={diasParado}
          materiales={materiales}
          historial={historial}
        />
      )}
      {tab === "clasificacion" && <ClasificacionView items={clasificacion} />}
      {tab === "mrp" && (
        <MRPView
          requerimientos={mrpRequerimientos}
          materialesConCicloBOM={mrpMaterialesConCicloBOM}
        />
      )}
      {esAdmin && tab === "dashboard" && tendencia && estadoActualKPIs && vistas && (
        <KpiDashboardView
          tipo={tipoPeriodo}
          tendencia={tendencia}
          estadoActual={estadoActualKPIs}
          kpisActivos={kpisActivos}
          vistas={vistas}
        />
      )}
      {esAdmin && tab === "ai-insights" && (
        <AiInsightsView configurado={aiInsightsConfigurado ?? false} />
      )}
    </div>
  );
}
