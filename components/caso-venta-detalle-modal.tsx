"use client";

// Detalle de un caso de venta: siempre muestra el timeline completo
// (components/caso-venta-timeline.tsx) — gemelo simplificado de
// components/caso-detalle-modal.tsx (el lado de compras además compara
// varias cotizaciones; en ventas no existe ese concepto).

import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui";
import { CasoVentaTimeline } from "@/components/caso-venta-timeline";
import { obtenerEventosCasoVenta } from "@/lib/actions/ventas";
import { formatMoney } from "@/lib/utils";
import type { CasoVentaConRelaciones, CasoVentaEvento } from "@/lib/types";

export function CasoVentaDetalleModal({
  open,
  onClose,
  caso,
}: {
  open: boolean;
  onClose: () => void;
  caso: CasoVentaConRelaciones | null;
}) {
  const [eventos, setEventos] = useState<CasoVentaEvento[]>([]);

  useEffect(() => {
    if (!open || !caso) {
      setEventos([]);
      return;
    }
    let cancelado = false;
    obtenerEventosCasoVenta(caso.id).then((e) => {
      if (!cancelado) setEventos(e);
    });
    return () => {
      cancelado = true;
    };
  }, [open, caso]);

  if (!caso) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Caso ${caso.referencia ?? ""}`}>
      <div className="space-y-4">
        <div className="text-sm">
          <p className="font-medium text-fg">{caso.titulo}</p>
          <p className="text-muted">
            {caso.clientes?.nombre ?? caso.cliente_nombre ?? "Cliente eliminado"}
            {" · "}
            {formatMoney(caso.monto)}
          </p>
          {caso.items.length > 0 && (
            <p className="mt-0.5 text-xs text-faint">
              {caso.items
                .map((i) => `${i.materiales?.nombre ?? "Material"} ×${i.cantidad}`)
                .join(" · ")}
            </p>
          )}
        </div>

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
