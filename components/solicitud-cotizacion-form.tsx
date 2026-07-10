"use client";

// Compone una solicitud de cotización al proveedor del material:
// abre el cliente de correo del usuario (mailto:) con el mensaje pre-redactado
// y registra el caso de compra en estado "cotizando".

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label } from "@/components/ui";
import { solicitarCotizacion } from "@/lib/actions/compras";
import { formatQty } from "@/lib/utils";
import type { MaterialConRelaciones } from "@/lib/types";
import { CheckCircle2, Mail, TriangleAlert } from "lucide-react";

export function SolicitudCotizacionForm({
  open,
  onClose,
  material,
  proveedorNombre,
  proveedorEmail,
}: {
  open: boolean;
  onClose: () => void;
  material: MaterialConRelaciones;
  proveedorNombre: string | null;
  proveedorEmail: string | null;
}) {
  const router = useRouter();
  const bajo = material.stock_actual <= material.stock_minimo;
  // Sugerencia: reabastecer hasta 2× el mínimo.
  const cantidadSugerida = Math.max(
    material.stock_minimo * 2 - material.stock_actual,
    material.stock_minimo
  );

  const asuntoInicial = `Solicitud de cotización — ${material.nombre}${
    material.sku ? ` (${material.sku})` : ""
  }`;
  const cuerpoInicial = [
    `Estimados ${proveedorNombre ?? "proveedor"},`,
    "",
    "Solicitamos cotización para el siguiente material:",
    "",
    `• Material: ${material.nombre}`,
    `• SKU: ${material.sku ?? "—"}`,
    `• Cantidad requerida: ${formatQty(cantidadSugerida, material.unidad)}`,
    "",
    "Por favor indíquennos precio unitario, tiempo de entrega y condiciones de pago.",
    "",
    "Quedamos atentos. Saludos.",
  ].join("\n");

  const [asunto, setAsunto] = useState(asuntoInicial);
  const [cuerpo, setCuerpo] = useState(cuerpoInicial);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (open) {
      setAsunto(asuntoInicial);
      setCuerpo(cuerpoInicial);
      setError(null);
      setEnviado(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    fd.set("es_bajo", bajo ? "1" : "0");
    const res = await solicitarCotizacion(fd);
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
                {proveedorEmail
                  ? "Se abrió tu correo con el mensaje listo para enviar. El caso quedó en el pipeline como “Cotizando”."
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
                Solo registrar caso
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
