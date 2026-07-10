"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label } from "@/components/ui";
import { recibirCasoCompra } from "@/lib/actions/compras";
import type { CasoCompraConRelaciones } from "@/lib/types";
import { PackageCheck } from "lucide-react";

export function RecibirCompraForm({
  caso,
  onClose,
}: {
  caso: CasoCompraConRelaciones | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    if (!caso) return;
    const cantidad = Number(formData.get("cantidad") ?? 0);
    const costoRaw = formData.get("costo_unitario");
    const costo =
      costoRaw != null && String(costoRaw).trim() !== "" ? Number(costoRaw) : 0;
    setCargando(true);
    const res = await recibirCasoCompra(caso.id, cantidad, costo);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal open={!!caso} onClose={onClose} title="Recibir compra">
      {caso && (
        <form action={onSubmit} className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 text-sm">
            <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <p className="font-medium text-fg">{caso.titulo}</p>
              <p className="mt-0.5 text-xs text-muted">
                {caso.materiales?.nombre ?? "Sin material"}
                {caso.referencia ? ` · ${caso.referencia}` : ""}
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="cantidad">Cantidad recibida</Label>
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
            <Label htmlFor="costo_unitario">
              Costo unitario de esta compra (opcional)
            </Label>
            <Input
              id="costo_unitario"
              name="costo_unitario"
              type="number"
              step="any"
              min="0"
              placeholder="Ej. 92.50"
            />
            <p className="mt-1 text-xs text-faint">
              Si lo capturas, se recalcula el costo promedio (WAC) del material.
            </p>
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
              <PackageCheck className="h-4 w-4" />
              {cargando ? "Registrando..." : "Recibir y sumar stock"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
