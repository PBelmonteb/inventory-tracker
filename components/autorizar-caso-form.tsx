"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label } from "@/components/ui";
import { autorizarCasoCompra, rechazarCasoCompra } from "@/lib/actions/autorizacion";
import { formatDate } from "@/lib/utils";
import type { CasoCompraConRelaciones } from "@/lib/types";
import { CheckCircle2, XCircle } from "lucide-react";

// Revisión del gestor para un caso "por_autorizar": ya viene con las
// especificaciones del operario, aquí solo se confirman (o se ajustan) antes
// de autorizar. Rechazar pide un motivo opcional y manda el caso a
// "Rechazados", desde donde se puede editar y reenviar.
export function AutorizarCasoForm({
  caso,
  onClose,
}: {
  caso: CasoCompraConRelaciones | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [cantidad, setCantidad] = useState("");
  const [monto, setMonto] = useState("");
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setCantidad(caso?.cantidad_estimada != null ? String(caso.cantidad_estimada) : "");
    setMonto(caso ? String(caso.monto_estimado) : "");
    setRechazando(false);
    setMotivo("");
    setError(null);
  }, [caso?.id]);

  async function autorizar() {
    if (!caso) return;
    const cantidadNum = Number(cantidad);
    const montoNum = Number(monto);
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      setError("La cantidad debe ser mayor a cero");
      return;
    }
    if (!Number.isFinite(montoNum) || montoNum < 0) {
      setError("El monto no puede ser negativo");
      return;
    }
    setError(null);
    setCargando(true);
    const res = await autorizarCasoCompra(caso.id, cantidadNum, montoNum);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  async function rechazar() {
    if (!caso) return;
    setError(null);
    setCargando(true);
    const res = await rechazarCasoCompra(caso.id, motivo);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal open={!!caso} onClose={onClose} title="Revisar caso de compra">
      {caso && (
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 text-sm">
            <p className="font-medium text-fg">{caso.materiales?.nombre ?? caso.titulo}</p>
            <p className="mt-0.5 text-xs text-muted">
              {caso.proveedores?.nombre ?? caso.proveedor_nombre ?? "Proveedor eliminado"}
              {caso.referencia ? ` · ${caso.referencia}` : ""}
            </p>
            <p className="mt-1 text-xs text-faint">
              {caso.creado_por_nombre
                ? `Creado por ${caso.creado_por_nombre}`
                : "Creado automáticamente"}{" "}
              · {formatDate(caso.created_at)}
            </p>
          </div>

          {!rechazando ? (
            <>
              <div>
                <Label htmlFor="ac-cantidad">Cantidad</Label>
                <Input
                  id="ac-cantidad"
                  type="number"
                  step="any"
                  min="0"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ac-monto">Monto estimado (MXN)</Label>
                <Input
                  id="ac-monto"
                  type="number"
                  step="any"
                  min="0"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
              </div>
            </>
          ) : (
            <div>
              <Label htmlFor="ac-motivo">Motivo del rechazo (opcional)</Label>
              <textarea
                id="ac-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ej. falta ajustar la cantidad, revisar con otro proveedor..."
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            {rechazando ? (
              <>
                <Button type="button" variant="secondary" onClick={() => setRechazando(false)} disabled={cargando}>
                  Regresar
                </Button>
                <Button type="button" variant="danger" onClick={rechazar} disabled={cargando}>
                  <XCircle className="h-4 w-4" />
                  {cargando ? "Rechazando..." : "Confirmar rechazo"}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="danger" onClick={() => setRechazando(true)} disabled={cargando}>
                  <XCircle className="h-4 w-4" />
                  Rechazar
                </Button>
                <Button type="button" onClick={autorizar} disabled={cargando}>
                  <CheckCircle2 className="h-4 w-4" />
                  {cargando ? "Autorizando..." : "Autorizar"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
