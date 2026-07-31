"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { guardarVista, eliminarVista } from "@/lib/actions/vistas";
import type { VistaGuardada } from "@/lib/types";
import { Bookmark, Trash2, Plus } from "lucide-react";

/**
 * Vistas/filtros guardados ("variants" estilo SAP Fiori): guarda el
 * querystring de filtros actual de la página bajo un nombre, por usuario.
 * Solo sirve en páginas cuyos filtros ya viven en la URL (ver Movimientos).
 */
export function VistasGuardadas({
  pagina,
  vistas,
}: {
  pagina: string;
  vistas: VistaGuardada[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const queryActual = searchParams.toString();

  useEffect(() => {
    if (!abierto) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [abierto]);

  async function guardar() {
    setError(null);
    setGuardando(true);
    const res = await guardarVista(pagina, nombre, queryActual);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNombre("");
    router.refresh();
  }

  async function borrar(id: string) {
    await eliminarVista(id, pagina);
    router.refresh();
  }

  function aplicar(vista: VistaGuardada) {
    router.push(vista.query ? `${pathname}?${vista.query}` : pathname);
    setAbierto(false);
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button variant="secondary" onClick={() => setAbierto((v) => !v)}>
        <Bookmark className="h-4 w-4" />
        Vistas
        {vistas.length > 0 && (
          <span className="text-xs text-faint">({vistas.length})</span>
        )}
      </Button>

      {abierto && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-line bg-surface shadow-soft">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-fg">Vistas guardadas</p>
            <p className="mt-0.5 text-xs text-faint">
              Tu combinación de filtros favorita, a un clic.
            </p>
          </div>

          {vistas.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              Aún no tienes vistas guardadas.
            </p>
          ) : (
            <ul className="max-h-64 divide-y divide-line overflow-y-auto">
              {vistas.map((v) => (
                <li key={v.id} className="flex items-center gap-2 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => aplicar(v)}
                    className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-medium text-fg hover:text-accent"
                  >
                    {v.nombre}
                  </button>
                  <button
                    type="button"
                    onClick={() => borrar(v.id)}
                    aria-label={`Borrar vista ${v.nombre}`}
                    className="shrink-0 cursor-pointer rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-line p-3">
            {!queryActual ? (
              <p className="text-xs text-faint">
                Aplica algún filtro para poder guardarlo como vista.
              </p>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Nombre de la vista..."
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !guardando && guardar()}
                  />
                  <Button
                    variant="secondary"
                    onClick={guardar}
                    disabled={guardando || !nombre.trim()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
