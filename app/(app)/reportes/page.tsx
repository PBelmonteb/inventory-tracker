import { ReportesView } from "@/components/reportes-view";
import { getReportes, DIAS_PARADO } from "@/lib/reportes";
import { getMateriales, getHistorialPreciosTodos } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ReportesPage() {
  const [reportes, materiales, historial] = await Promise.all([
    getReportes(),
    getMateriales(),
    getHistorialPreciosTodos(),
  ]);
  return (
    <ReportesView
      reportes={reportes}
      diasParado={DIAS_PARADO}
      materiales={materiales}
      historial={historial}
    />
  );
}
