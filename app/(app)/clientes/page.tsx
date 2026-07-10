import { ClientesView } from "@/components/clientes-view";
import { listarUsuariosParaAsignar } from "@/lib/actions/usuarios";
import {
  getCasosVenta,
  getClientes,
  getMateriales,
  getSalidasPendientes,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const [clientes, casos, salidasPendientes, materiales, usuariosRes] =
    await Promise.all([
      getClientes(),
      getCasosVenta(),
      getSalidasPendientes(),
      getMateriales(),
      listarUsuariosParaAsignar(),
    ]);

  const opciones = materiales.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    sku: m.sku,
    unidad: m.unidad,
    stock_actual: m.stock_actual,
  }));

  return (
    <ClientesView
      clientes={clientes}
      casos={casos}
      salidasPendientes={salidasPendientes}
      materiales={opciones}
      usuarios={usuariosRes.ok ? usuariosRes.usuarios : []}
    />
  );
}
