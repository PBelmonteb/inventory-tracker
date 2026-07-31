"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label } from "@/components/ui";
import { editarCasoRechazado } from "@/lib/actions/autorizacion";
import type { CasoCompraConRelaciones, Proveedor } from "@/lib/types";
import { Send } from "lucide-react";

type MaterialOpcion = { id: string; nombre: string; sku: string | null };

// Editar un caso "rechazado": al guardar, regresa solo a "Pendientes de
// Autorizar" — nunca hay que tocar el estado a mano.
export function EditarCasoRechazadoForm({
  caso,
  proveedores,
  materiales,
  onClose,
  esGestor,
}: {
  caso: CasoCompraConRelaciones | null;
  proveedores: Proveedor[];
  materiales: MaterialOpcion[];
  onClose: () => void;
  // El operario nunca ve ni captura el monto — se queda igual (el gestor
  // lo define cuando revise el caso de nuevo).
  esGestor: boolean;
}) {
  const router = useRouter();
  const [proveedorId, setProveedorId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setProveedorId(caso?.proveedor_id ?? "");
    setMaterialId(caso?.material_id ?? "");
    setError(null);
  }, [caso?.id]);

  async function onSubmit(formData: FormData) {
    if (!caso) return;
    setError(null);
    formData.set("proveedor_id", proveedorId);
    formData.set("material_id", materialId);
    setCargando(true);
    const res = await editarCasoRechazado(caso.id, formData);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal open={!!caso} onClose={onClose} title="Editar y reenviar a autorización">
      {caso && (
        <form action={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="er-proveedor">Proveedor</Label>
            <select
              id="er-proveedor"
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              required
              className="w-full cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              <option value="">— Selecciona —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="er-material">Material</Label>
            <select
              id="er-material"
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              required
              className="w-full cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              <option value="">— Selecciona —</option>
              {materiales.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                  {m.sku ? ` (${m.sku})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="er-titulo">Título</Label>
            <Input id="er-titulo" name="titulo" defaultValue={caso.titulo} required />
          </div>

          <div>
            <Label htmlFor="er-descripcion">Descripción / nota</Label>
            <Input
              id="er-descripcion"
              name="descripcion"
              defaultValue={caso.descripcion ?? ""}
              placeholder="Opcional"
            />
          </div>

          <div className={esGestor ? "grid grid-cols-2 gap-3" : ""}>
            <div>
              <Label htmlFor="er-cantidad">Cantidad</Label>
              <Input
                id="er-cantidad"
                name="cantidad_estimada"
                type="number"
                step="any"
                min="0"
                defaultValue={caso.cantidad_estimada ?? ""}
                required
              />
            </div>
            {esGestor && (
              <div>
                <Label htmlFor="er-monto">Monto estimado (MXN)</Label>
                <Input
                  id="er-monto"
                  name="monto_estimado"
                  type="number"
                  step="any"
                  min="0"
                  defaultValue={caso.monto_estimado}
                  required
                />
              </div>
            )}
          </div>

          {caso.motivo_rechazo && (
            <p className="rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs text-muted">
              Motivo del rechazo: {caso.motivo_rechazo}
            </p>
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
              <Send className="h-4 w-4" />
              {cargando ? "Guardando..." : "Guardar y reenviar"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
