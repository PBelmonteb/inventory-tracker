"use client";

// Selector de varios proveedores a la vez (chips + panel de checkboxes) —
// mismo idioma que ya existe en components/comparativa-precios.tsx para
// elegir varias series de precio a la vez. Se usa en caso-compra-form.tsx
// para armar una solicitud comparativa (una cotización por proveedor
// elegido) en vez de un solo caso.

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { normalizarTexto } from "@/lib/utils";
import type { Proveedor } from "@/lib/types";

export function ProveedorMultiSelect({
  proveedores,
  value,
  onChange,
  placeholder = "Selecciona uno o más proveedores...",
}: {
  proveedores: Proveedor[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setAbierto(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [abierto]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  const filtrados = busqueda
    ? proveedores.filter((p) => normalizarTexto(p.nombre).includes(normalizarTexto(busqueda)))
    : proveedores;
  const seleccionados = proveedores.filter((p) => value.includes(p.id));

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm"
      >
        {seleccionados.length === 0 ? (
          <span className="text-faint">{placeholder}</span>
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {seleccionados.map((p) => (
              <span
                key={p.id}
                className="flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs text-fg"
              >
                {p.nombre}
                <X
                  className="h-3 w-3 cursor-pointer text-faint hover:text-fg"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(p.id);
                  }}
                />
              </span>
            ))}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-faint transition-transform ${abierto ? "rotate-180" : ""}`}
        />
      </button>

      {abierto && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-soft">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="h-4 w-4 text-faint" />
            <input
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar proveedor..."
              className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-faint"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtrados.length === 0 ? (
              <li className="px-3 py-2 text-sm text-faint">Sin resultados.</li>
            ) : (
              filtrados.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2/40">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer rounded border-line accent-accent"
                      checked={value.includes(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    {p.nombre}
                  </label>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
