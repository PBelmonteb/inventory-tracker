"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label } from "@/components/ui";
import { autorizarCasoVenta, rechazarCasoVenta } from "@/lib/actions/autorizacion-ventas";
import { obtenerConvenioClienteVigente } from "@/lib/actions/convenios-clientes";
import { formatDate, formatMoney, formatQty } from "@/lib/utils";
import type { CasoVentaConRelaciones } from "@/lib/types";
import { CheckCircle2, XCircle } from "lucide-react";

// Revisión de ventas/gestor para un caso "por_autorizar": ya viene con
// cliente + materiales del operario, aquí se captura el precio por cada
// material antes de autorizar (sin umbral por monto — decisión de
// alcance, ver migración 0043_autorizacion_casos_venta.sql). El monto
// del caso se recalcula solo (migración 0045_precio_linea_venta.sql).
// Rechazar pide un motivo opcional y manda el caso a "Rechazados", desde
// donde se puede editar y reenviar.
export function AutorizarCasoVentaForm({
  caso,
  onClose,
}: {
  caso: CasoVentaConRelaciones | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setRechazando(false);
    setMotivo("");
    setError(null);
    if (!caso) {
      setPrecios({});
      return;
    }
    // Prellena con el precio que ya traiga el item (si se reenvía tras un
    // rechazo previo autorizado a medias, aunque hoy nunca pasa) o con el
    // convenio vigente cliente+material, si hay uno.
    setPrecios(
      Object.fromEntries(
        caso.items.map((i) => [i.id, i.precio_unitario > 0 ? String(i.precio_unitario) : ""])
      )
    );
    if (!caso.cliente_id) return;
    let cancelado = false;
    Promise.all(
      caso.items.map((i) =>
        obtenerConvenioClienteVigente(i.material_id, caso.cliente_id as string).then(
          (c) => [i.id, c] as const
        )
      )
    ).then((resultados) => {
      if (cancelado) return;
      setPrecios((prev) => {
        const next = { ...prev };
        for (const [itemId, convenio] of resultados) {
          if (convenio && !next[itemId]) next[itemId] = String(convenio.precio_pactado);
        }
        return next;
      });
    });
    return () => {
      cancelado = true;
    };
  }, [caso]);

  const total = caso
    ? caso.items.reduce((sum, i) => {
        const precio = Number(precios[i.id]);
        return sum + (Number.isFinite(precio) ? precio * i.cantidad : 0);
      }, 0)
    : 0;

  async function autorizar() {
    if (!caso) return;
    const listaPrecios = caso.items.map((i) => ({
      id: i.id,
      precio_unitario: Number(precios[i.id]),
    }));
    if (listaPrecios.some((p) => !Number.isFinite(p.precio_unitario) || p.precio_unitario <= 0)) {
      setError("Captura el precio de cada material — el operario no lo captura, te toca a ti.");
      return;
    }
    setError(null);
    setCargando(true);
    const res = await autorizarCasoVenta(caso.id, listaPrecios);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  async function rechazar() {
    if (!caso) return;
    setError(null);
    setCargando(true);
    const res = await rechazarCasoVenta(caso.id, motivo);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal open={!!caso} onClose={onClose} title="Revisar cotización">
      {caso && (
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 text-sm">
            <p className="font-medium text-fg">{caso.titulo}</p>
            <p className="mt-0.5 text-xs text-muted">
              {caso.clientes?.nombre ?? caso.cliente_nombre ?? "Cliente eliminado"}
              {caso.referencia ? ` · ${caso.referencia}` : ""}
            </p>
            <p className="mt-1 text-xs text-faint">
              {caso.creado_por_nombre ? `Creado por ${caso.creado_por_nombre}` : "Creado"} ·{" "}
              {formatDate(caso.created_at)}
            </p>
          </div>

          {!rechazando ? (
            <>
              <div className="space-y-2">
                {caso.items.map((i) => (
                  <div key={i.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">
                        {i.materiales?.nombre ?? "Material eliminado"}
                      </p>
                      <p className="text-xs text-faint">
                        {formatQty(i.cantidad, i.materiales?.unidad)}
                      </p>
                    </div>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Precio"
                      className="w-28"
                      value={precios[i.id] ?? ""}
                      onChange={(e) =>
                        setPrecios((prev) => ({ ...prev, [i.id]: e.target.value }))
                      }
                      aria-label={`Precio de ${i.materiales?.nombre ?? "material"}`}
                    />
                  </div>
                ))}
              </div>
              <p className="text-right text-sm font-medium text-fg">
                Total: {formatMoney(total)}
              </p>
            </>
          ) : (
            <div>
              <Label htmlFor="acv-motivo">Motivo del rechazo (opcional)</Label>
              <textarea
                id="acv-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ej. falta ajustar cantidades, confirmar con el cliente..."
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            {rechazando ? (
              <>
                <Button type="button" variant="secondary" onClick={() => setRechazando(false)} disabled={cargando}>
                  Regresar
                </Button>
                <Button type="button" variant="danger" onClick={rechazar} disabled={cargando}>
                  <XCircle className="h-4 w-4" />
                  {cargando ? "Rechazando..." : "Confirmar rechazo"}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="danger" onClick={() => setRechazando(true)} disabled={cargando}>
                  <XCircle className="h-4 w-4" />
                  Rechazar
                </Button>
                <Button type="button" onClick={autorizar} disabled={cargando}>
                  <CheckCircle2 className="h-4 w-4" />
                  {cargando ? "Autorizando..." : "Autorizar"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
