import { ProveedoresView } from "@/components/proveedores-view";
import { listarUsuariosParaAsignar } from "@/lib/actions/usuarios";
import {
  getCasosCompra,
  getMateriales,
  getNotificaciones,
  getProveedores,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ProveedoresPage() {
  // getNotificaciones dispara la sincronización idempotente de alertas.
  const [notificaciones, casos, proveedores, materiales, usuariosRes] =
    await Promise.all([
      getNotificaciones(),
      getCasosCompra(),
      getProveedores(),
      getMateriales(),
      listarUsuariosParaAsignar(),
    ]);

  const opciones = materiales.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    sku: m.sku,
  }));

  return (
    <ProveedoresView
      notificaciones={notificaciones}
      casos={casos}
      proveedores={proveedores}
      materiales={opciones}
      usuarios={usuariosRes.ok ? usuariosRes.usuarios : []}
    />
  );
}
