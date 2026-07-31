import { redirect } from "next/navigation";

// Novedades se fusionó dentro de Ayuda (pestaña) — redirect por compatibilidad.
export default function NovedadesPage() {
  redirect("/ayuda?tab=novedades");
}
