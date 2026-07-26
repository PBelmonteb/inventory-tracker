import { InventarioView } from "@/components/inventario-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import {
  getCategorias,
  getComprometido,
  getEnTransito,
  getMateriales,
  getPorLlegar,
  getProveedores,
  getUbicaciones,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const [profile, materiales, categorias, ubicaciones, proveedores, comprometido, porLlegar, enTransito] =
    await Promise.all([
      getCurrentProfile(),
      getMateriales(),
      getCategorias(),
      getUbicaciones(),
      getProveedores(),
      getComprometido(),
      getPorLlegar(),
      getEnTransito(),
    ]);

  return (
    <InventarioView
      materiales={materiales}
      categorias={categorias}
      ubicaciones={ubicaciones}
      proveedores={proveedores}
      comprometido={comprometido}
      porLlegar={porLlegar}
      enTransito={enTransito}
      esGestor={esGestor(profile)}
    />
  );
}
