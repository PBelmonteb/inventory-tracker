"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label } from "@/components/ui";
import { resolverInspeccionCalidad } from "@/lib/actions/autorizacion";
import { validarResolucionInspeccion } from "@/lib/inspeccion-calidad";
import { formatDate, formatMoney, formatQty } from "@/lib/utils";
import type { InspeccionCalidad } from "@/lib/types";
import { CheckCircle2, XCircle } from "lucide-react";

// Resuelve una inspección de calidad pendiente: liberar (todo o en parte)
// y/o rechazar, con motivo si hay algo rechazado. Los botones "Liberar
// todo"/"Rechazar todo" cubren el caso común sin tener que escribir la
// cantidad a mano; el split parcial sigue disponible editando los dos
// campos.
export function ResolverInspeccionForm({
  inspeccion,
  onClose,
}: {
  inspeccion: InspeccionCalidad | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [liberada, setLiberada] = useState("");
  const [rechazada, setRechazada] = useState("0");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    // Por defecto, liberar todo — es el caso más común; el gestor ajusta
    // si de verdad hay una parte rechazada.
    setLiberada(inspeccion ? String(inspeccion.cantidad_recibida) : "");
    setRechazada("0");
    setMotivo("");
    setError(null);
  }, [inspeccion?.id]);

  const liberadaNum = Number(liberada) || 0;
  const rechazadaNum = Number(rechazada) || 0;

  async function confirmar() {
    if (!inspeccion) return;
    const v = validarResolucionInspeccion({
      cantidadRecibida: inspeccion.cantidad_recibida,
      cantidadLiberada: liberadaNum,
      cantidadRechazada: rechazadaNum,
      motivoRechazo: motivo,
    });
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setError(null);
    setCargando(true);
    const res = await resolverInspeccionCalidad(
      inspeccion.id,
      liberadaNum,
      rechazadaNum,
      motivo.trim() || null
    );
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal open={!!inspeccion} onClose={onClose} title="Resolver inspección de calidad">
      {inspeccion && (
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 text-sm">
            <p className="font-medium text-fg">{inspeccion.material_nombre}</p>
            <p className="mt-0.5 text-xs text-muted">
              {inspeccion.proveedor_nombre ?? "Proveedor eliminado"}
              {inspeccion.referencia ? ` · ${inspeccion.referencia}` : ""}
            </p>
            <p className="mt-1 text-xs text-faint">
              Recibido: {formatQty(inspeccion.cantidad_recibida)}
              {inspeccion.costo_unitario > 0 && ` · ${formatMoney(inspeccion.costo_unitario)} c/u`}
              {" · "}
              {formatDate(inspeccion.created_at)}
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1 text-xs"
              onClick={() => {
                setLiberada(String(inspeccion.cantidad_recibida));
                setRechazada("0");
              }}
            >
              Liberar todo
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="flex-1 text-xs"
              onClick={() => {
                setLiberada("0");
                setRechazada(String(inspeccion.cantidad_recibida));
              }}
            >
              Rechazar todo
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ri-liberada">Cantidad liberada</Label>
              <Input
                id="ri-liberada"
                type="number"
                step="any"
                min="0"
                value={liberada}
                onChange={(e) => setLiberada(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ri-rechazada">Cantidad rechazada</Label>
              <Input
                id="ri-rechazada"
                type="number"
                step="any"
                min="0"
                value={rechazada}
                onChange={(e) => setRechazada(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-faint">
            Liberada + rechazada debe sumar lo recibido ({formatQty(inspeccion.cantidad_recibida)}).
          </p>

          {rechazadaNum > 0 && (
            <div>
              <Label htmlFor="ri-motivo">Motivo del rechazo</Label>
              <textarea
                id="ri-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ej. piezas rayadas, no pasó la inspección dimensional..."
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={cargando}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmar} disabled={cargando}>
              {rechazadaNum > 0 && liberadaNum === 0 ? (
                <XCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {cargando ? "Guardando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
