import { InventarioView } from "@/components/inventario-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import {
  getCategorias,
  getComprometido,
  getMateriales,
  getPorLlegar,
  getProveedores,
  getUbicaciones,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const [profile, materiales, categorias, ubicaciones, proveedores, comprometido, porLlegar] =
    await Promise.all([
      getCurrentProfile(),
      getMateriales(),
      getCategorias(),
      getUbicaciones(),
      getProveedores(),
      getComprometido(),
      getPorLlegar(),
    ]);

  return (
    <InventarioView
      materiales={materiales}
      categorias={categorias}
      ubicaciones={ubicaciones}
      proveedores={proveedores}
      comprometido={comprometido}
      porLlegar={porLlegar}
      esGestor={esGestor(profile)}
    />
  );
}
