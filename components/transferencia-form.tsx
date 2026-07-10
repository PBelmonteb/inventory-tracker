"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label, Select } from "@/components/ui";
import {
  transferirStock,
  obtenerStockPorUbicacion,
} from "@/lib/actions/movimientos";
import { formatQty } from "@/lib/utils";
import type { StockPorUbicacion, Ubicacion } from "@/lib/types";
import { ArrowRightLeft } from "lucide-react";

export function TransferenciaForm({
  open,
  onClose,
  material,
  ubicaciones,
}: {
  open: boolean;
  onClose: () => void;
  material: { id: string; nombre: string; unidad: string; ubicacion_id: string | null };
  ubicaciones: Ubicacion[];
}) {
  const router = useRouter();
  const [origenId, setOrigenId] = useState(material.ubicacion_id ?? "");
  const [destinoId, setDestinoId] = useState("");
  const [stockPorUbicacion, setStockPorUbicacion] = useState<
    StockPorUbicacion[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!open) return;
    obtenerStockPorUbicacion(material.id).then(setStockPorUbicacion);
  }, [open, material.id]);

  const disponibleOrigen =
    stockPorUbicacion.find((s) => s.ubicacion_id === (origenId || null))
      ?.stock ?? 0;

  async function onSubmit(formData: FormData) {
    setError(null);
    setCargando(true);
    formData.set("material_id", material.id);
    formData.set("origen_id", origenId);
    formData.set("destino_id", destinoId);
    const res = await transferirStock(formData);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Trasladar entre ubicaciones">
      <form action={onSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="origen_id">Origen</Label>
            <Select
              id="origen_id"
              value={origenId}
              onChange={(e) => setOrigenId(e.target.value)}
              required
            >
              <option value="">— Selecciona —</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="destino_id">Destino</Label>
            <Select
              id="destino_id"
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
              required
            >
              <option value="">— Selecciona —</option>
              {ubicaciones
                .filter((u) => u.id !== origenId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
            </Select>
          </div>
        </div>

        {origenId && (
          <p className="rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm text-muted">
            Disponible en el origen:{" "}
            <span className="font-semibold text-fg">
              {formatQty(disponibleOrigen, material.unidad)}
            </span>
          </p>
        )}

        <div>
          <Label htmlFor="cantidad">Cantidad a trasladar</Label>
          <Input
            id="cantidad"
            name="cantidad"
            type="number"
            step="any"
            min="0"
            required
            autoFocus
          />
        </div>

        <div>
          <Label htmlFor="nota">Nota (opcional)</Label>
          <Input id="nota" name="nota" placeholder="Opcional" />
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
            <ArrowRightLeft className="h-4 w-4" />
            {cargando ? "Trasladando..." : "Trasladar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
