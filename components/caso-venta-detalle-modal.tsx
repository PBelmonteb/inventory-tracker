"use client";

// Detalle de un caso de venta: siempre muestra el timeline completo
// (components/caso-venta-timeline.tsx) — gemelo simplificado de
// components/caso-detalle-modal.tsx (el lado de compras además compara
// varias cotizaciones; en ventas no existe ese concepto).
//
// Cuando el caso ya está "entregado" también muestra Devoluciones —
// reversa parcial/total de lo entregado (ver migración 0042). Solo
// gestor/ventas puede registrar una; cualquiera puede ver la lista.

import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { Button, Input, Label, Select } from "@/components/ui";
import { CasoVentaTimeline } from "@/components/caso-venta-timeline";
import { BotonCotizacionPDF } from "@/components/boton-cotizacion-pdf";
import {
  obtenerEventosCasoVenta,
  obtenerDevolucionesCasoVenta,
  registrarDevolucionVenta,
} from "@/lib/actions/ventas";
import { formatMoney, formatQty, formatDate } from "@/lib/utils";
import type { CasoVentaConRelaciones, CasoVentaEvento, DevolucionVenta } from "@/lib/types";
import { Undo2 } from "lucide-react";

export function CasoVentaDetalleModal({
  open,
  onClose,
  caso,
  puedeGestionarVentas,
}: {
  open: boolean;
  onClose: () => void;
  caso: CasoVentaConRelaciones | null;
  puedeGestionarVentas: boolean;
}) {
  const [eventos, setEventos] = useState<CasoVentaEvento[]>([]);
  const [devoluciones, setDevoluciones] = useState<DevolucionVenta[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!open || !caso) {
      setEventos([]);
      setDevoluciones([]);
      return;
    }
    let cancelado = false;
    obtenerEventosCasoVenta(caso.id).then((e) => {
      if (!cancelado) setEventos(e);
    });
    obtenerDevolucionesCasoVenta(caso.id).then((d) => {
      if (!cancelado) setDevoluciones(d);
    });
    setMaterialId("");
    setCantidad("");
    setMotivo("");
    setError(null);
    return () => {
      cancelado = true;
    };
  }, [open, caso]);

  if (!caso) return null;

  async function registrarDevolucion() {
    if (!caso) return;
    setError(null);
    if (!materialId) {
      setError("Selecciona un material");
      return;
    }
    const cantidadNum = Number(cantidad);
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      setError("La cantidad debe ser mayor a cero");
      return;
    }
    setCargando(true);
    const res = await registrarDevolucionVenta(
      caso.id,
      materialId,
      cantidadNum,
      motivo.trim() || undefined
    );
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMaterialId("");
    setCantidad("");
    setMotivo("");
    obtenerDevolucionesCasoVenta(caso.id).then(setDevoluciones);
    obtenerEventosCasoVenta(caso.id).then(setEventos);
  }

  return (
    <Modal open={open} onClose={onClose} title={`Caso ${caso.referencia ?? ""}`}>
      <div className="space-y-4">
        <div className="text-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-fg">{caso.titulo}</p>
              <p className="text-muted">
                {caso.clientes?.nombre ?? caso.cliente_nombre ?? "Cliente eliminado"}
                {" · "}
                {formatMoney(caso.monto)}
              </p>
            </div>
            <BotonCotizacionPDF caso={caso} />
          </div>
          {caso.items.length > 0 && (
            <p className="mt-0.5 text-xs text-faint">
              {caso.items
                .map((i) => `${i.materiales?.nombre ?? "Material"} ×${i.cantidad}`)
                .join(" · ")}
            </p>
          )}
        </div>

        {caso.estado === "entregado" && (
          <div className="rounded-lg border border-line p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-fg">
              <Undo2 className="h-4 w-4" /> Devoluciones
            </p>
            {devoluciones.length === 0 ? (
              <p className="text-xs text-faint">Sin devoluciones registradas.</p>
            ) : (
              <ul className="mb-2 divide-y divide-line">
                {devoluciones.map((d) => (
                  <li key={d.id} className="py-1.5 text-xs">
                    <span className="font-medium text-fg">
                      {d.material_nombre ?? "Material eliminado"}
                    </span>{" "}
                    × {formatQty(d.cantidad)}
                    {d.motivo && <> — {d.motivo}</>}
                    <span className="text-faint"> · {formatDate(d.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            {puedeGestionarVentas && (
              <div className="space-y-2 border-t border-line pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="dv-material">Material</Label>
                    <Select
                      id="dv-material"
                      value={materialId}
                      onChange={(e) => setMaterialId(e.target.value)}
                      aria-label="Material a devolver"
                    >
                      <option value="">— Material —</option>
                      {caso.items.map((i) => (
                        <option key={i.material_id} value={i.material_id}>
                          {i.materiales?.nombre ?? "Material"}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="dv-cantidad">Cantidad</Label>
                    <Input
                      id="dv-cantidad"
                      type="number"
                      step="any"
                      min="0"
                      value={cantidad}
                      onChange={(e) => setCantidad(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="dv-motivo">Motivo (opcional)</Label>
                  <Input
                    id="dv-motivo"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Pieza defectuosa"
                  />
                </div>
                {error && (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  className="px-3 py-1.5 text-xs"
                  disabled={cargando}
                  onClick={registrarDevolucion}
                >
                  {cargando ? "Registrando..." : "Registrar devolución"}
                </Button>
              </div>
            )}
          </div>
        )}

        <CasoVentaTimeline
          casoId={caso.id}
          eventos={eventos}
          onNotaAgregada={() => obtenerEventosCasoVenta(caso.id).then(setEventos)}
        />

        <div className="flex justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
