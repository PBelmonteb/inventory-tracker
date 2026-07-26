import { redirect } from "next/navigation";
import { MRPView } from "@/components/mrp-view";
import { getCurrentProfile } from "@/lib/auth";
import { getCorridaMRP } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function MRPPage() {
  // Expone demanda comprometida y decisiones de compra/producción — mismo
  // criterio que Clasificación/Scorecard/Reportes: se bloquea a operario
  // server-side.
  const profile = await getCurrentProfile();
  if (profile?.rol === "operario") redirect("/inventario");
  const resultado = await getCorridaMRP();
  return (
    <MRPView
      requerimientos={resultado.requerimientos}
      materialesConCicloBOM={resultado.materialesConCicloBOM}
    />
  );
}
