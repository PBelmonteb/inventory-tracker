import { redirect } from "next/navigation";
import { ScorecardProveedoresView } from "@/components/scorecard-proveedores-view";
import { getCurrentProfile } from "@/lib/auth";
import { getScorecardProveedores } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ScorecardProveedoresPage() {
  // Expone valor de compras y cumplimiento de precio por proveedor — mismo
  // criterio que Reportes/Precios/Clasificación: información financiera,
  // se bloquea a operario server-side.
  const profile = await getCurrentProfile();
  if (profile?.rol === "operario") redirect("/inventario");
  const proveedores = await getScorecardProveedores();
  return <ScorecardProveedoresView proveedores={proveedores} />;
}
