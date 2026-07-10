"use client";

import { useMemo, useState } from "react";
import { Card, Select } from "@/components/ui";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import { formatDate, normalizarTexto } from "@/lib/utils";
import type {
  AccionAuditoria,
  Auditoria,
  EntidadAuditoria,
} from "@/lib/types";
import { Plus, Pencil, Trash2, Search, ShieldCheck } from "lucide-react";

const ACCION_META: Record<
  AccionAuditoria,
  { label: string; Icon: typeof Plus; clase: string }
> = {
  crear: {
    label: "Creó",
    Icon: Plus,
    clase: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  editar: {
    label: "Editó",
    Icon: Pencil,
    clase: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  eliminar: {
    label: "Dio de baja",
    Icon: Trash2,
    clase: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
};

const ENTIDAD_LABEL: Record<EntidadAuditoria, string> = {
  material: "material",
  categoria: "categoría",
  ubicacion: "ubicación",
  proveedor: "proveedor",
  cliente: "cliente",
};

export function AuditoriaView({ registros }: { registros: Auditoria[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [fAccion, setFAccion] = useState("");
  const [fEntidad, setFEntidad] = useState("");

  const filtrados = useMemo(() => {
    const q = normalizarTexto(busqueda);
    return registros.filter((r) => {
      if (fAccion && r.accion !== fAccion) return false;
      if (fEntidad && r.entidad !== fEntidad) return false;
      if (q) {
        const texto = normalizarTexto(
          `${r.entidad_nombre ?? ""} ${r.usuario_nombre ?? ""}`
        );
        if (!texto.includes(q)) return false;
      }
      return true;
    });
  }, [registros, busqueda, fAccion, fEntidad]);

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-accent" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
              Bitácora de auditoría
            </h1>
            <p className="mt-1 text-sm text-muted">
              Quién creó, editó o dio de baja materiales y catálogos.
            </p>
          </div>
        </div>
        <BotonExportarCSV
          filename="auditoria"
          filas={filtrados.map((r) => ({
            Fecha: r.created_at,
            Usuario: r.usuario_nombre ?? "",
            Acción: r.accion,
            Entidad: r.entidad,
            Nombre: r.entidad_nombre ?? "",
          }))}
          label="CSV"
        />
      </div>

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-faint" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o usuario..."
            className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-faint"
          />
        </div>
        <Select
          value={fAccion}
          onChange={(e) => setFAccion(e.target.value)}
          className="w-auto text-sm"
          aria-label="Filtrar por acción"
        >
          <option value="">Todas las acciones</option>
          <option value="crear">Creó</option>
          <option value="editar">Editó</option>
          <option value="eliminar">Dio de baja</option>
        </Select>
        <Select
          value={fEntidad}
          onChange={(e) => setFEntidad(e.target.value)}
          className="w-auto text-sm"
          aria-label="Filtrar por tipo"
        >
          <option value="">Todo</option>
          <option value="material">Materiales</option>
          <option value="categoria">Categorías</option>
          <option value="ubicacion">Ubicaciones</option>
          <option value="proveedor">Proveedores</option>
          <option value="cliente">Clientes</option>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        {filtrados.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">
            Sin registros con esos filtros.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {filtrados.map((r) => {
              const meta = ACCION_META[r.accion];
              const Icon = meta.Icon;
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.clase}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">
                      <span className="font-medium">
                        {r.usuario_nombre ?? "Sistema"}
                      </span>{" "}
                      <span className="text-muted">{meta.label.toLowerCase()}</span>{" "}
                      el {ENTIDAD_LABEL[r.entidad]}{" "}
                      <span className="font-medium">
                        {r.entidad_nombre ?? "—"}
                      </span>
                    </p>
                    <p className="text-xs text-faint">{formatDate(r.created_at)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
