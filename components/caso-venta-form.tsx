"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label, Select } from "@/components/ui";
import { ResponsableSelect } from "@/components/responsable-select";
import { NOTIF_REFRESH_EVENT } from "@/components/notificaciones-provider";
import { crearCasoVenta } from "@/lib/actions/ventas";
import { formatQty } from "@/lib/utils";
import type { UsuarioAsignable } from "@/lib/actions/usuarios";
import type { Cliente } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

type MaterialOpcion = {
  id: string;
  nombre: string;
  sku: string | null;
  unidad: string;
  stock_actual: number;
};

type Fila = { material_id: string; cantidad: string };

export function CasoVentaForm({
  open,
  onClose,
  clientes,
  materiales,
  usuarios,
}: {
  open: boolean;
  onClose: () => void;
  clientes: Cliente[];
  materiales: MaterialOpcion[];
  usuarios: UsuarioAsignable[];
}) {
  const router = useRouter();
  const [filas, setFilas] = useState<Fila[]>([{ material_id: "", cantidad: "" }]);
  const [responsableId, setResponsableId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (open) {
      setFilas([{ material_id: "", cantidad: "" }]);
      setResponsableId("");
      setError(null);
    }
  }, [open]);

  function setFila(i: number, cambio: Partial<Fila>) {
    setFilas((prev) =>
      prev.map((f, idx) => (idx === i ? { ...f, ...cambio } : f))
    );
  }

  async function onSubmit(formData: FormData) {
    setError(null);
    const items = filas
      .filter((f) => f.material_id)
      .map((f) => ({ material_id: f.material_id, cantidad: Number(f.cantidad) }));
    if (items.length === 0) {
      setError("Agrega al menos un material");
      return;
    }
    setCargando(true);
    formData.set("items", JSON.stringify(items));
    formData.set("responsable_id", responsableId);
    const res = await crearCasoVenta(formData);
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
    <Modal open={open} onClose={onClose} title="Nuevo caso de venta">
      <form action={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="cv-cliente">Cliente</Label>
          <Select id="cv-cliente" name="cliente_id" required defaultValue="">
            <option value="">— Selecciona —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="cv-titulo">Título</Label>
          <Input
            id="cv-titulo"
            name="titulo"
            placeholder="Cancelería oficina norte"
            required
          />
        </div>

        <div>
          <Label htmlFor="cv-descripcion">Descripción</Label>
          <Input id="cv-descripcion" name="descripcion" placeholder="Opcional" />
        </div>

        <div>
          <Label htmlFor="cv-responsable">Responsable (opcional)</Label>
          <ResponsableSelect
            usuarios={usuarios}
            value={responsableId}
            onChange={setResponsableId}
            ariaLabel="Responsable del caso"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="cv-monto">Monto (MXN)</Label>
            <Input
              id="cv-monto"
              name="monto"
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
            />
          </div>
          <div>
            <Label htmlFor="cv-referencia">Referencia</Label>
            <Input
              id="cv-referencia"
              name="referencia"
              placeholder="OV-3005 (auto)"
            />
          </div>
        </div>

        <div>
          <Label>Materiales requeridos</Label>
          <div className="space-y-2">
            {filas.map((fila, i) => {
              const sel = materiales.find((m) => m.id === fila.material_id);
              return (
                <div key={i} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <Select
                      value={fila.material_id}
                      onChange={(e) => setFila(i, { material_id: e.target.value })}
                      aria-label={`Material ${i + 1}`}
                    >
                      <option value="">— Material —</option>
                      {materiales.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                          {m.sku ? ` (${m.sku})` : ""}
                        </option>
                      ))}
                    </Select>
                    {sel && (
                      <p className="mt-1 text-xs text-faint">
                        Stock: {formatQty(sel.stock_actual, sel.unidad)}
                      </p>
                    )}
                  </div>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Cant."
                    className="w-24"
                    value={fila.cantidad}
                    onChange={(e) => setFila(i, { cantidad: e.target.value })}
                    aria-label={`Cantidad ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setFilas((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    disabled={filas.length === 1}
                    aria-label="Quitar material"
                    className="mt-2 cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() =>
              setFilas((prev) => [...prev, { material_id: "", cantidad: "" }])
            }
            className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-accent hover:underline"
          >
            <Plus className="h-4 w-4" /> Agregar material
          </button>
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
