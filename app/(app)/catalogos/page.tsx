import { redirect } from "next/navigation";
import { CatalogosView } from "@/components/catalogos-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { getCategorias, getProveedores, getUbicaciones } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function CatalogosPage() {
  const profile = await getCurrentProfile();
  if (!esGestor(profile)) redirect("/inventario");

  const [categorias, ubicaciones, proveedores] = await Promise.all([
    getCategorias(),
    getUbicaciones(),
    getProveedores(),
  ]);

  return (
    <CatalogosView
      categorias={categorias}
      ubicaciones={ubicaciones}
      proveedores={proveedores}
    />
  );
}
