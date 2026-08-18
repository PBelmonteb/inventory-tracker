"use client";

import { useState } from "react";
import { Settings, UserCog, ShieldCheck, Tag, Upload, QrCode } from "lucide-react";
import { CatalogosView } from "@/components/catalogos-view";
import { UsuariosView } from "@/components/usuarios-view";
import { AuditoriaView } from "@/components/auditoria-view";
import { PreciosView } from "@/components/precios-view";
import { ImportarView } from "@/components/importar-view";
import { EtiquetasView } from "@/components/etiquetas-view";
import type { UsuarioListado } from "@/lib/actions/usuarios";
import type {
  Auditoria,
  Categoria,
  MaterialConRelaciones,
  Proveedor,
  Ubicacion,
} from "@/lib/types";

type TabId = "catalogos" | "usuarios" | "auditoria" | "precios" | "importar" | "etiquetas";

// soloAdmin: territorio de dueño (quién tiene acceso al sistema, vigilancia
// sobre lo que hace cada quien, precios de venta) — un gerente se queda con
// las tareas operativas de catálogo. Ver análisis de la sesión.
const TODAS_LAS_TABS: {
  id: TabId;
  label: string;
  Icon: typeof Settings;
  soloAdmin?: boolean;
}[] = [
  { id: "catalogos", label: "Catálogos", Icon: Settings },
  { id: "usuarios", label: "Usuarios", Icon: UserCog, soloAdmin: true },
  { id: "auditoria", label: "Auditoría", Icon: ShieldCheck, soloAdmin: true },
  { id: "precios", label: "Precios", Icon: Tag, soloAdmin: true },
  { id: "importar", label: "Importar", Icon: Upload },
  { id: "etiquetas", label: "Etiquetas", Icon: QrCode },
];

// Junta 6 páginas de configuración que antes vivían sueltas en el menú —
// todas son "cosas que se tocan poco, no todos los días", mismo criterio
// de agrupar que Análisis (lo que se usa junto, se ve junto). Cada vista
// se reusa tal cual.
//
// usuarios/errorUsuariosInicial/umbralInicial/registrosAuditoria llegan
// vacíos cuando quien ve esto no es admin -- la página server-side ya ni
// los consulta (mismo criterio que Análisis: no serializar lo que no
// toca ver). materiales sí se manda siempre porque Etiquetas (de
// cualquier gestor) también lo necesita, no solo Precios.
export function AdministracionView({
  categorias,
  ubicaciones,
  proveedores,
  usuarios,
  errorUsuariosInicial,
  miId,
  esAdmin,
  umbralInicial,
  registrosAuditoria,
  materiales,
  tabInicial,
}: {
  categorias: Categoria[];
  ubicaciones: Ubicacion[];
  proveedores: Proveedor[];
  usuarios: UsuarioListado[];
  errorUsuariosInicial: string | null;
  miId: string;
  esAdmin: boolean;
  umbralInicial: number;
  registrosAuditoria: Auditoria[];
  materiales: MaterialConRelaciones[];
  tabInicial?: TabId;
}) {
  const TABS = esAdmin ? TODAS_LAS_TABS : TODAS_LAS_TABS.filter((t) => !t.soloAdmin);
  const primeraTab = TABS[0].id;
  const [tab, setTab] = useState<TabId>(
    tabInicial && TABS.some((t) => t.id === tabInicial) ? tabInicial : primeraTab
  );

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
          Administración
        </h1>
        <p className="mt-1 text-sm text-muted">
          Catálogos, usuarios, precios y configuración — se toca poco, no todos los días.
        </p>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors " +
              (tab === t.id
                ? "bg-accent text-accent-fg"
                : "text-muted hover:bg-surface-2 hover:text-fg")
            }
          >
            <t.Icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "catalogos" && (
        <CatalogosView
          categorias={categorias}
          ubicaciones={ubicaciones}
          proveedores={proveedores}
        />
      )}
      {esAdmin && tab === "usuarios" && (
        <UsuariosView
          usuarios={usuarios}
          errorInicial={errorUsuariosInicial}
          miId={miId}
          esAdmin={esAdmin}
          umbralInicial={umbralInicial}
        />
      )}
      {esAdmin && tab === "auditoria" && <AuditoriaView registros={registrosAuditoria} />}
      {esAdmin && tab === "precios" && <PreciosView materiales={materiales} />}
      {tab === "importar" && <ImportarView />}
      {tab === "etiquetas" && <EtiquetasView materiales={materiales} />}
    </div>
  );
}
