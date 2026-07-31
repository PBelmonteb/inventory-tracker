"use client";

// Detalle de un caso: si es una de varias cotizaciones comparadas
// (solicitud_id), muestra la tabla comparativa con "Elegir esta
// cotización" (las demás se cancelan solas); siempre muestra el timeline
// completo del caso (components/caso-timeline.tsx).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Badge, Button } from "@/components/ui";
import { CasoTimeline } from "@/components/caso-timeline";
import {
  elegirGanadora,
  obtenerEventosCaso,
  obtenerSolicitudConCasos,
} from "@/lib/actions/solicitudes";
import { formatMoney } from "@/lib/utils";
import type {
  CasoCompraConRelaciones,
  CasoCompraEvento,
  SolicitudCompraConRelaciones,
} from "@/lib/types";

export function CasoDetalleModal({
  open,
  onClose,
  caso,
  esGestor,
}: {
  open: boolean;
  onClose: () => void;
  caso: CasoCompraConRelaciones | null;
  // Defensa en profundidad: elegirGanadora ya rechaza a un no-gestor del
  // lado servidor, esto solo evita mostrar un botón que fallaría.
  esGestor: boolean;
}) {
  const router = useRouter();
  const [eventos, setEventos] = useState<CasoCompraEvento[]>([]);
  const [solicitud, setSolicitud] = useState<SolicitudCompraConRelaciones | null>(
    null
  );
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!open || !caso) {
      setEventos([]);
      setSolicitud(null);
      return;
    }
    let cancelado = false;
    obtenerEventosCaso(caso.id).then((e) => {
      if (!cancelado) setEventos(e);
    });
    if (caso.solicitud_id) {
      obtenerSolicitudConCasos(caso.solicitud_id).then((s) => {
        if (!cancelado) setSolicitud(s);
      });
    } else {
      setSolicitud(null);
    }
    return () => {
      cancelado = true;
    };
  }, [open, caso]);

  async function elegir(casoGanadorId: string) {
    if (!solicitud) return;
    if (
      !confirm(
        "¿Elegir esta cotización como ganadora? Las demás de esta solicitud se cancelarán."
      )
    )
      return;
    setCargando(true);
    const res = await elegirGanadora(solicitud.id, casoGanadorId);
    setCargando(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    const actualizada = await obtenerSolicitudConCasos(solicitud.id);
    setSolicitud(actualizada);
    router.refresh();
  }

  if (!caso) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Caso ${caso.referencia ?? ""}`}>
      <div className="space-y-4">
        <div className="text-sm">
          <p className="font-medium text-fg">{caso.titulo}</p>
          <p className="text-muted">
            {caso.proveedores?.nombre ?? caso.proveedor_nombre ?? "Proveedor eliminado"}
            {caso.materiales && <> · {caso.materiales.nombre}</>}
            {esGestor && <> · {formatMoney(caso.monto_estimado)}</>}
          </p>
        </div>

        {solicitud && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-fg">
              Cotizaciones de la solicitud {solicitud.codigo}
            </h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {solicitud.casos.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-fg">
                      {c.proveedores?.nombre ?? "Proveedor eliminado"}
                    </p>
                    <p className="text-xs text-muted">
                      {esGestor && <>{formatMoney(c.monto_estimado)} · </>}
                      {c.estado}
                    </p>
                  </div>
                  {c.id === solicitud.cotizacion_ganadora_id ? (
                    <Badge tone="ok">Ganadora</Badge>
                  ) : esGestor && solicitud.estado === "abierta" && c.estado !== "cancelado" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-2.5 py-1 text-xs"
                      disabled={cargando}
                      onClick={() => elegir(c.id)}
                    >
                      Elegir esta
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        <CasoTimeline
          casoId={caso.id}
          eventos={eventos}
          onNotaAgregada={() => obtenerEventosCaso(caso.id).then(setEventos)}
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
