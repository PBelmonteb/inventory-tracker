"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label } from "@/components/ui";
import { crearCatalogo } from "@/lib/actions/catalogos";
import { Plus } from "lucide-react";

export function NuevoProveedorModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const res = await crearCatalogo("proveedores", new FormData(e.currentTarget));
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo proveedor">
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="np-nombre">Nombre</Label>
          <Input id="np-nombre" name="nombre" required autoFocus />
        </div>
        <div>
          <Label htmlFor="np-contacto">Correo de contacto (opcional)</Label>
          <Input id="np-contacto" name="contacto" type="email" placeholder="compras@proveedor.com" />
        </div>
        <div>
          <Label htmlFor="np-dias">Días de entrega (opcional)</Label>
          <Input
            id="np-dias"
            name="dias_entrega_declarado"
            type="number"
            min="1"
            step="0.5"
            placeholder="Ej. 5"
          />
        </div>

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
            <Plus className="h-4 w-4" />
            {cargando ? "Guardando..." : "Crear proveedor"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
