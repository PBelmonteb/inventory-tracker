import { MovimientosView } from "@/components/movimientos-view";
import { listarUsuariosParaAsignar } from "@/lib/actions/usuarios";
import {
  buscarMovimientos,
  getMateriales,
  getSalidasPendientes,
  getUbicaciones,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    referencia?: string;
    cantidad?: string;
    usuario?: string;
    ubicacion?: string;
    fecha?: string;
  }>;
}) {
  const sp = await searchParams;
  const cantidad = sp.cantidad?.trim() ? Number(sp.cantidad) : undefined;

  const [movimientos, materiales, salidasPendientes, ubicaciones, usuariosRes] =
    await Promise.all([
      buscarMovimientos({
        q: sp.q,
        referencia: sp.referencia,
        cantidad: Number.isFinite(cantidad) ? cantidad : undefined,
        usuarioId: sp.usuario,
        ubicacionId: sp.ubicacion,
        fecha: sp.fecha,
      }),
      getMateriales(),
      getSalidasPendientes(),
      getUbicaciones(),
      listarUsuariosParaAsignar(),
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
      usuarios={usuariosRes.ok ? usuariosRes.usuarios : []}
      pendientesCount={pendientesCount}
    />
  );
}
