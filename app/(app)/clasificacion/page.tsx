import { redirect } from "next/navigation";
import { ClasificacionView } from "@/components/clasificacion-view";
import { getCurrentProfile } from "@/lib/auth";
import { getClasificacionABCXYZ } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ClasificacionPage() {
  // Expone valor anual de consumo por material — mismo criterio que
  // Reportes/Precios: información financiera, no operativa del día a día.
  const profile = await getCurrentProfile();
  if (profile?.rol === "operario") redirect("/inventario");
  const items = await getClasificacionABCXYZ();
  return <ClasificacionView items={items} />;
}
