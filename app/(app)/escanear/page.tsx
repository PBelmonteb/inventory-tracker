import { EscanearView } from "@/components/escanear-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { getMateriales } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function EscanearPage() {
  const [profile, materiales] = await Promise.all([
    getCurrentProfile(),
    getMateriales(),
  ]);

  return <EscanearView materiales={materiales} esGestor={esGestor(profile)} />;
}
