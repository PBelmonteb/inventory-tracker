import { redirect } from "next/navigation";

// Clasificación se fusionó dentro de Análisis — redirect por compatibilidad.
export default function ClasificacionPage() {
  redirect("/analisis?tab=clasificacion");
}
