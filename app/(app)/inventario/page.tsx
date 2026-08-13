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
  getStockPorUbicacionTodos,
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
    stockPorUbicacion,
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
    // Stock real por ubicación (del ledger de movimientos) -- distinto del
    // ubicacion_id "casa" de cada material. Sin esto, filtrar por ubicación
    // aquí usaba el campo estático y podía no mostrar un material con stock
    // real ahí (ver componente: el filtro anterior comparaba m.ubicacion_id).
    getStockPorUbicacionTodos(),
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
      stockPorUbicacion={stockPorUbicacion}
      esGestor={esGestor(profile)}
    />
  );
}
