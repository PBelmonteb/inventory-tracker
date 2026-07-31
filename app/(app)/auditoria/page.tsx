import { redirect } from "next/navigation";

// Auditoría se fusionó dentro de Administración — redirect por compatibilidad.
export default function AuditoriaPage() {
  redirect("/administracion?tab=auditoria");
}
