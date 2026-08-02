"use client";

// Detalle de un caso: si es una de varias cotizaciones comparadas
// (solicitud_id), muestra la tabla comparativa con "Elegir esta
// cotización" (las demás se cancelan solas); siempre muestra el timeline
// completo del caso (components/caso-timeline.tsx).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Badge, Button, Input } from "@/components/ui";
import { CasoTimeline } from "@/components/caso-timeline";
import {
  elegirGanadora,
  obtenerEventosCaso,
  obtenerSolicitudConCasos,
} from "@/lib/actions/solicitudes";
import { actualizarMontoCaso } from "@/lib/actions/compras";
import { formatMoney } from "@/lib/utils";
import type {
  CasoCompraConRelaciones,
  CasoCompraEvento,
  SolicitudCompraConRelaciones,
} from "@/lib/types";
import { Pencil } from "lucide-react";

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
  const [editandoMonto, setEditandoMonto] = useState<string | null>(null);
  const [montoTexto, setMontoTexto] = useState("");
  const [guardandoMonto, setGuardandoMonto] = useState(false);

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

  async function guardarMonto(casoId: string) {
    const monto = Number(montoTexto);
    if (!Number.isFinite(monto) || monto < 0) {
      alert("Captura un monto válido");
      return;
    }
    setGuardandoMonto(true);
    const res = await actualizarMontoCaso(casoId, monto);
    setGuardandoMonto(false);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    setEditandoMonto(null);
    if (solicitud) setSolicitud(await obtenerSolicitudConCasos(solicitud.id));
    router.refresh();
  }

  // Monto + badge "Sin confirmar" cuando lo puso el sistema solo (regex
  // sobre un correo) — con edición inline para corregirlo antes de elegir
  // ganadora. Se usa tanto en el resumen de arriba como en cada fila de
  // la tabla comparativa.
  function Monto({ casoId, monto, confirmado }: { casoId: string; monto: number; confirmado: boolean }) {
    if (editandoMonto === casoId) {
      return (
        <span className="inline-flex items-center gap-1.5">
          <Input
            autoFocus
            type="number"
            step="any"
            min="0"
            value={montoTexto}
            onChange={(e) => setMontoTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !guardandoMonto && guardarMonto(casoId)}
            className="h-7 w-24 px-2 py-1 text-xs"
          />
          <Button
            type="button"
            className="px-2 py-1 text-xs"
            disabled={guardandoMonto}
            onClick={() => guardarMonto(casoId)}
          >
            OK
          </Button>
          <button
            type="button"
            className="cursor-pointer text-xs text-faint hover:text-fg"
            onClick={() => setEditandoMonto(null)}
          >
            Cancelar
          </button>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5">
        {formatMoney(monto)}
        {!confirmado && <Badge tone="warn">Sin confirmar</Badge>}
        {esGestor && (
          <button
            type="button"
            aria-label="Corregir monto"
            className="cursor-pointer text-faint hover:text-fg"
            onClick={() => {
              setMontoTexto(String(monto));
              setEditandoMonto(casoId);
            }}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  }

  if (!caso) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Caso ${caso.referencia ?? ""}`}>
      <div className="space-y-4">
        <div className="text-sm">
          <p className="font-medium text-fg">{caso.titulo}</p>
          <p className="flex flex-wrap items-center gap-1 text-muted">
            <span>
              {caso.proveedores?.nombre ?? caso.proveedor_nombre ?? "Proveedor eliminado"}
              {caso.materiales && <> · {caso.materiales.nombre}</>}
            </span>
            {esGestor && (
              <>
                <span>·</span>
                <Monto casoId={caso.id} monto={caso.monto_estimado} confirmado={caso.monto_confirmado} />
              </>
            )}
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
                    <p className="flex flex-wrap items-center gap-1 text-xs text-muted">
                      {esGestor && (
                        <>
                          <Monto casoId={c.id} monto={c.monto_estimado} confirmado={c.monto_confirmado} />
                          <span>·</span>
                        </>
                      )}
                      <span>{c.estado}</span>
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
