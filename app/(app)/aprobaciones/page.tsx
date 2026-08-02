import { redirect } from "next/navigation";
import { AprobacionesView } from "@/components/aprobaciones-view";
import { getCurrentProfile, esGestor, puedeGestionarCompras } from "@/lib/auth";
import { getBandejaAprobaciones } from "@/lib/aprobaciones";
import { getConfiguracionAutorizacion } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AprobacionesPage() {
  const profile = await getCurrentProfile();
  // Toda la página es sobre decidir cosas (autorizar/rechazar, aplicar
  // conteos, elegir ganadora) — sin excepción para "solo lectura" como en
  // Clasificación/Scorecard/MRP, un operario no tiene nada que hacer aquí.
  // Compras también entra, pero solo ve lo suyo (ver filtrado abajo).
  if (!profile || !puedeGestionarCompras(profile)) redirect("/inicio");

  const [bandeja, config] = await Promise.all([
    getBandejaAprobaciones(),
    getConfiguracionAutorizacion(),
  ]);

  const esGestorReal = esGestor(profile);
  // Compras no hace conteos cíclicos ni inspecciones de calidad — se le
  // recorta la bandeja a lo suyo (casos por autorizar, solicitudes por
  // resolver). Las secciones vacías se muestran igual, con su estado
  // "sin pendientes" (ver Seccion en aprobaciones-view.tsx).
  const bandejaVisible = esGestorReal
    ? bandeja
    : { ...bandeja, conteosPorRevisar: [], inspeccionesPendientes: [] };

  return (
    <AprobacionesView
      bandeja={bandejaVisible}
      esGestor={esGestorReal}
      puedeGestionarCompras
      esAdmin={profile.rol === "admin"}
      umbralAdmin={config.monto_umbral_admin}
    />
  );
}
