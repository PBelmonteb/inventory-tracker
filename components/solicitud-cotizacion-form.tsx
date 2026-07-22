"use client";

// Compone una solicitud de cotización al proveedor del material:
// abre el cliente de correo del usuario (mailto:) con el mensaje pre-redactado
// y registra el caso de compra en estado "cotizando".

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label } from "@/components/ui";
import { InfoTooltip } from "@/components/info-tooltip";
import {
  enviarCotizacionCasoExistente,
  solicitarCotizacion,
} from "@/lib/actions/compras";
import { obtenerEOQ } from "@/lib/actions/materiales";
import { obtenerConvenioVigente } from "@/lib/actions/convenios";
import {
  construirCorreoCotizacion,
  lineaCantidadCotizacion,
} from "@/lib/plantillas-correo";
import { formatMoney, formatQty } from "@/lib/utils";
import type { Convenio, MaterialConRelaciones } from "@/lib/types";
import type { ResultadoEOQ } from "@/lib/eoq";
import { CheckCircle2, Mail, TriangleAlert } from "lucide-react";

export function SolicitudCotizacionForm({
  open,
  onClose,
  material,
  proveedorNombre,
  proveedorEmail,
  casoExistente,
}: {
  open: boolean;
  onClose: () => void;
  material: MaterialConRelaciones;
  proveedorNombre: string | null;
  proveedorEmail: string | null;
  // Si se abre desde el link del título de un caso ya creado (en vez de
  // desde el detalle del material): en lugar de registrar un caso nuevo,
  // actualiza este mismo (evita duplicarlo). Trae su referencia para
  // reusar el mismo código de correo (no generar uno nuevo a medio hilo).
  casoExistente?: { id: string; referencia?: string | null };
}) {
  const router = useRouter();
  const bajo = material.stock_actual <= material.stock_minimo;
  // Sugerencia: reabastecer hasta 2× el mínimo.
  const cantidadSugerida = Math.max(
    material.stock_minimo * 2 - material.stock_actual,
    material.stock_minimo
  );

  const lineaCantidad = (cantidad: number) =>
    lineaCantidadCotizacion(cantidad, material.unidad);

  // El código viaja en el asunto del correo desde el inicio (no se genera
  // recién al guardar) para que el asunto mostrado y el que se guarda sean
  // el mismo — así una respuesta se liga sola al caso vía
  // matchReferenciaEnAsunto (lib/email-caso.ts). Si ya existe un caso
  // (casoExistente), se reusa su código en vez de inventar uno nuevo.
  function generarReferencia(): string {
    return casoExistente?.referencia ?? `OC-${Date.now().toString().slice(-6)}`;
  }

  const [referencia, setReferencia] = useState(generarReferencia);

  const { asunto: asuntoInicial, cuerpo: cuerpoInicial } = construirCorreoCotizacion({
    material,
    proveedorNombre,
    cantidad: cantidadSugerida,
    referencia,
  });

  const [asunto, setAsunto] = useState(asuntoInicial);
  const [cuerpo, setCuerpo] = useState(cuerpoInicial);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [eoq, setEoq] = useState<ResultadoEOQ | null>(null);
  const [convenio, setConvenio] = useState<Convenio | null>(null);
  // La cantidad solo vive embebida en el texto del correo; se rastrea aparte
  // para poder calcular monto_estimado = precio pactado × cantidad cuando
  // hay convenio, y para que los botones "Usar X" sepan qué línea reemplazar.
  const [cantidadActual, setCantidadActual] = useState(cantidadSugerida);

  useEffect(() => {
    if (open) {
      const ref = generarReferencia();
      const correo = construirCorreoCotizacion({
        material,
        proveedorNombre,
        cantidad: cantidadSugerida,
        referencia: ref,
      });
      setReferencia(ref);
      setAsunto(correo.asunto);
      setCuerpo(correo.cuerpo);
      setCantidadActual(cantidadSugerida);
      setError(null);
      setEnviado(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetch on-demand: la cantidad económica de pedido necesita el historial
  // de salidas del material, que no viene precargado en props.
  useEffect(() => {
    if (!open) {
      setEoq(null);
      return;
    }
    let cancelado = false;
    obtenerEOQ(material.id, material.costo_unitario).then((r) => {
      if (!cancelado) setEoq(r);
    });
    return () => {
      cancelado = true;
    };
  }, [open, material.id, material.costo_unitario]);

  // Fetch on-demand del convenio vigente para este proveedor+material.
  useEffect(() => {
    if (!open || !material.proveedor_id) {
      setConvenio(null);
      return;
    }
    let cancelado = false;
    obtenerConvenioVigente(material.id, material.proveedor_id).then((c) => {
      if (!cancelado) setConvenio(c);
    });
    return () => {
      cancelado = true;
    };
  }, [open, material.id, material.proveedor_id]);

  function cambiarCantidad(nuevaCantidad: number) {
    setCuerpo((c) => c.replace(lineaCantidad(cantidadActual), lineaCantidad(nuevaCantidad)));
    setCantidadActual(nuevaCantidad);
  }

  function usarCantidadEOQ() {
    if (!eoq?.disponible) return;
    cambiarCantidad(Math.ceil(eoq.cantidadEconomica));
  }

  function usarConvenio() {
    if (!convenio) return;
    cambiarCantidad(convenio.cantidad_minima ?? cantidadActual);
  }

  async function registrar(abrirCorreo: boolean) {
    setError(null);
    // El mailto se dispara dentro del gesto del usuario para que el cliente
    // de correo abra de forma confiable.
    if (abrirCorreo && proveedorEmail) {
      const mailto = `mailto:${encodeURIComponent(
        proveedorEmail
      )}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(
        cuerpo
      )}`;
      const a = document.createElement("a");
      a.href = mailto;
      a.click();
    }

    setCargando(true);
    const fd = new FormData();
    fd.set("proveedor_id", material.proveedor_id ?? "");
    fd.set("material_id", material.id);
    fd.set("titulo", asunto);
    fd.set("descripcion", cuerpo.slice(0, 280));
    // Cuerpo completo (sin recortar) para el evento "correo_enviado" del
    // timeline — descripcion sigue recortada, es el resumen del caso.
    fd.set("cuerpo_completo", cuerpo);
    fd.set("es_bajo", bajo ? "1" : "0");
    // Mismo código que ya viaja en el asunto del correo — no dejar que el
    // servidor invente uno distinto (rompería el enlace de respuestas).
    fd.set("referencia", referencia);
    // Sin convenio no hay precio conocido para estimar un monto (igual que
    // antes: 0, editable después desde el caso una vez que llegue la cotización).
    if (convenio)
      fd.set("monto_estimado", String(convenio.precio_pactado * cantidadActual));
    const res = casoExistente
      ? await enviarCotizacionCasoExistente(casoExistente.id, fd)
      : await solicitarCotizacion(fd);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    setEnviado(true);
  }

  const sinProveedor = !material.proveedor_id;

  return (
    <Modal open={open} onClose={onClose} title="Solicitar cotización">
      {enviado ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="font-medium text-emerald-700 dark:text-emerald-400">
                Solicitud registrada
              </p>
              <p className="mt-1 text-muted">
                {proveedorEmail && casoExistente
                  ? "Se abrió tu correo con el mensaje listo para enviar. Se actualizó el caso."
                  : proveedorEmail
                    ? "Se abrió tu correo con el mensaje listo para enviar. El caso quedó en el pipeline como “Cotizando”."
                    : casoExistente
                      ? "Se actualizó el caso."
                      : "El caso quedó en el pipeline como “Cotizando”."}
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      ) : sinProveedor ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 px-4 py-3 text-sm">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-muted">
              Este material no tiene un proveedor asignado. Asígnale uno
              (editando el material) para poder solicitar una cotización.
            </p>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Entendido
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            registrar(true);
          }}
          className="space-y-3"
        >
          <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm">
            <p className="text-muted">
              Para:{" "}
              <span className="font-medium text-fg">
                {proveedorNombre ?? "Proveedor"}
              </span>
            </p>
            {proveedorEmail ? (
              <p className="text-xs text-faint">{proveedorEmail}</p>
            ) : (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <TriangleAlert className="h-3.5 w-3.5" />
                Sin correo registrado. Puedes registrar el caso, pero agrégale
                un contacto al proveedor para enviar el correo.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-line bg-surface-2/40 p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center font-medium text-fg">
                Cantidad económica de pedido (EOQ)
                <InfoTooltip>
                  <p className="mb-1.5 font-semibold text-fg">
                    Cantidad económica de pedido
                  </p>
                  <p>EOQ = √(2 × demanda anual × S / H)</p>
                  <p className="mt-1.5">
                    S = costo de ordenar un pedido (fijo, sin importar cuánto
                    se pida). H = costo de mantener una pieza en inventario
                    un año = costo unitario × tasa de mantenimiento anual.
                  </p>
                  {eoq?.disponible ? (
                    <ul className="mt-2 space-y-0.5 border-t border-line pt-2">
                      <li>
                        Demanda anual estimada:{" "}
                        {formatQty(Math.round(eoq.demandaAnual), material.unidad)}
                      </li>
                      <li>S (costo de ordenar): {formatMoney(eoq.costoOrdenar)}</li>
                      <li>
                        H (tasa de mantenimiento anual):{" "}
                        {(eoq.tasaMantenimientoAnual * 100).toFixed(0)}%
                      </li>
                      <li>
                        Pedidos al año sugeridos:{" "}
                        {eoq.numeroPedidosAlAno.toFixed(1)}
                      </li>
                    </ul>
                  ) : (
                    <p className="mt-2 border-t border-line pt-2 text-faint">
                      S y H son supuestos por defecto (ajustables más
                      adelante desde configuración) — no son datos
                      capturados por el cliente todavía.
                    </p>
                  )}
                </InfoTooltip>
              </span>
              {eoq?.disponible ? (
                <button
                  type="button"
                  onClick={usarCantidadEOQ}
                  className="cursor-pointer font-medium text-accent hover:underline"
                >
                  Usar {formatQty(Math.ceil(eoq.cantidadEconomica), material.unidad)}
                </button>
              ) : (
                <span className="text-faint">No disponible</span>
              )}
            </div>
            {!eoq?.disponible && eoq?.razonNoDisponible && (
              <p className="mt-1 text-faint">{eoq.razonNoDisponible}</p>
            )}
          </div>

          {convenio && (
            <div className="rounded-lg border border-line bg-surface-2/40 p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-fg">Convenio vigente</span>
                <button
                  type="button"
                  onClick={usarConvenio}
                  className="cursor-pointer font-medium text-accent hover:underline"
                >
                  Usar convenio
                </button>
              </div>
              <p className="mt-1 text-muted">
                ${convenio.precio_pactado.toFixed(2)}/unidad
                {convenio.cantidad_minima
                  ? ` · mínimo ${formatQty(convenio.cantidad_minima, material.unidad)}`
                  : ""}
                {convenio.dias_entrega_pactado
                  ? ` · entrega ~${convenio.dias_entrega_pactado} días`
                  : ""}
                {convenio.condiciones_pago ? ` · ${convenio.condiciones_pago}` : ""}
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="cot-asunto">Asunto</Label>
            <Input
              id="cot-asunto"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="cot-cuerpo">Mensaje</Label>
            <textarea
              id="cot-cuerpo"
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              rows={9}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            {!proveedorEmail && (
              <Button
                type="button"
                variant="secondary"
                disabled={cargando}
                onClick={() => registrar(false)}
              >
                {casoExistente ? "Solo actualizar caso" : "Solo registrar caso"}
              </Button>
            )}
            <Button type="submit" disabled={cargando || !proveedorEmail}>
              <Mail className="h-4 w-4" />
              {cargando ? "Procesando..." : "Abrir correo y registrar"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
