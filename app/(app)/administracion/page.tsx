import { redirect } from "next/navigation";
import { AdministracionView } from "@/components/administracion-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { listarUsuarios } from "@/lib/actions/usuarios";
import { obtenerConfiguracionAutorizacion } from "@/lib/actions/autorizacion";
import {
  getAuditoria,
  getCategorias,
  getMateriales,
  getProveedores,
  getUbicaciones,
} from "@/lib/data";

export const dynamic = "force-dynamic";

const TABS = [
  "catalogos",
  "usuarios",
  "auditoria",
  "precios",
  "importar",
  "etiquetas",
] as const;

export default async function AdministracionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  // Junta Catálogos, Usuarios, Auditoría, Precios, Importar y Etiquetas —
  // antes 6 páginas sueltas, todas gestor-only (Usuarios/Auditoría además
  // filtran algunas cosas solo para admin, eso lo sigue resolviendo cada
  // vista tal cual ya lo hacía).
  const profile = await getCurrentProfile();
  if (!esGestor(profile)) redirect("/inventario");

  const sp = await searchParams;
  const tabInicial = TABS.find((t) => t === sp.tab) ?? "catalogos";

  const [
    categorias,
    ubicaciones,
    proveedores,
    usuariosRes,
    configAutorizacion,
    registrosAuditoria,
    materiales,
  ] = await Promise.all([
    getCategorias(),
    getUbicaciones(),
    getProveedores(),
    listarUsuarios(),
    obtenerConfiguracionAutorizacion(),
    getAuditoria(),
    getMateriales(),
  ]);

  return (
    <AdministracionView
      categorias={categorias}
      ubicaciones={ubicaciones}
      proveedores={proveedores}
      usuarios={usuariosRes.ok ? usuariosRes.usuarios : []}
      errorUsuariosInicial={usuariosRes.ok ? null : usuariosRes.error}
      miId={profile!.id}
      esAdmin={profile!.rol === "admin"}
      umbralInicial={configAutorizacion.monto_umbral_admin}
      registrosAuditoria={registrosAuditoria}
      materiales={materiales}
      tabInicial={tabInicial}
    />
  );
}
