"use client";

// Cotización de VARIOS materiales al MISMO proveedor en un solo correo
// (opción B de "multi-producto", ver memoria covalsa-tour-prep). Entrada
// separada de CasoCompraForm a propósito — ese formulario compara VARIOS
// proveedores para UN material; este es el eje contrario (un proveedor,
// varios materiales), y por debajo sigue creando un caso_compra normal por
// cada uno (lib/actions/compras.ts: solicitarCotizacionMultiProducto).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Button, Input, Label, Select } from "@/components/ui";
import { ResponsableSelect } from "@/components/responsable-select";
import { solicitarCotizacionMultiProducto } from "@/lib/actions/compras";
import { construirCorreoCotizacionMultiProducto } from "@/lib/plantillas-correo";
import type { UsuarioAsignable } from "@/lib/actions/usuarios";
import type { MaterialConRelaciones, Proveedor } from "@/lib/types";
import { Mail, Plus, Trash2, TriangleAlert } from "lucide-react";

type Linea = { material_id: string; cantidad: string };

const LINEA_VACIA: Linea = { material_id: "", cantidad: "" };

export function CasoCompraMultiProductoForm({
  open,
  onClose,
  proveedores,
  materiales,
  usuarios,
}: {
  open: boolean;
  onClose: () => void;
  proveedores: Proveedor[];
  materiales: MaterialConRelaciones[];
  usuarios: UsuarioAsignable[];
}) {
  const router = useRouter();
  const [proveedorId, setProveedorId] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([LINEA_VACIA, LINEA_VACIA]);
  const [responsableId, setResponsableId] = useState("");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [editadoAMano, setEditadoAMano] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [cargando, setCargando] = useState(false);

  const proveedor = proveedores.find((p) => p.id === proveedorId) ?? null;

  useEffect(() => {
    if (open) {
      setProveedorId("");
      setLineas([LINEA_VACIA, LINEA_VACIA]);
      setResponsableId("");
      setAsunto("");
      setCuerpo("");
      setEditadoAMano(false);
      setError(null);
      setEnviado(false);
    }
  }, [open]);

  // Regenera el correo mientras el usuario no lo haya tocado a mano —
  // mismo criterio que SolicitudCotizacionForm.
  useEffect(() => {
    if (editadoAMano) return;
    const items = lineas
      .filter((l) => l.material_id && Number(l.cantidad) > 0)
      .map((l) => {
        const m = materiales.find((x) => x.id === l.material_id)!;
        return { nombre: m.nombre, sku: m.sku, unidad: m.unidad, cantidad: Number(l.cantidad) };
      });
    if (items.length < 2) {
      setAsunto("");
      setCuerpo("");
      return;
    }
    const correo = construirCorreoCotizacionMultiProducto({
      proveedorNombre: proveedor?.nombre ?? null,
      items,
      referencia: `OC-${Date.now().toString().slice(-6)}`,
    });
    setAsunto(correo.asunto);
    setCuerpo(correo.cuerpo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedorId, JSON.stringify(lineas)]);

  function actualizarLinea(i: number, cambios: Partial<Linea>) {
    setLineas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...cambios } : l)));
  }

  function agregarLinea() {
    setLineas((ls) => [...ls, LINEA_VACIA]);
  }

  function quitarLinea(i: number) {
    setLineas((ls) => (ls.length <= 2 ? ls : ls.filter((_, idx) => idx !== i)));
  }

  const materialesElegidos = new Set(lineas.map((l) => l.material_id).filter(Boolean));
  const itemsValidos = lineas.filter((l) => l.material_id && Number(l.cantidad) > 0);

  async function registrar(abrirCorreo: boolean) {
    setError(null);
    if (!proveedorId) {
      setError("Selecciona un proveedor");
      return;
    }
    if (itemsValidos.length < 2) {
      setError('Agrega al menos dos materiales con cantidad — con uno solo usa "Nuevo caso"');
      return;
    }
    if (!asunto.trim()) {
      setError("El asunto es obligatorio");
      return;
    }

    // El mailto se dispara dentro del gesto del usuario para que el
    // cliente de correo abra de forma confiable.
    if (abrirCorreo && proveedor?.contacto) {
      const mailto = `mailto:${encodeURIComponent(
        proveedor.contacto
      )}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
      const a = document.createElement("a");
      a.href = mailto;
      a.click();
    }

    setCargando(true);
    const fd = new FormData();
    fd.set("proveedor_id", proveedorId);
    fd.set("responsable_id", responsableId);
    fd.set("asunto", asunto);
    fd.set("cuerpo", cuerpo);
    fd.set(
      "items",
      JSON.stringify(
        itemsValidos.map((l) => ({ material_id: l.material_id, cantidad: Number(l.cantidad) }))
      )
    );
    const res = await solicitarCotizacionMultiProducto(fd);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    setEnviado(true);
  }

  return (
    <Modal open={open} onClose={onClose} title="Cotización multi-producto">
      {enviado ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="font-medium text-emerald-700 dark:text-emerald-400">
                Cotización conjunta registrada
              </p>
              <p className="mt-1 text-muted">
                {proveedor?.contacto
                  ? "Se abrió tu correo con el mensaje listo para enviar. "
                  : ""}
                Se creó un caso de compra por cada material, ligados por el mismo código de
                referencia.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Cerrar</Button>
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
          <p className="text-sm text-muted">
            Pide precio de varios materiales al mismo proveedor en un solo correo. Cada material
            queda como su propio caso de compra en el pipeline, ligados por el mismo código.
          </p>

          <div>
            <Label htmlFor="cmp-proveedor">Proveedor</Label>
            <Select
              id="cmp-proveedor"
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              required
            >
              <option value="">— Selecciona —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
            {proveedorId && !proveedor?.contacto && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <TriangleAlert className="h-3.5 w-3.5" />
                Sin correo registrado. Puedes registrar los casos, pero agrégale un contacto al
                proveedor para poder enviar el correo.
              </p>
            )}
          </div>

          <div>
            <Label>Materiales</Label>
            <div className="space-y-2">
              {lineas.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={l.material_id}
                    onChange={(e) => actualizarLinea(i, { material_id: e.target.value })}
                    aria-label={`Material ${i + 1}`}
                    className="w-full cursor-pointer rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
                  >
                    <option value="">— Material —</option>
                    {materiales
                      .filter((m) => m.id === l.material_id || !materialesElegidos.has(m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                          {m.sku ? ` (${m.sku})` : ""}
                        </option>
                      ))}
                  </select>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    placeholder="Cantidad"
                    value={l.cantidad}
                    onChange={(e) => actualizarLinea(i, { cantidad: e.target.value })}
                    aria-label={`Cantidad del material ${i + 1}`}
                    className="w-32 shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => quitarLinea(i)}
                    disabled={lineas.length <= 2}
                    className="shrink-0 rounded-lg p-2 text-faint transition-colors hover:bg-surface-2 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`Quitar material ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={agregarLinea}
              className="mt-2 flex cursor-pointer items-center gap-1 text-sm font-medium text-accent hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar material
            </button>
          </div>

          <div>
            <Label htmlFor="cmp-responsable">Responsable (opcional)</Label>
            <ResponsableSelect
              usuarios={usuarios}
              value={responsableId}
              onChange={setResponsableId}
              ariaLabel="Responsable de la cotización"
            />
          </div>

          {itemsValidos.length >= 2 && (
            <>
              <div>
                <Label htmlFor="cmp-asunto">Asunto</Label>
                <Input
                  id="cmp-asunto"
                  value={asunto}
                  onChange={(e) => {
                    setAsunto(e.target.value);
                    setEditadoAMano(true);
                  }}
                  required
                />
              </div>
              <div>
                <Label htmlFor="cmp-cuerpo">Mensaje</Label>
                <textarea
                  id="cmp-cuerpo"
                  value={cuerpo}
                  onChange={(e) => {
                    setCuerpo(e.target.value);
                    setEditadoAMano(true);
                  }}
                  rows={10}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-faint outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </div>
            </>
          )}

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            {proveedorId && !proveedor?.contacto && (
              <Button
                type="button"
                variant="secondary"
                disabled={cargando || itemsValidos.length < 2}
                onClick={() => registrar(false)}
              >
                Solo registrar casos
              </Button>
            )}
            <Button
              type="submit"
              disabled={cargando || itemsValidos.length < 2 || !proveedor?.contacto}
            >
              <Mail className="h-4 w-4" />
              {cargando ? "Procesando..." : "Abrir correo y registrar"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
