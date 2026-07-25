import { ProveedoresView } from "@/components/proveedores-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { listarUsuariosParaAsignar } from "@/lib/actions/usuarios";
import { obtenerConfiguracionAutorizacion } from "@/lib/actions/autorizacion";
import {
  getCasosCompra,
  getConvenios,
  getMateriales,
  getNotificaciones,
  getProveedores,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ProveedoresPage() {
  // Siempre trae el historial completo: la pestaña "Casos del mes" lo
  // necesita de todos modos, y las demás pestañas filtran este mismo
  // arreglo en el cliente (ver components/proveedores-view.tsx).
  const [
    profile,
    notificaciones,
    casos,
    proveedores,
    materiales,
    convenios,
    usuariosRes,
    configAutorizacion,
  ] = await Promise.all([
    getCurrentProfile(),
    getNotificaciones(),
    getCasosCompra({ todos: true }),
    getProveedores(),
    getMateriales(),
    getConvenios(),
    listarUsuariosParaAsignar(),
    obtenerConfiguracionAutorizacion(),
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
      materialesCompletos={materiales}
      convenios={convenios}
      usuarios={usuariosRes.ok ? usuariosRes.usuarios : []}
      esGestor={esGestor(profile)}
      esAdmin={profile?.rol === "admin"}
      umbralAdmin={configAutorizacion.monto_umbral_admin}
    />
  );
}
