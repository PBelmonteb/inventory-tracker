import { redirect } from "next/navigation";
import { UsuariosView } from "@/components/usuarios-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { listarUsuarios } from "@/lib/actions/usuarios";
import { obtenerConfiguracionAutorizacion } from "@/lib/actions/autorizacion";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const profile = await getCurrentProfile();
  if (!esGestor(profile)) redirect("/inventario");

  const [res, configAutorizacion] = await Promise.all([
    listarUsuarios(),
    obtenerConfiguracionAutorizacion(),
  ]);

  return (
    <UsuariosView
      usuarios={res.ok ? res.usuarios : []}
      errorInicial={res.ok ? null : res.error}
      miId={profile!.id}
      esAdmin={profile!.rol === "admin"}
      umbralInicial={configAutorizacion.monto_umbral_admin}
    />
  );
}
