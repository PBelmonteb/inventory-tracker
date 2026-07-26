import { InicioGestorView, InicioOperarioView } from "@/components/inicio-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { getInicioGestor, getInicioOperario } from "@/lib/inicio";

export const dynamic = "force-dynamic";

export default async function InicioPage() {
  const profile = await getCurrentProfile();
  if (!profile) return null; // app/(app)/layout.tsx ya redirige a /login antes de esto.

  if (esGestor(profile)) {
    const datos = await getInicioGestor();
    return <InicioGestorView nombre={profile.nombre} datos={datos} />;
  }

  const datos = await getInicioOperario(profile.id);
  return <InicioOperarioView nombre={profile.nombre} datos={datos} />;
}
