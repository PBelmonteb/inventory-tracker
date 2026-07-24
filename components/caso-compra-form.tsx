"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label } from "@/components/ui";
import { ResponsableSelect } from "@/components/responsable-select";
import { ProveedorMultiSelect } from "@/components/proveedor-multi-select";
import { NOTIF_REFRESH_EVENT } from "@/components/notificaciones-provider";
import { crearSolicitudCompra } from "@/lib/actions/solicitudes";
import { obtenerConvenioVigente } from "@/lib/actions/convenios";
import type { UsuarioAsignable } from "@/lib/actions/usuarios";
import type { Convenio, Proveedor } from "@/lib/types";

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
  const [proveedorIds, setProveedorIds] = useState<string[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [convenio, setConvenio] = useState<Convenio | null>(null);
  const montoRef = useRef<HTMLInputElement>(null);

  // Sincroniza los campos con el prefill cada vez que se abre.
  useEffect(() => {
    if (open) {
      setProveedorIds(prefill ? [prefill.proveedor_id] : []);
      setMaterialId(prefill?.material_id ?? "");
      setResponsableId("");
      setError(null);
    }
  }, [open, prefill]);

  // El precio pactado / botón "Usar convenio" solo tiene sentido con
  // exactamente un proveedor elegido — con varios, cada cotización toma
  // su propio convenio sola al crearse (lib/actions/solicitudes.ts).
  const unProveedorId = proveedorIds.length === 1 ? proveedorIds[0] : null;

  useEffect(() => {
    if (!open || !unProveedorId || !materialId) {
      setConvenio(null);
      return;
    }
    let cancelado = false;
    obtenerConvenioVigente(materialId, unProveedorId).then((c) => {
      if (!cancelado) setConvenio(c);
    });
    return () => {
      cancelado = true;
    };
  }, [open, unProveedorId, materialId]);

  function usarConvenio() {
    if (!convenio || !montoRef.current) return;
    const monto = convenio.precio_pactado * (convenio.cantidad_minima ?? 1);
    montoRef.current.value = monto.toFixed(2);
  }

  async function onSubmit(formData: FormData) {
    setError(null);
    if (proveedorIds.length === 0) {
      setError("Selecciona al menos un proveedor");
      return;
    }
    setCargando(true);
    for (const id of proveedorIds) formData.append("proveedor_ids", id);
    formData.set("material_id", materialId);
    formData.set("responsable_id", responsableId);
    if (prefill) formData.set("notificacion_id", prefill.notificacion_id);
    const res = await crearSolicitudCompra(formData);
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
          <Label htmlFor="cc-proveedor">Proveedor(es)</Label>
          <ProveedorMultiSelect
            proveedores={proveedores}
            value={proveedorIds}
            onChange={setProveedorIds}
          />
          {proveedorIds.length > 1 && (
            <p className="mt-1.5 text-xs text-muted">
              Se creará una solicitud con una cotización por cada proveedor
              elegido — para poder comparar y elegir la mejor después.
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="cc-material">Material (opcional)</Label>
          <select
            id="cc-material"
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            className="w-full cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            <option value="">— Ninguno —</option>
            {materiales.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
                {m.sku ? ` (${m.sku})` : ""}
              </option>
            ))}
          </select>
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
          <Label htmlFor="cc-cantidad">Cantidad estimada (opcional)</Label>
          <Input
            id="cc-cantidad"
            name="cantidad_estimada"
            type="number"
            step="any"
            min="0"
            placeholder="Ej. 150"
          />
          <p className="mt-1 text-xs text-faint">
            Se usa para calcular el stock "por llegar" en Inventario mientras
            el caso siga en curso.
          </p>
        </div>

        {unProveedorId && (
          <div>
            <Label htmlFor="cc-monto">Monto estimado (MXN)</Label>
            <Input
              ref={montoRef}
              id="cc-monto"
              name="monto_estimado"
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
            />
            {convenio && (
              <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/40 px-2.5 py-2 text-xs">
                <span className="text-muted">
                  Convenio vigente: ${convenio.precio_pactado.toFixed(2)}/unidad
                  {convenio.cantidad_minima
                    ? ` · mínimo ${convenio.cantidad_minima}`
                    : ""}
                  {convenio.dias_entrega_pactado
                    ? ` · entrega ~${convenio.dias_entrega_pactado} días`
                    : ""}
                  {convenio.condiciones_pago ? ` · ${convenio.condiciones_pago}` : ""}
                </span>
                <button
                  type="button"
                  onClick={usarConvenio}
                  className="cursor-pointer whitespace-nowrap font-medium text-accent hover:underline"
                >
                  Usar convenio
                </button>
              </div>
            )}
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
            {cargando ? "Guardando..." : "Crear caso"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
