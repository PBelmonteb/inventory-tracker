import { redirect } from "next/navigation";

// Usuarios se fusionó dentro de Administración — redirect por compatibilidad.
export default function UsuariosPage() {
  redirect("/administracion?tab=usuarios");
}
