"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label, Select } from "@/components/ui";
import { crearMaterial, actualizarMaterial } from "@/lib/actions/materiales";
import { formatMoney } from "@/lib/utils";
import { UNIDADES } from "@/lib/types";
import type {
  Categoria,
  MaterialConRelaciones,
  Proveedor,
  Ubicacion,
} from "@/lib/types";

export function MaterialForm({
  open,
  onClose,
  material,
  categorias,
  ubicaciones,
  proveedores,
}: {
  open: boolean;
  onClose: () => void;
  material?: MaterialConRelaciones | null;
  categorias: Categoria[];
  ubicaciones: Ubicacion[];
  proveedores: Proveedor[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const editando = Boolean(material);

  async function onSubmit(formData: FormData) {
    setError(null);
    setCargando(true);
    const res = editando
      ? await actualizarMaterial(material!.id, formData)
      : await crearMaterial(formData);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editando ? "Editar material" : "Nuevo material"}
    >
      <form action={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="nombre">Nombre *</Label>
          <Input
            id="nombre"
            name="nombre"
            defaultValue={material?.nombre ?? ""}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="sku">SKU / Código</Label>
            <Input id="sku" name="sku" defaultValue={material?.sku ?? ""} />
          </div>
          <div>
            <Label htmlFor="unidad">Unidad</Label>
            <Select
              id="unidad"
              name="unidad"
              defaultValue={material?.unidad ?? "pza"}
            >
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="descripcion">Descripción</Label>
          <Input
            id="descripcion"
            name="descripcion"
            defaultValue={material?.descripcion ?? ""}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="categoria_id">Categoría</Label>
            <Select
              id="categoria_id"
              name="categoria_id"
              defaultValue={material?.categoria_id ?? ""}
            >
              <option value="">— Sin categoría —</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ubicacion_id">Ubicación</Label>
            <Select
              id="ubicacion_id"
              name="ubicacion_id"
              defaultValue={material?.ubicacion_id ?? ""}
            >
              <option value="">— Sin ubicación —</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="proveedor_id">Proveedor</Label>
          <Select
            id="proveedor_id"
            name="proveedor_id"
            defaultValue={material?.proveedor_id ?? ""}
          >
            <option value="">— Sin proveedor —</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="stock_minimo">Stock mínimo</Label>
            <Input
              id="stock_minimo"
              name="stock_minimo"
              type="number"
              step="any"
              min="0"
              defaultValue={material?.stock_minimo ?? 0}
            />
          </div>
          <div>
            <Label htmlFor="precio_venta">Precio de venta</Label>
            <Input
              id="precio_venta"
              name="precio_venta"
              type="number"
              step="any"
              min="0"
              defaultValue={material?.precio_venta ?? 0}
            />
          </div>
        </div>

        {editando ? (
          <div>
            <Label>Costo promedio (WAC)</Label>
            <p className="rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm">
              <span className="font-semibold text-fg">
                {formatMoney(material?.costo_unitario ?? 0)}
              </span>
              <span className="ml-2 text-xs text-faint">
                Se recalcula solo con cada entrada de compra.
              </span>
            </p>
          </div>
        ) : (
          <div>
            <Label htmlFor="costo_unitario">Costo inicial</Label>
            <Input
              id="costo_unitario"
              name="costo_unitario"
              type="number"
              step="any"
              min="0"
              defaultValue={0}
            />
          </div>
        )}

        <div>
          <Label htmlFor="aviso_valor">Stock de aviso (antes del mínimo)</Label>
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="aviso_valor"
              name="aviso_valor"
              type="number"
              step="any"
              min="0"
              defaultValue={material?.aviso_valor ?? 20}
            />
            <Select
              id="aviso_modo"
              name="aviso_modo"
              defaultValue={material?.aviso_modo ?? "porcentaje"}
            >
              <option value="porcentaje">% sobre el mínimo</option>
              <option value="unidad">en unidades</option>
            </Select>
          </div>
          <p className="mt-1 text-xs text-faint">
            Avisa “por agotarse” (amarillo) antes de tocar el mínimo. Ej: 20% con
            mínimo 200 → avisa desde 240.
          </p>
        </div>

        {!editando && (
          <div>
            <Label htmlFor="stock_inicial">Stock inicial (opcional)</Label>
            <Input
              id="stock_inicial"
              name="stock_inicial"
              type="number"
              step="any"
              min="0"
              defaultValue={0}
            />
            <p className="mt-1 text-xs text-faint">
              Se registrará como una entrada en el historial.
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={cargando}>
            {cargando ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
