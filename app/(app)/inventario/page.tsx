import { InventarioView } from "@/components/inventario-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import {
  getCategorias,
  getComprometido,
  getMateriales,
  getProveedores,
  getUbicaciones,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const [profile, materiales, categorias, ubicaciones, proveedores, comprometido] =
    await Promise.all([
      getCurrentProfile(),
      getMateriales(),
      getCategorias(),
      getUbicaciones(),
      getProveedores(),
      getComprometido(),
    ]);

  return (
    <InventarioView
      materiales={materiales}
      categorias={categorias}
      ubicaciones={ubicaciones}
      proveedores={proveedores}
      comprometido={comprometido}
      esGestor={esGestor(profile)}
    />
  );
}
