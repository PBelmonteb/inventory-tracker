"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label, Select } from "@/components/ui";
import { ResponsableSelect } from "@/components/responsable-select";
import { NOTIF_REFRESH_EVENT } from "@/components/notificaciones-provider";
import { crearCasoCompra } from "@/lib/actions/compras";
import type { UsuarioAsignable } from "@/lib/actions/usuarios";
import type { Proveedor } from "@/lib/types";

type MaterialOpcion = { id: string; nombre: string; sku: string | null };

export type PrefillCasoCompra = {
  notificacion_id: string;
  proveedor_id: string;
  material_id: string;
  titulo: string;
};

export function CasoCompraForm({
  open,
  onClose,
  proveedores,
  materiales,
  usuarios,
  prefill,
}: {
  open: boolean;
  onClose: () => void;
  proveedores: Proveedor[];
  materiales: MaterialOpcion[];
  usuarios: UsuarioAsignable[];
  prefill?: PrefillCasoCompra | null;
}) {
  const router = useRouter();
  const [proveedorId, setProveedorId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // Sincroniza los selects con el prefill cada vez que se abre.
  useEffect(() => {
    if (open) {
      setProveedorId(prefill?.proveedor_id ?? "");
      setMaterialId(prefill?.material_id ?? "");
      setResponsableId("");
      setError(null);
    }
  }, [open, prefill]);

  async function onSubmit(formData: FormData) {
    setError(null);
    setCargando(true);
    formData.set("proveedor_id", proveedorId);
    formData.set("material_id", materialId);
    formData.set("responsable_id", responsableId);
    if (prefill) formData.set("notificacion_id", prefill.notificacion_id);
    const res = await crearCasoCompra(formData);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (responsableId) window.dispatchEvent(new Event(NOTIF_REFRESH_EVENT));
    router.refresh();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo caso de compra">
      <form action={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="cc-proveedor">Proveedor</Label>
          <Select
            id="cc-proveedor"
            value={proveedorId}
            onChange={(e) => setProveedorId(e.target.value)}
            required
          >
            <option value="">— Selecciona —</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="cc-material">Material (opcional)</Label>
          <Select
            id="cc-material"
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
          >
            <option value="">— Ninguno —</option>
            {materiales.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
                {m.sku ? ` (${m.sku})` : ""}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="cc-responsable">Responsable (opcional)</Label>
          <ResponsableSelect
            usuarios={usuarios}
            value={responsableId}
            onChange={setResponsableId}
            ariaLabel="Responsable del caso"
          />
        </div>

        <div>
          <Label htmlFor="cc-titulo">Título</Label>
          <Input
            id="cc-titulo"
            name="titulo"
            defaultValue={prefill?.titulo ?? ""}
            placeholder="Reabasto de perfil estructural"
            required
          />
        </div>

        <div>
          <Label htmlFor="cc-descripcion">Descripción / nota</Label>
          <Input
            id="cc-descripcion"
            name="descripcion"
            placeholder="Opcional"
          />
        </div>

        <div>
          <Label htmlFor="cc-monto">Monto estimado (MXN)</Label>
          <Input
            id="cc-monto"
            name="monto_estimado"
            type="number"
            step="any"
            min="0"
            placeholder="0.00"
          />
        </div>

        <div>
          <Label htmlFor="cc-referencia">Referencia</Label>
          <Input
            id="cc-referencia"
            name="referencia"
            placeholder="OC-1009 (auto si se deja vacío)"
          />
        </div>

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
            {cargando ? "Guardando..." : "Crear caso"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
