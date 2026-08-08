"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label, Select } from "@/components/ui";
import { editarCasoVentaRechazado } from "@/lib/actions/autorizacion-ventas";
import type { CasoVentaConRelaciones, Cliente } from "@/lib/types";
import { Plus, Send, Trash2 } from "lucide-react";

type MaterialOpcion = { id: string; nombre: string; sku: string | null };
type Fila = { material_id: string; cantidad: string };

// Editar un caso de venta "rechazado": al guardar, regresa solo a
// "Pendiente de autorizar" — nunca hay que tocar el estado a mano. Puede
// usarlo tanto quien creó el caso (operario) como gestor/ventas.
export function EditarCasoVentaRechazadoForm({
  caso,
  clientes,
  materiales,
  onClose,
}: {
  caso: CasoVentaConRelaciones | null;
  clientes: Cliente[];
  materiales: MaterialOpcion[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState("");
  const [filas, setFilas] = useState<Fila[]>([{ material_id: "", cantidad: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setClienteId(caso?.cliente_id ?? "");
    setFilas(
      caso && caso.items.length > 0
        ? caso.items.map((i) => ({ material_id: i.material_id, cantidad: String(i.cantidad) }))
        : [{ material_id: "", cantidad: "" }]
    );
    setError(null);
  }, [caso?.id]);

  function setFila(i: number, cambio: Partial<Fila>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...cambio } : f)));
  }

  async function onSubmit(formData: FormData) {
    if (!caso) return;
    setError(null);
    const items = filas
      .filter((f) => f.material_id)
      .map((f) => ({ material_id: f.material_id, cantidad: Number(f.cantidad) }));
    if (items.length === 0) {
      setError("Agrega al menos un material");
      return;
    }
    formData.set("cliente_id", clienteId);
    formData.set("items", JSON.stringify(items));
    setCargando(true);
    const res = await editarCasoVentaRechazado(caso.id, formData);
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
            <Label htmlFor="ecv-cliente">Cliente</Label>
            <Select
              id="ecv-cliente"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              required
            >
              <option value="">— Selecciona —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="ecv-titulo">Título</Label>
            <Input id="ecv-titulo" name="titulo" defaultValue={caso.titulo} required />
          </div>

          <div>
            <Label htmlFor="ecv-descripcion">Descripción / nota</Label>
            <Input
              id="ecv-descripcion"
              name="descripcion"
              defaultValue={caso.descripcion ?? ""}
              placeholder="Opcional"
            />
          </div>

          <div>
            <Label>Materiales requeridos</Label>
            <div className="space-y-2">
              {filas.map((fila, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Select
                    value={fila.material_id}
                    onChange={(e) => setFila(i, { material_id: e.target.value })}
                    aria-label={`Material ${i + 1}`}
                    className="min-w-0 flex-1"
                  >
                    <option value="">— Material —</option>
                    {materiales.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                        {m.sku ? ` (${m.sku})` : ""}
                      </option>
                    ))}
                  </Select>
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
                    onClick={() => setFilas((prev) => prev.filter((_, idx) => idx !== i))}
                    disabled={filas.length <= 1}
                    aria-label="Quitar material"
                    className="mt-2 cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFilas((prev) => [...prev, { material_id: "", cantidad: "" }])}
              className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              <Plus className="h-4 w-4" /> Agregar material
            </button>
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
