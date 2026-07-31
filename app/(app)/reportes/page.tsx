import { redirect } from "next/navigation";

// Reportes se fusionó dentro de Análisis (ver components/analisis-view.tsx)
// — esta ruta solo redirige para no romper enlaces/favoritos viejos.
export default function ReportesPage() {
  redirect("/analisis?tab=reportes");
}
