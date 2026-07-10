import { MovimientosView } from "@/components/movimientos-view";
import {
  getMateriales,
  getMovimientosRecientes,
  getSalidasPendientes,
  getUbicaciones,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function MovimientosPage() {
  const [movimientos, materiales, salidasPendientes, ubicaciones] =
    await Promise.all([
      getMovimientosRecientes(80),
      getMateriales(),
      getSalidasPendientes(),
      getUbicaciones(),
    ]);

  const opciones = materiales.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    sku: m.sku,
    unidad: m.unidad,
    stock_actual: m.stock_actual,
    ubicacion_id: m.ubicacion_id,
  }));

  const pendientesCount = salidasPendientes.filter(
    (s) => s.estado === "pendiente"
  ).length;

  return (
    <MovimientosView
      movimientos={movimientos}
      materiales={opciones}
      ubicaciones={ubicaciones}
      pendientesCount={pendientesCount}
    />
  );
}
