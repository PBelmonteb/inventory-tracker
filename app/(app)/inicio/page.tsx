import { InicioGestorView, InicioOperarioView, InicioComprasView } from "@/components/inicio-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { getInicioGestor, getInicioOperario, getInicioCompras } from "@/lib/inicio";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null; // app/(app)/layout.tsx ya redirige a /login antes de esto.

  if (esGestor(profile)) {
    const datos = await getInicioGestor();
    return <InicioGestorView nombre={profile.nombre} datos={datos} />;
  }

  if (profile.rol === "compras") {
    const datos = await getInicioCompras();
    return <InicioComprasView nombre={profile.nombre} datos={datos} />;
  }

  const datos = await getInicioOperario(profile.id);
  return <InicioOperarioView nombre={profile.nombre} datos={datos} />;
}
