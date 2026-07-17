"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label } from "@/components/ui";
import { recibirCasoCompra } from "@/lib/actions/compras";
import { formatMoney } from "@/lib/utils";
import type { CasoCompraConRelaciones } from "@/lib/types";
import { PackageCheck } from "lucide-react";

type ModoCosto = "total" | "unitario";

export function RecibirCompraForm({
  caso,
  onClose,
}: {
  caso: CasoCompraConRelaciones | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [modo, setModo] = useState<ModoCosto>("total");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");

  // El componente no se desmonta entre un caso y otro (el Modal sí, pero el
  // estado vive aquí) — sin esto, abrir "recibir" para un caso distinto
  // arrastraría los valores del anterior.
  useEffect(() => {
    setCantidad("");
    setCosto("");
    setModo("total");
    setError(null);
  }, [caso?.id]);

  const cantidadNum = Number(cantidad) || 0;
  const costoNum = Number(costo) || 0;
  const costoUnitarioCalculado =
    modo === "total" ? (cantidadNum > 0 ? costoNum / cantidadNum : 0) : costoNum;
  const costoTotalCalculado = modo === "unitario" ? costoNum * cantidadNum : costoNum;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!caso) return;
    setCargando(true);
    const res = await recibirCasoCompra(
      caso.id,
      cantidadNum,
      Math.round(costoUnitarioCalculado * 100) / 100
    );
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal open={!!caso} onClose={onClose} title="Recibir compra">
      {caso && (
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 text-sm">
            <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <p className="font-medium text-fg">{caso.titulo}</p>
              <p className="mt-0.5 text-xs text-muted">
                {caso.materiales?.nombre ?? "Sin material"}
                {caso.referencia ? ` · ${caso.referencia}` : ""}
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="cantidad">Cantidad recibida</Label>
            <Input
              id="cantidad"
              type="number"
              step="any"
              min="0"
              required
              autoFocus
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <Label htmlFor="costo" className="mb-0">
                {modo === "total" ? "Costo total de esta compra" : "Costo unitario de esta compra"}{" "}
                (opcional)
              </Label>
              <button
                type="button"
                onClick={() => {
                  setModo((m) => (m === "total" ? "unitario" : "total"));
                  setCosto("");
                }}
                className="shrink-0 cursor-pointer text-xs font-medium text-accent hover:underline"
              >
                {modo === "total" ? "Capturar por pieza" : "Capturar el total"}
              </button>
            </div>
            <Input
              id="costo"
              type="number"
              step="any"
              min="0"
              placeholder={modo === "total" ? "Ej. 4625.00" : "Ej. 92.50"}
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
            />
            <p className="mt-1 text-xs text-faint">
              {costoNum > 0 && cantidadNum > 0
                ? modo === "total"
                  ? `= ${formatMoney(costoUnitarioCalculado)} por unidad — se recalcula el costo promedio (WAC) del material.`
                  : `= ${formatMoney(costoTotalCalculado)} en total — se recalcula el costo promedio (WAC) del material.`
                : "Si lo capturas, se recalcula el costo promedio (WAC) del material."}
            </p>
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
              <PackageCheck className="h-4 w-4" />
              {cargando ? "Registrando..." : "Recibir y sumar stock"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
