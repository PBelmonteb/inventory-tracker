"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label } from "@/components/ui";
import {
  autorizarCasoCompra,
  obtenerContactoProveedor,
  rechazarCasoCompra,
} from "@/lib/actions/autorizacion";
import { construirCorreoOrdenAutorizada } from "@/lib/plantillas-correo";
import { formatDate } from "@/lib/utils";
import type { CasoCompraConRelaciones } from "@/lib/types";
import { CheckCircle2, XCircle } from "lucide-react";

// Revisión del gestor para un caso "por_autorizar": ya viene con las
// especificaciones del operario, aquí solo se confirman (o se ajustan) antes
// de autorizar. Rechazar pide un motivo opcional y manda el caso a
// "Rechazados", desde donde se puede editar y reenviar.
export function AutorizarCasoForm({
  caso,
  esAdmin,
  umbralAdmin,
  onClose,
}: {
  caso: CasoCompraConRelaciones | null;
  // Defensa en profundidad: proveedores-view.tsx ya no debería dejar a un
  // gerente llegar aquí para un caso arriba del umbral, pero por si acaso
  // el botón "Autorizar" se deshabilita igual (ver lib/actions/autorizacion.ts).
  esAdmin: boolean;
  umbralAdmin: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [cantidad, setCantidad] = useState("");
  const [monto, setMonto] = useState("");
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  // Vista previa editable del correo que se manda al autorizar (solo si el
  // proveedor tiene contacto registrado -- si no, autorizarCasoCompra ni
  // intenta mandar nada, igual que antes). "tocado" evita que se le pise
  // encima al gestor lo que ya editó a mano cada vez que ajusta cantidad/monto.
  const [proveedorEmail, setProveedorEmail] = useState<string | null>(null);
  const [asuntoCorreo, setAsuntoCorreo] = useState("");
  const [cuerpoCorreo, setCuerpoCorreo] = useState("");
  const [correoTocado, setCorreoTocado] = useState(false);

  const montoNumActual = Number(monto) || 0;
  const bloqueadoPorUmbral = !esAdmin && montoNumActual > umbralAdmin;

  useEffect(() => {
    setCantidad(caso?.cantidad_estimada != null ? String(caso.cantidad_estimada) : "");
    setMonto(caso ? String(caso.monto_estimado) : "");
    setRechazando(false);
    setMotivo("");
    setError(null);
    setCorreoTocado(false);
    setProveedorEmail(null);
    if (caso?.proveedor_id) {
      obtenerContactoProveedor(caso.proveedor_id).then(setProveedorEmail);
    }
  }, [caso?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recalcula la vista previa mientras el gestor no la haya editado a mano
  // -- así siempre refleja la cantidad/monto que acaba de capturar arriba.
  useEffect(() => {
    if (!caso || correoTocado) return;
    const cantidadNum = Number(cantidad) || 0;
    const montoNum = Number(monto) || 0;
    const correo = construirCorreoOrdenAutorizada({
      material: {
        nombre: caso.materiales?.nombre ?? caso.titulo,
        sku: caso.materiales?.sku ?? null,
        unidad: caso.materiales?.unidad ?? "",
      },
      proveedorNombre: caso.proveedores?.nombre ?? caso.proveedor_nombre ?? null,
      cantidad: cantidadNum,
      precioUnitario: cantidadNum > 0 ? montoNum / cantidadNum : 0,
      referencia: caso.referencia ?? `OC-${Date.now().toString().slice(-6)}`,
    });
    setAsuntoCorreo(correo.asunto);
    setCuerpoCorreo(correo.cuerpo);
  }, [caso, cantidad, monto, correoTocado]);

  async function autorizar() {
    if (!caso) return;
    const cantidadNum = Number(cantidad);
    const montoNum = Number(monto);
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
      setError("La cantidad debe ser mayor a cero");
      return;
    }
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      setError("Captura el monto del pedido — el operario no lo captura, te toca a ti.");
      return;
    }
    setError(null);
    setCargando(true);
    const res = await autorizarCasoCompra(
      caso.id,
      cantidadNum,
      montoNum,
      proveedorEmail ? { asunto: asuntoCorreo, cuerpo: cuerpoCorreo } : null
    );
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
    const res = await rechazarCasoCompra(caso.id, motivo);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal open={!!caso} onClose={onClose} title="Revisar caso de compra">
      {caso && (
        <div className="space-y-3">
          <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 text-sm">
            <p className="font-medium text-fg">{caso.materiales?.nombre ?? caso.titulo}</p>
            <p className="mt-0.5 text-xs text-muted">
              {caso.proveedores?.nombre ?? caso.proveedor_nombre ?? "Proveedor eliminado"}
              {caso.referencia ? ` · ${caso.referencia}` : ""}
            </p>
            <p className="mt-1 text-xs text-faint">
              {caso.creado_por_nombre
                ? `Creado por ${caso.creado_por_nombre}`
                : "Creado automáticamente"}{" "}
              · {formatDate(caso.created_at)}
            </p>
          </div>

          {!rechazando ? (
            <>
              <div>
                <Label htmlFor="ac-cantidad">Cantidad</Label>
                <Input
                  id="ac-cantidad"
                  type="number"
                  step="any"
                  min="0"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ac-monto">Monto estimado (MXN)</Label>
                <Input
                  id="ac-monto"
                  type="number"
                  step="any"
                  min="0"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
              </div>

              {proveedorEmail && (
                <div className="space-y-2 rounded-lg border border-line p-3">
                  <p className="text-xs font-medium text-fg">
                    Correo que se manda a {proveedorEmail} al autorizar
                  </p>
                  <div>
                    <Label htmlFor="ac-correo-asunto">Asunto</Label>
                    <Input
                      id="ac-correo-asunto"
                      value={asuntoCorreo}
                      onChange={(e) => {
                        setAsuntoCorreo(e.target.value);
                        setCorreoTocado(true);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="ac-correo-cuerpo">Mensaje</Label>
                    <textarea
                      id="ac-correo-cuerpo"
                      value={cuerpoCorreo}
                      onChange={(e) => {
                        setCuerpoCorreo(e.target.value);
                        setCorreoTocado(true);
                      }}
                      rows={8}
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
                    />
                  </div>
                  {correoTocado && (
                    <button
                      type="button"
                      className="cursor-pointer text-xs text-accent hover:underline"
                      onClick={() => setCorreoTocado(false)}
                    >
                      Regenerar con la cantidad/monto actuales
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div>
              <Label htmlFor="ac-motivo">Motivo del rechazo (opcional)</Label>
              <textarea
                id="ac-motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ej. falta ajustar la cantidad, revisar con otro proveedor..."
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
          )}

          {!rechazando && bloqueadoPorUmbral && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              Este caso supera el umbral de autorización — solo un
              administrador puede autorizarlo.
            </p>
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
                <Button type="button" onClick={autorizar} disabled={cargando || bloqueadoPorUmbral}>
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
