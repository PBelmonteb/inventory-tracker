import { redirect } from "next/navigation";

// MRP se fusionó dentro de Análisis — redirect por compatibilidad.
export default function MRPPage() {
  redirect("/analisis?tab=mrp");
}
