"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import { guardarBom } from "@/lib/actions/produccion";
import { formatQty } from "@/lib/utils";
import type { BomItemConMaterial, MaterialConRelaciones } from "@/lib/types";
import { ListChecks, Plus, Trash2 } from "lucide-react";

// Receta de producción de un material ("1 ventana = X perfil + Y herrajes +
// Z silicón"). Un solo nivel: un componente aquí no explota su propia
// receta — si lo es, se produce aparte primero.
export function BomEditor({
  material,
  bom,
  materialesDisponibles,
  esGestor,
}: {
  material: MaterialConRelaciones;
  bom: BomItemConMaterial[];
  materialesDisponibles: MaterialConRelaciones[];
  esGestor: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [filas, setFilas] = useState(
    bom.map((b) => ({
      componente_id: b.componente_id,
      cantidad_por_unidad: b.cantidad_por_unidad,
    }))
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opciones = materialesDisponibles.filter((m) => m.id !== material.id);

  function agregarFila() {
    const disponible = opciones.find(
      (m) => !filas.some((f) => f.componente_id === m.id)
    );
    if (!disponible) return;
    setFilas((f) => [
      ...f,
      { componente_id: disponible.id, cantidad_por_unidad: 1 },
    ]);
  }

  function quitarFila(idx: number) {
    setFilas((f) => f.filter((_, i) => i !== idx));
  }

  function actualizarFila(
    idx: number,
    cambios: Partial<{ componente_id: string; cantidad_por_unidad: number }>
  ) {
    setFilas((f) => f.map((row, i) => (i === idx ? { ...row, ...cambios } : row)));
  }

  async function guardar() {
    setError(null);
    setGuardando(true);
    const res = await guardarBom(material.id, filas);
    setGuardando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEditando(false);
    router.refresh();
  }

  function cancelar() {
    setFilas(
      bom.map((b) => ({
        componente_id: b.componente_id,
        cantidad_por_unidad: b.cantidad_por_unidad,
      }))
    );
    setError(null);
    setEditando(false);
  }

  // Nada que mostrarle a un operario si el material no es producible.
  if (!esGestor && bom.length === 0) return null;

  return (
    <Card className="mt-4 p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-accent" />
          <h2 className="font-semibold text-fg">Receta de producción</h2>
        </div>
        {esGestor && !editando && (
          <Button variant="secondary" onClick={() => setEditando(true)}>
            {bom.length === 0 ? "Configurar receta" : "Editar"}
          </Button>
        )}
      </div>

      {!editando ? (
        bom.length === 0 ? (
          <p className="text-sm text-muted">
            Este material no tiene una receta configurada — no se puede
            producir directamente en <code>/produccion</code>.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {bom.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="text-fg">{b.componente.nombre}</span>
                <span className="text-muted">
                  {formatQty(b.cantidad_por_unidad, b.componente.unidad)} por
                  unidad
                </span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="space-y-3">
          {filas.length === 0 && (
            <p className="text-sm text-muted">Sin componentes todavía.</p>
          )}
          {filas.map((fila, idx) => {
            const comp = opciones.find((m) => m.id === fila.componente_id);
            return (
              <div key={idx} className="flex items-center gap-2">
                <Select
                  value={fila.componente_id}
                  onChange={(e) =>
                    actualizarFila(idx, { componente_id: e.target.value })
                  }
                  className="flex-1"
                  aria-label="Componente"
                >
                  {opciones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                      {m.sku ? ` (${m.sku})` : ""}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={fila.cantidad_por_unidad}
                  onChange={(e) =>
                    actualizarFila(idx, {
                      cantidad_por_unidad: Number(e.target.value) || 0,
                    })
                  }
                  className="w-24"
                  aria-label="Cantidad por unidad"
                />
                <span className="w-12 shrink-0 text-xs text-faint">
                  {comp?.unidad}
                </span>
                <button
                  type="button"
                  onClick={() => quitarFila(idx)}
                  aria-label="Quitar componente"
                  className="cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          <Button
            type="button"
            variant="secondary"
            onClick={agregarFila}
            disabled={filas.length >= opciones.length}
          >
            <Plus className="h-4 w-4" /> Agregar componente
          </Button>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={cancelar}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={guardar}
              disabled={guardando || filas.length === 0}
            >
              {guardando ? "Guardando..." : "Guardar receta"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
