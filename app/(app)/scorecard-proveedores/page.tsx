import { redirect } from "next/navigation";

// Scorecard se fusionó dentro de Proveedores (pestaña) — redirect por compatibilidad.
export default function ScorecardProveedoresPage() {
  redirect("/proveedores?tab=scorecard");
}
