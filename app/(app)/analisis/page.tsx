import { redirect } from "next/navigation";
import { AnalisisView } from "@/components/analisis-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { getReportes, DIAS_PARADO } from "@/lib/reportes";
import {
  getClasificacionABCXYZ,
  getCorridaMRP,
  getHistorialPreciosTodos,
  getMateriales,
} from "@/lib/data";

export const dynamic = "force-dynamic";

const TABS = ["reportes", "clasificacion", "mrp"] as const;

export default async function AnalisisPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Junta Reportes, Clasificación ABC/XYZ y MRP — antes 3 páginas sueltas,
  // las 3 gestor-only (Reportes no tenía el bloqueo server-side que sí
  // tenían sus hermanas — se corrige aquí de paso, no era intencional que
  // fuera la excepción).
  const profile = await getCurrentProfile();
  if (!esGestor(profile)) redirect("/inventario");

  const sp = await searchParams;
  const tabInicial = TABS.find((t) => t === sp.tab) ?? "reportes";

  const [reportes, materiales, historial, clasificacion, mrp] = await Promise.all([
    getReportes(),
    getMateriales(),
    getHistorialPreciosTodos(),
    getClasificacionABCXYZ(),
    getCorridaMRP(),
  ]);

  return (
    <AnalisisView
      reportes={reportes}
      diasParado={DIAS_PARADO}
      materiales={materiales}
      historial={historial}
      clasificacion={clasificacion}
      mrpRequerimientos={mrp.requerimientos}
      mrpMaterialesConCicloBOM={mrp.materialesConCicloBOM}
      tabInicial={tabInicial}
    />
  );
}
