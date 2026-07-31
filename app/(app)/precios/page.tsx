import { redirect } from "next/navigation";

// Precios se fusionó dentro de Administración — redirect por compatibilidad.
export default function PreciosPage() {
  redirect("/administracion?tab=precios");
}
