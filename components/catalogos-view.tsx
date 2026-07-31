"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/components/ui";
import {
  actualizarProveedor,
  crearCatalogo,
  eliminarCatalogo,
} from "@/lib/actions/catalogos";
import type { Categoria, Proveedor, Ubicacion } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

type Tabla = "categorias" | "ubicaciones" | "proveedores";

export function CatalogosView({
  categorias,
  ubicaciones,
  proveedores,
}: {
  categorias: Categoria[];
  ubicaciones: Ubicacion[];
  proveedores: Proveedor[];
}) {
  return (
    <div className="mx-auto max-w-7xl">
      {/* Sin h1 propio: vive como tab dentro de Administración. */}
      <div className="grid gap-4 md:grid-cols-3">
        <CatalogoCard
          titulo="Categorías"
          tabla="categorias"
          items={categorias}
        />
        <CatalogoCard
          titulo="Ubicaciones"
          tabla="ubicaciones"
          items={ubicaciones}
        />
        <CatalogoCard
          titulo="Proveedores"
          tabla="proveedores"
          items={proveedores}
          conContacto
          conDiasEntrega
        />
      </div>
    </div>
  );
}

function CatalogoCard({
  titulo,
  tabla,
  items,
  conContacto,
  conDiasEntrega,
}: {
  titulo: string;
  tabla: Tabla;
  items: {
    id: string;
    nombre: string;
    contacto?: string | null;
    dias_entrega_declarado?: number | null;
  }[];
  conContacto?: boolean;
  conDiasEntrega?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function agregar(formData: FormData) {
    setError(null);
    setCargando(true);
    const res = await crearCatalogo(tabla, formData);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    (document.getElementById(`form-${tabla}`) as HTMLFormElement)?.reset();
    router.refresh();
  }

  async function borrar(id: string) {
    if (!confirm("¿Eliminar este elemento?")) return;
    const res = await eliminarCatalogo(tabla, id);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  async function guardarDiasEntrega(
    id: string,
    contactoActual: string | null | undefined,
    valor: string
  ) {
    const formData = new FormData();
    formData.set("contacto", contactoActual ?? "");
    formData.set("dias_entrega_declarado", valor);
    const res = await actualizarProveedor(id, formData);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card className="flex flex-col p-4">
      <h2 className="mb-3 font-semibold text-fg">{titulo}</h2>

      <form id={`form-${tabla}`} action={agregar} className="mb-3 space-y-2">
        <Input name="nombre" placeholder={`Nuevo en ${titulo.toLowerCase()}`} required />
        {conContacto && (
          <Input name="contacto" placeholder="Contacto (opcional)" />
        )}
        {conDiasEntrega && (
          <Input
            name="dias_entrega_declarado"
            type="number"
            min="1"
            step="0.5"
            placeholder="Días de entrega (opcional)"
          />
        )}
        <Button type="submit" className="w-full" disabled={cargando}>
          <Plus className="h-4 w-4" /> Agregar
        </Button>
        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </form>

      <ul className="divide-y divide-line">
        {items.length === 0 && (
          <li className="py-2 text-sm text-faint">Sin elementos</li>
        )}
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg">{it.nombre}</p>
              {it.contacto && (
                <p className="truncate text-xs text-faint">{it.contacto}</p>
              )}
              {conDiasEntrega && (
                <label className="mt-1 flex items-center gap-1.5 text-xs text-faint">
                  Entrega:
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    defaultValue={it.dias_entrega_declarado ?? ""}
                    placeholder="—"
                    onBlur={(e) =>
                      guardarDiasEntrega(it.id, it.contacto, e.target.value)
                    }
                    className="w-16 rounded border border-line bg-transparent px-1.5 py-0.5 text-xs text-fg"
                  />
                  días
                </label>
              )}
            </div>
            <button
              onClick={() => borrar(it.id)}
              aria-label="Eliminar"
              className="cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
