import { ConteosView } from "@/components/conteos-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { obtenerConteos } from "@/lib/actions/conteos";
import { getCategorias, getUbicaciones } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ConteosPage() {
  const [profile, conteos, categorias, ubicaciones] = await Promise.all([
    getCurrentProfile(),
    obtenerConteos(),
    getCategorias(),
    getUbicaciones(),
  ]);

  return (
    <ConteosView
      conteos={conteos}
      categorias={categorias}
      ubicaciones={ubicaciones}
      esGestor={esGestor(profile)}
    />
  );
}
