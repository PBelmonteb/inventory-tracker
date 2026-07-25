"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Badge, Button, Input } from "@/components/ui";
import {
  aplicarConteo,
  cancelarConteo,
  capturarConteoItem,
  cerrarConteo,
  obtenerConteoDetalle,
} from "@/lib/actions/conteos";
import { formatDate, formatQty } from "@/lib/utils";
import type { Conteo, ConteoDetalle } from "@/lib/types";
import { Ban, CheckCircle2, Save } from "lucide-react";

const ESTADO_META: Record<
  ConteoDetalle["estado"],
  { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "accent" }
> = {
  abierto: { label: "Abierto", tone: "warn" },
  contado: { label: "Contado", tone: "accent" },
  aplicado: { label: "Aplicado", tone: "ok" },
  cancelado: { label: "Cancelado", tone: "neutral" },
};

export function ConteoDetalleModal({
  conteo,
  esGestor,
  onClose,
}: {
  conteo: Conteo | null;
  esGestor: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detalle, setDetalle] = useState<ConteoDetalle | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conteo) {
      setDetalle(null);
      return;
    }
    let cancelado = false;
    obtenerConteoDetalle(conteo.id).then((d) => {
      if (cancelado || !d) return;
      setDetalle(d);
      setValores(
        Object.fromEntries(
          d.items.map((it) => [it.id, it.cantidad_contada != null ? String(it.cantidad_contada) : ""])
        )
      );
    });
    return () => {
      cancelado = true;
    };
  }, [conteo]);

  async function refrescar() {
    if (!conteo) return;
    const d = await obtenerConteoDetalle(conteo.id);
    setDetalle(d);
    if (d) {
      setValores(
        Object.fromEntries(
          d.items.map((it) => [it.id, it.cantidad_contada != null ? String(it.cantidad_contada) : ""])
        )
      );
    }
    router.refresh();
  }

  async function guardarItem(itemId: string) {
    const valor = Number(valores[itemId]);
    if (!Number.isFinite(valor) || valor < 0) {
      setError("Captura un número válido (0 o más)");
      return;
    }
    setError(null);
    setGuardando(itemId);
    const res = await capturarConteoItem(itemId, valor);
    setGuardando(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await refrescar();
  }

  async function accionConteo(fn: (id: string) => Promise<{ ok: boolean; error?: string }>) {
    if (!conteo) return;
    setError(null);
    setProcesando(true);
    const res = await fn(conteo.id);
    setProcesando(false);
    if (!res.ok) {
      setError(res.error ?? "Error");
      return;
    }
    await refrescar();
  }

  if (!conteo) return null;
  const estado = detalle?.estado ?? conteo.estado;
  // Solo vemos esperado/varianza si obtenerConteoDetalle decidió mandarlo
  // (conteo ya resuelto, o "contado" visto por un gestor) — el conteo es
  // a ciegas mientras tanto.
  const verEsperado = detalle?.items.some((it) => it.stock_esperado !== undefined) ?? false;
  const soloLectura = estado !== "abierto" || !detalle;

  return (
    <Modal open={!!conteo} onClose={onClose} title={`${conteo.titulo} · ${conteo.codigo}`}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone={ESTADO_META[estado].tone}>{ESTADO_META[estado].label}</Badge>
          <span>Creado por {conteo.creado_por_nombre ?? "—"} · {formatDate(conteo.created_at)}</span>
        </div>

        {!verEsperado && estado !== "aplicado" && estado !== "cancelado" && (
          <p className="rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs text-muted">
            {estado === "abierto"
              ? "Captura lo que cuentes físicamente — no se muestra el stock del sistema."
              : "Ya se capturó todo. Esperando que un gestor lo revise y lo aplique."}
          </p>
        )}

        {!detalle ? (
          <p className="py-6 text-center text-sm text-faint">Cargando…</p>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-line bg-surface-2/70 text-left text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="px-3 py-2 font-medium">Material</th>
                  <th className="px-3 py-2 font-medium">Ubicación</th>
                  {verEsperado && <th className="px-3 py-2 text-right font-medium">Esperado</th>}
                  <th className="px-3 py-2 text-right font-medium">Contado</th>
                  {verEsperado && <th className="px-3 py-2 text-right font-medium">Varianza</th>}
                  {!soloLectura && <th className="px-3 py-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {detalle.items.map((it) => {
                  const varianza =
                    verEsperado && it.stock_esperado !== undefined && it.cantidad_contada != null
                      ? it.cantidad_contada - it.stock_esperado
                      : null;
                  return (
                    <tr key={it.id}>
                      <td className="px-3 py-2 text-fg">
                        {it.material_nombre}
                        {it.material_sku && (
                          <span className="ml-1.5 text-xs text-faint">{it.material_sku}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted">{it.ubicacion_nombre ?? "—"}</td>
                      {verEsperado && (
                        <td className="px-3 py-2 text-right text-muted">
                          {it.stock_esperado !== undefined ? formatQty(it.stock_esperado) : "—"}
                        </td>
                      )}
                      <td className="px-3 py-2 text-right">
                        {soloLectura ? (
                          <span className="text-fg">
                            {it.cantidad_contada != null ? formatQty(it.cantidad_contada) : "—"}
                          </span>
                        ) : (
                          <Input
                            value={valores[it.id] ?? ""}
                            onChange={(e) =>
                              setValores((v) => ({ ...v, [it.id]: e.target.value }))
                            }
                            type="number"
                            step="any"
                            min="0"
                            className="w-24 py-1 text-right text-xs"
                          />
                        )}
                      </td>
                      {verEsperado && (
                        <td
                          className={
                            varianza && varianza !== 0
                              ? "px-3 py-2 text-right font-semibold text-red-600 dark:text-red-400"
                              : "px-3 py-2 text-right text-faint"
                          }
                        >
                          {varianza != null ? formatQty(varianza) : "—"}
                        </td>
                      )}
                      {!soloLectura && (
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => guardarItem(it.id)}
                            disabled={guardando === it.id}
                            aria-label="Guardar cantidad contada"
                            className="cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-accent disabled:opacity-50"
                          >
                            <Save className="h-4 w-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          {esGestor && estado === "abierto" && (
            <Button variant="secondary" onClick={() => accionConteo(cerrarConteo)} disabled={procesando}>
              Cerrar captura
            </Button>
          )}
          {esGestor && (estado === "abierto" || estado === "contado") && (
            <Button variant="danger" onClick={() => accionConteo(cancelarConteo)} disabled={procesando}>
              <Ban className="h-4 w-4" /> Cancelar conteo
            </Button>
          )}
          {esGestor && estado === "contado" && (
            <Button onClick={() => accionConteo(aplicarConteo)} disabled={procesando}>
              <CheckCircle2 className="h-4 w-4" />
              {procesando ? "Aplicando..." : "Aplicar ajustes"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
