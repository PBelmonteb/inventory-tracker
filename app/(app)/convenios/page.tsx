import { redirect } from "next/navigation";

// Convenios se fusionó dentro de Proveedores (pestaña) — redirect por compatibilidad.
export default function ConveniosPage() {
  redirect("/proveedores?tab=convenios");
}
