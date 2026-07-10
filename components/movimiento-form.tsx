"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label, Select } from "@/components/ui";
import {
  registrarMovimiento,
  obtenerStockPorUbicacion,
} from "@/lib/actions/movimientos";
import { NOTIF_REFRESH_EVENT } from "@/components/notificaciones-provider";
import { formatQty } from "@/lib/utils";
import type { StockPorUbicacion, TipoMovimiento, Ubicacion } from "@/lib/types";

type MaterialOpcion = {
  id: string;
  nombre: string;
  sku: string | null;
  unidad: string;
  stock_actual: number;
  ubicacion_id: string | null;
};

export function MovimientoForm({
  open,
  onClose,
  materiales,
  ubicaciones,
  materialFijo,
  tipoInicial = "entrada",
}: {
  open: boolean;
  onClose: () => void;
  materiales: MaterialOpcion[];
  ubicaciones: Ubicacion[];
  materialFijo?: MaterialOpcion;
  tipoInicial?: TipoMovimiento;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoMovimiento>(tipoInicial);
  const [materialId, setMaterialId] = useState(materialFijo?.id ?? "");
  const [ubicacionId, setUbicacionId] = useState("");
  const [stockPorUbicacion, setStockPorUbicacion] = useState<
    StockPorUbicacion[]
  >([]);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const seleccionado =
    materialFijo ?? materiales.find((m) => m.id === materialId);

  // Al elegir/entrar con un material, la ubicación por defecto es la suya y
  // se consulta el desglose real de stock por ubicación.
  useEffect(() => {
    if (!seleccionado) {
      setUbicacionId("");
      setStockPorUbicacion([]);
      return;
    }
    setUbicacionId(seleccionado.ubicacion_id ?? "");
    obtenerStockPorUbicacion(seleccionado.id).then(setStockPorUbicacion);
  }, [seleccionado?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const disponibleAqui =
    stockPorUbicacion.find((s) => s.ubicacion_id === (ubicacionId || null))
      ?.stock ?? 0;

  async function onSubmit(formData: FormData) {
    setError(null);
    setCargando(true);
    formData.set("material_id", materialFijo?.id ?? materialId);
    formData.set("tipo", tipo);
    formData.set("ubicacion_id", ubicacionId);
    const res = await registrarMovimiento(formData);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Avisa a la campana que recargue (puede haber nueva alerta de stock).
    window.dispatchEvent(new Event(NOTIF_REFRESH_EVENT));
    router.refresh();
    setNota("");
    onClose();
  }

  const MOTIVOS_AJUSTE = [
    "Conteo físico",
    "Merma",
    "Daño / rotura",
    "Corrección de captura",
    "Devolución",
  ];

  const tipos: { valor: TipoMovimiento; label: string }[] = [
    { valor: "entrada", label: "Entrada (llegó compra)" },
    { valor: "salida", label: "Salida (consumo)" },
    { valor: "ajuste", label: "Ajuste (conteo físico)" },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Registrar movimiento">
      <form action={onSubmit} className="space-y-3">
        <div>
          <Label>Tipo de movimiento</Label>
          <div className="grid grid-cols-3 gap-2">
            {tipos.map((t) => (
              <button
                key={t.valor}
                type="button"
                onClick={() => setTipo(t.valor)}
                className={
                  "cursor-pointer rounded-lg border px-2 py-2 text-xs font-medium transition-colors " +
                  (tipo === t.valor
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-line text-muted hover:bg-surface-2")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {!materialFijo && (
          <div>
            <Label htmlFor="material_id">Material</Label>
            <Select
              id="material_id"
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              required
            >
              <option value="">— Selecciona —</option>
              {materiales.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                  {m.sku ? ` (${m.sku})` : ""}
                </option>
              ))}
            </Select>
          </div>
        )}

        {seleccionado && ubicaciones.length > 0 && (
          <div>
            <Label htmlFor="ubicacion_sel">Ubicación</Label>
            <Select
              id="ubicacion_sel"
              value={ubicacionId}
              onChange={(e) => setUbicacionId(e.target.value)}
            >
              <option value="">— Ubicación por defecto —</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </Select>
          </div>
        )}

        {seleccionado && (
          <p className="rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm text-muted">
            {ubicacionId ? "Disponible en esa ubicación" : "Stock actual"}:{" "}
            <span className="font-semibold text-fg">
              {formatQty(
                ubicacionId ? disponibleAqui : seleccionado.stock_actual,
                seleccionado.unidad
              )}
            </span>
          </p>
        )}

        <div>
          <Label htmlFor="cantidad">
            {tipo === "ajuste" ? "Nuevo stock en esa ubicación" : "Cantidad"}
          </Label>
          <Input
            id="cantidad"
            name="cantidad"
            type="number"
            step="any"
            min="0"
            required
            autoFocus
          />
          {tipo === "ajuste" && (
            <p className="mt-1 text-xs text-faint">
              El stock de esa ubicación quedará exactamente en este valor.
            </p>
          )}
        </div>

        {tipo === "entrada" && (
          <div>
            <Label htmlFor="costo_unitario">
              Costo unitario de esta compra (opcional)
            </Label>
            <Input
              id="costo_unitario"
              name="costo_unitario"
              type="number"
              step="any"
              min="0"
              placeholder="Ej. 92.50"
            />
            <p className="mt-1 text-xs text-faint">
              Si lo capturas, se recalcula el costo promedio (WAC) del material.
            </p>
          </div>
        )}

        <div>
          <Label htmlFor="referencia">Referencia (orden de compra/producción)</Label>
          <Input id="referencia" name="referencia" placeholder="OC-1001 / OP-2001" />
        </div>

        <div>
          <Label htmlFor="nota">
            {tipo === "ajuste" ? "Motivo del ajuste *" : "Nota"}
          </Label>
          <Input
            id="nota"
            name="nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder={
              tipo === "ajuste" ? "Ej. Conteo físico, merma, daño…" : "Opcional"
            }
            required={tipo === "ajuste"}
          />
          {tipo === "ajuste" && (
            <>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MOTIVOS_AJUSTE.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setNota(m)}
                    className="cursor-pointer rounded-full border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    {m}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-faint">
                Un ajuste cambia el stock a mano; el motivo queda en el historial
                para auditoría.
              </p>
            </>
          )}
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
            {cargando ? "Guardando..." : "Registrar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
