import { redirect } from "next/navigation";
import { AprobacionesView } from "@/components/aprobaciones-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { getBandejaAprobaciones } from "@/lib/aprobaciones";
import { getConfiguracionAutorizacion } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AprobacionesPage() {
  const profile = await getCurrentProfile();
  // Toda la página es sobre decidir cosas (autorizar/rechazar, aplicar
  // conteos, elegir ganadora) — sin excepción para "solo lectura" como en
  // Clasificación/Scorecard/MRP, un operario no tiene nada que hacer aquí.
  if (!profile || !esGestor(profile)) redirect("/inicio");

  const [bandeja, config] = await Promise.all([
    getBandejaAprobaciones(),
    getConfiguracionAutorizacion(),
  ]);

  return (
    <AprobacionesView
      bandeja={bandeja}
      esAdmin={profile.rol === "admin"}
      umbralAdmin={config.monto_umbral_admin}
    />
  );
}
