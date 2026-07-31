import { redirect } from "next/navigation";

// Catálogos se fusionó dentro de Administración — redirect por compatibilidad.
export default function CatalogosPage() {
  redirect("/administracion?tab=catalogos");
}
