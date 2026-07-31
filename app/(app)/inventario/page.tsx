import { InventarioView } from "@/components/inventario-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import {
  getCategorias,
  getComprometido,
  getConsumoDiario,
  getEnTransito,
  getMateriales,
  getPorLlegar,
  getProveedores,
  getUbicaciones,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const [
    profile,
    materiales,
    categorias,
    ubicaciones,
    proveedores,
    comprometido,
    porLlegar,
    enTransito,
    consumoDiario,
  ] = await Promise.all([
    getCurrentProfile(),
    getMateriales(),
    getCategorias(),
    getUbicaciones(),
    getProveedores(),
    getComprometido(),
    getPorLlegar(),
    getEnTransito(),
    getConsumoDiario(30),
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
      consumoDiario={consumoDiario}
      esGestor={esGestor(profile)}
    />
  );
}
