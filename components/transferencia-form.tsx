"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label, Select } from "@/components/ui";
import {
  transferirStock,
  iniciarTraslado,
  obtenerStockPorUbicacion,
} from "@/lib/actions/movimientos";
import { formatQty } from "@/lib/utils";
import type { StockPorUbicacion, Ubicacion } from "@/lib/types";
import { ArrowRightLeft, Truck } from "lucide-react";

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
  // Instantáneo (transferirStock) por default — el traslado en tránsito es
  // opt-in solo para cuando de verdad tarda (ej. entre plantas lejanas).
  const [tomaTiempo, setTomaTiempo] = useState(false);

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
    const res = await (tomaTiempo ? iniciarTraslado : transferirStock)(formData);
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

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={tomaTiempo}
            onChange={(e) => setTomaTiempo(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
          />
          <span>
            <span className="font-medium text-fg">Este traslado tarda en llegar</span>
            <span className="block text-xs text-muted">
              El material sale de origen ahora mismo, pero queda &quot;en
              tránsito&quot; (ni en origen ni en destino) hasta que alguien
              confirme la llegada en{" "}
              <span className="font-medium">Traslados</span>. Sin marcar,
              el traslado es instantáneo, como hoy.
            </span>
          </span>
        </label>

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
            {tomaTiempo ? (
              <Truck className="h-4 w-4" />
            ) : (
              <ArrowRightLeft className="h-4 w-4" />
            )}
            {cargando
              ? "Procesando..."
              : tomaTiempo
                ? "Iniciar traslado"
                : "Trasladar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
