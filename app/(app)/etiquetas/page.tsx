import { redirect } from "next/navigation";

// Etiquetas se fusionó dentro de Administración — redirect por compatibilidad.
export default function EtiquetasPage() {
  redirect("/administracion?tab=etiquetas");
}
