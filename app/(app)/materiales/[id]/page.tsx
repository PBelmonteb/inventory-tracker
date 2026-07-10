import { notFound } from "next/navigation";
import { MaterialDetail } from "@/components/material-detail";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import {
  getBom,
  getCategorias,
  getComprometido,
  getHistorialPrecios,
  getMaterial,
  getMateriales,
  getMovimientosDeMaterial,
  getProveedores,
  getStockPorUbicacion,
  getUbicaciones,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function MaterialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const material = await getMaterial(id);
  if (!material) notFound();

  const [
    profile,
    movimientos,
    categorias,
    ubicaciones,
    proveedores,
    historial,
    comprometidoMap,
    stockPorUbicacion,
    bom,
    materiales,
  ] = await Promise.all([
    getCurrentProfile(),
    getMovimientosDeMaterial(id),
    getCategorias(),
    getUbicaciones(),
    getProveedores(),
    getHistorialPrecios(id),
    getComprometido(),
    getStockPorUbicacion(id),
    getBom(id),
    getMateriales(),
  ]);

  return (
    <MaterialDetail
      material={material}
      movimientos={movimientos}
      categorias={categorias}
      ubicaciones={ubicaciones}
      proveedores={proveedores}
      historial={historial}
      comprometido={comprometidoMap[id] ?? 0}
      stockPorUbicacion={stockPorUbicacion}
      bom={bom}
      materialesDisponibles={materiales}
      esGestor={esGestor(profile)}
    />
  );
}
