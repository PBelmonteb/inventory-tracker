"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

// Ícono ⓘ reusable con popover — para explicar de dónde sale un número
// calculado (fórmula + los valores reales usados) justo donde se captura,
// no escondido en documentación aparte.
export function InfoTooltip({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLSpanElement>(null);

  // Cierra al hacer clic fuera — más confiable que onBlur, que puede
  // dispararse antes de que el usuario alcance a leer el contenido.
  useEffect(() => {
    if (!abierto) return;
    function onClickFuera(e: MouseEvent) {
      if (!contenedorRef.current?.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, [abierto]);

  return (
    <span ref={contenedorRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Más información"
        className="ml-1 inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-faint transition-colors hover:text-accent"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {abierto && (
        <div
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed text-muted shadow-soft"
        >
          {children}
        </div>
      )}
    </span>
  );
}
