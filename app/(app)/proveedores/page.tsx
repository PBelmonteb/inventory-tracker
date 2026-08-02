import { ProveedoresView } from "@/components/proveedores-view";
import { getCurrentProfile, puedeGestionarCompras } from "@/lib/auth";
import { listarUsuariosParaAsignar } from "@/lib/actions/usuarios";
import { obtenerConfiguracionAutorizacion } from "@/lib/actions/autorizacion";
import {
  getCasosCompra,
  getConvenios,
  getMateriales,
  getNotificaciones,
  getProveedores,
  getScorecardProveedores,
} from "@/lib/data";

export const dynamic = "force-dynamic";

const TABS = [
  "pendientes",
  "por_autorizar",
  "en_espera",
  "rechazados",
  "casos_del_mes",
  "convenios",
  "scorecard",
] as const;

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
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
    scorecardProveedores,
    usuariosRes,
    configAutorizacion,
    sp,
  ] = await Promise.all([
    getCurrentProfile(),
    getNotificaciones(),
    getCasosCompra({ todos: true }),
    getProveedores(),
    getMateriales(),
    getConvenios(),
    getScorecardProveedores(),
    listarUsuariosParaAsignar(),
    obtenerConfiguracionAutorizacion(),
    searchParams,
  ]);

  const tabInicial = TABS.find((t) => t === sp.tab) ?? "pendientes";

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
      scorecardProveedores={scorecardProveedores}
      emailAutomaticoDisponible={Boolean(process.env.RESEND_API_KEY)}
      usuarios={usuariosRes.ok ? usuariosRes.usuarios : []}
      esGestor={puedeGestionarCompras(profile)}
      esAdmin={profile?.rol === "admin"}
      umbralAdmin={configAutorizacion.monto_umbral_admin}
      tabInicial={tabInicial}
    />
  );
}
