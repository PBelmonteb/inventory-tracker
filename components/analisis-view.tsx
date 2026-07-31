"use client";

import { useState } from "react";
import { BarChart3, Grid3x3, GitBranch } from "lucide-react";
import { ReportesView } from "@/components/reportes-view";
import { ClasificacionView } from "@/components/clasificacion-view";
import { MRPView } from "@/components/mrp-view";
import type { Reportes } from "@/lib/reportes";
import type { MaterialClasificado, RequerimientoMRPConNombre } from "@/lib/data";
import type { HistorialPrecio, MaterialConRelaciones } from "@/lib/types";

type TabId = "reportes" | "clasificacion" | "mrp";

const TABS: { id: TabId; label: string; Icon: typeof BarChart3 }[] = [
  { id: "reportes", label: "Reportes", Icon: BarChart3 },
  { id: "clasificacion", label: "Clasificación ABC/XYZ", Icon: Grid3x3 },
  { id: "mrp", label: "MRP", Icon: GitBranch },
];

// Junta 3 páginas que antes vivían sueltas en el menú (Reportes,
// Clasificación, MRP) — todas son "análisis con los datos ya existentes",
// mismo criterio de agrupar que ya se usó en Proveedores (pestañas). Cada
// vista se reusa tal cual, esto solo decide cuál se muestra.
export function AnalisisView({
  reportes,
  diasParado,
  materiales,
  historial,
  clasificacion,
  mrpRequerimientos,
  mrpMaterialesConCicloBOM,
  tabInicial,
}: {
  reportes: Reportes;
  diasParado: number;
  materiales: MaterialConRelaciones[];
  historial: HistorialPrecio[];
  clasificacion: MaterialClasificado[];
  mrpRequerimientos: RequerimientoMRPConNombre[];
  mrpMaterialesConCicloBOM: string[];
  tabInicial?: TabId;
}) {
  const [tab, setTab] = useState<TabId>(tabInicial ?? "reportes");

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

      {tab === "reportes" && (
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
    </div>
  );
}
