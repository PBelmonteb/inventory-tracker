import { redirect } from "next/navigation";
import { AdministracionView } from "@/components/administracion-view";
import { getCurrentProfile, esGestor, esAdmin } from "@/lib/auth";
import { listarUsuarios, type UsuarioListado } from "@/lib/actions/usuarios";
import { obtenerConfiguracionAutorizacion } from "@/lib/actions/autorizacion";
import {
  getAuditoria,
  getCategorias,
  getMateriales,
  getProveedores,
  getUbicaciones,
} from "@/lib/data";

export const dynamic = "force-dynamic";

// Usuarios/Auditoría/Precios son territorio de admin (dueño) — un gerente
// se queda con Catálogos/Importar/Etiquetas, las tareas operativas de
// catálogo. Ver análisis de la sesión.
const TABS_GERENTE = ["catalogos", "importar", "etiquetas"] as const;
const TABS_ADMIN = [
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
  // antes 6 páginas sueltas, todas gestor-only (Usuarios/Auditoría/Precios
  // además filtran para admin, eso lo sigue resolviendo cada vista).
  const profile = await getCurrentProfile();
  if (!esGestor(profile)) redirect("/inventario");
  const esAdminUser = esAdmin(profile);

  const sp = await searchParams;
  const tabsPermitidas = esAdminUser ? TABS_ADMIN : TABS_GERENTE;
  const tabInicial = tabsPermitidas.find((t) => t === sp.tab) ?? tabsPermitidas[0];

  // Catálogos/Importar/Etiquetas son de todo gestor; Usuarios/Auditoría/
  // Precios ni se consultan si quien pide la página no es admin — mismo
  // criterio que Análisis: no serializar hacia el navegador lo que no
  // toca ver, no basta con esconder el tab en el cliente.
  const [categorias, ubicaciones, proveedores, materiales] = await Promise.all([
    getCategorias(),
    getUbicaciones(),
    getProveedores(),
    getMateriales(),
  ]);

  let usuarios: UsuarioListado[] = [];
  let errorUsuariosInicial: string | null = null;
  let umbralInicial = 0;
  let registrosAuditoria: Awaited<ReturnType<typeof getAuditoria>> = [];

  if (esAdminUser) {
    const [usuariosRes, configAutorizacion, auditoria] = await Promise.all([
      listarUsuarios(),
      obtenerConfiguracionAutorizacion(),
      getAuditoria(),
    ]);
    usuarios = usuariosRes.ok ? usuariosRes.usuarios : [];
    errorUsuariosInicial = usuariosRes.ok ? null : usuariosRes.error;
    umbralInicial = configAutorizacion.monto_umbral_admin;
    registrosAuditoria = auditoria;
  }

  return (
    <AdministracionView
      categorias={categorias}
      ubicaciones={ubicaciones}
      proveedores={proveedores}
      usuarios={usuarios}
      errorUsuariosInicial={errorUsuariosInicial}
      miId={profile!.id}
      esAdmin={esAdminUser}
      umbralInicial={umbralInicial}
      registrosAuditoria={registrosAuditoria}
      materiales={materiales}
      tabInicial={tabInicial}
    />
  );
}
