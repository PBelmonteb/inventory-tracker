"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { X } from "lucide-react";

/**
 * Overlay de escaneo por cámara. Usa la cámara trasera del dispositivo
 * (facingMode: environment) y lee QR y códigos de barras 1D.
 * Llama onDetected(texto) con el contenido del código (normalmente el SKU).
 */
export function Escaner({
  open,
  onClose,
  onDetected,
}: {
  open: boolean;
  onClose: () => void;
  onDetected: (texto: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let activo = true;
    // Controles del escáner para poder detener la cámara al cerrar.
    let controls: { stop: () => void } | null = null;
    setError(null);

    const reader = new BrowserMultiFormatReader();
    reader
      .decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current!,
        (result, _err, ctrl) => {
          controls = ctrl;
          if (!activo) return;
          if (result) {
            const texto = result.getText().trim();
            if (texto) {
              activo = false;
              ctrl.stop();
              onDetected(texto);
            }
          }
        }
      )
      .then((ctrl) => {
        controls = ctrl;
        if (!activo) ctrl.stop();
      })
      .catch((e) => {
        setError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "No se pudo acceder a la cámara. Da permiso de cámara e inténtalo de nuevo."
            : "No se pudo iniciar la cámara en este dispositivo."
        );
      });

    return () => {
      activo = false;
      controls?.stop();
    };
  }, [open, onDetected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <p className="text-sm font-medium">Escanear código del material</p>
        <button
          onClick={onClose}
          aria-label="Cerrar escáner"
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <p className="mx-8 text-center text-sm text-white/80">{error}</p>
        ) : (
          <>
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              muted
            />
            {/* Marco guía */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-56 w-56 rounded-2xl border-2 border-white/80 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
            </div>
          </>
        )}
      </div>

      <p className="px-6 py-5 text-center text-sm text-white/70">
        Apunta la cámara al código QR pegado en el material o el rack.
      </p>
    </div>
  );
}
