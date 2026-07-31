import { redirect } from "next/navigation";

// Importar se fusionó dentro de Administración — redirect por compatibilidad.
export default function ImportarPage() {
  redirect("/administracion?tab=importar");
}
