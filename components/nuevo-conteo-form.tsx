"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label } from "@/components/ui";
import { crearConteo } from "@/lib/actions/conteos";
import type { Categoria, Ubicacion } from "@/lib/types";
import { ClipboardList } from "lucide-react";

export function NuevoConteoForm({
  open,
  onClose,
  categorias,
  ubicaciones,
}: {
  open: boolean;
  onClose: () => void;
  categorias: Categoria[];
  ubicaciones: Ubicacion[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setCargando(true);
    const res = await crearConteo(formData);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo conteo cíclico">
      <form action={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="nc-titulo">Título</Label>
          <Input
            id="nc-titulo"
            name="titulo"
            placeholder="Conteo semanal — Almacén A"
            required
            autoFocus
          />
        </div>

        <div>
          <Label htmlFor="nc-categoria">Categoría (opcional)</Label>
          <select
            id="nc-categoria"
            name="categoria_id"
            className="w-full cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="nc-ubicacion">Ubicación (opcional)</Label>
          <select
            id="nc-ubicacion"
            name="ubicacion_id"
            className="w-full cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            <option value="">Todas las ubicaciones</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </div>

        <p className="rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs text-muted">
          Se genera un item por cada material (y ubicación, si tiene stock
          repartido) dentro de lo que elijas aquí. Quien cuente no va a ver
          el stock que el sistema espera — el conteo es a ciegas.
        </p>

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={cargando}>
            <ClipboardList className="h-4 w-4" />
            {cargando ? "Creando..." : "Crear conteo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
