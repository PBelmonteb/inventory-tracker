"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label } from "@/components/ui";
import { cambiarEstadoCasoCompra } from "@/lib/actions/compras";
import type { CasoCompraConRelaciones } from "@/lib/types";
import { PackageCheck } from "lucide-react";

// Se abre al marcar un caso "Ordenado" si todavía no tiene una cantidad
// capturada — sin este dato, el caso quedaría marcado como en camino pero
// invisible para el "stock por llegar" de Inventario (lib/data.ts,
// getPorLlegar). Mismo patrón que RecibirCompraForm: la transición de
// estado pide primero el dato que la hace útil, en vez de dejarlo opcional.
export function MarcarOrdenadoForm({
  caso,
  onClose,
}: {
  caso: CasoCompraConRelaciones | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [cantidad, setCantidad] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setCantidad("");
    setError(null);
  }, [caso?.id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!caso) return;
    const cantidadNum = Number(cantidad);
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      setError("La cantidad debe ser mayor a cero");
      return;
    }
    setError(null);
    setCargando(true);
    const res = await cambiarEstadoCasoCompra(caso.id, "ordenado", cantidadNum);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal open={!!caso} onClose={onClose} title="Marcar como ordenado">
      {caso && (
        <form onSubmit={onSubmit} className="space-y-3">
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
            <Label htmlFor="mo-cantidad">
              ¿Cuánto pediste? ({caso.materiales?.nombre ? "unidad del material" : "cantidad"})
            </Label>
            <Input
              id="mo-cantidad"
              type="number"
              step="any"
              min="0"
              required
              autoFocus
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />
            <p className="mt-1 text-xs text-faint">
              Se usa para que este pedido cuente como "por llegar" en
              Inventario mientras no se reciba.
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
              {cargando ? "Guardando..." : "Marcar como ordenado"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
