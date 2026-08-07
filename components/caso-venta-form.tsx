"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Badge, Button, Input, Label, Select } from "@/components/ui";
import { ResponsableSelect } from "@/components/responsable-select";
import { NOTIF_REFRESH_EVENT } from "@/components/notificaciones-provider";
import { crearCasoVenta } from "@/lib/actions/ventas";
import { obtenerConvenioClienteVigente } from "@/lib/actions/convenios-clientes";
import { formatMoney, formatQty } from "@/lib/utils";
import type { UsuarioAsignable } from "@/lib/actions/usuarios";
import type { Cliente, ConvenioCliente } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

type MaterialOpcion = {
  id: string;
  nombre: string;
  sku: string | null;
  unidad: string;
  stock_actual: number;
};

type Fila = { material_id: string; cantidad: string };

export function CasoVentaForm({
  open,
  onClose,
  clientes,
  materiales,
  usuarios,
}: {
  open: boolean;
  onClose: () => void;
  clientes: Cliente[];
  materiales: MaterialOpcion[];
  usuarios: UsuarioAsignable[];
}) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState("");
  const [filas, setFilas] = useState<Fila[]>([{ material_id: "", cantidad: "" }]);
  const [responsableId, setResponsableId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  // Convenio vigente por fila (índice → convenio o null), alimentado por
  // FilaMaterial más abajo — usado por "Calcular con convenios".
  const [conveniosPorFila, setConveniosPorFila] = useState<
    Record<number, ConvenioCliente | null>
  >({});
  const montoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setClienteId("");
      setFilas([{ material_id: "", cantidad: "" }]);
      setResponsableId("");
      setConveniosPorFila({});
      setError(null);
    }
  }, [open]);

  // Suma precio_pactado × cantidad de las filas con convenio vigente; las
  // filas sin convenio quedan fuera de la suma (el usuario ajusta a mano).
  function calcularConConvenios() {
    const total = filas.reduce((sum, fila, i) => {
      const convenio = conveniosPorFila[i];
      const cantidad = Number(fila.cantidad);
      if (!convenio || !Number.isFinite(cantidad) || cantidad <= 0) return sum;
      return sum + convenio.precio_pactado * cantidad;
    }, 0);
    if (montoRef.current) montoRef.current.value = total.toFixed(2);
  }

  const hayAlgunConvenio = Object.values(conveniosPorFila).some((c) => c);

  function setFila(i: number, cambio: Partial<Fila>) {
    setFilas((prev) =>
      prev.map((f, idx) => (idx === i ? { ...f, ...cambio } : f))
    );
  }

  async function onSubmit(formData: FormData) {
    setError(null);
    const items = filas
      .filter((f) => f.material_id)
      .map((f) => ({ material_id: f.material_id, cantidad: Number(f.cantidad) }));
    if (items.length === 0) {
      setError("Agrega al menos un material");
      return;
    }
    setCargando(true);
    formData.set("items", JSON.stringify(items));
    formData.set("responsable_id", responsableId);
    const res = await crearCasoVenta(formData);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (responsableId) window.dispatchEvent(new Event(NOTIF_REFRESH_EVENT));
    router.refresh();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo caso de venta">
      <form action={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="cv-cliente">Cliente</Label>
          <Select
            id="cv-cliente"
            name="cliente_id"
            required
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
          >
            <option value="">— Selecciona —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor="cv-titulo">Título</Label>
          <Input
            id="cv-titulo"
            name="titulo"
            placeholder="Cancelería oficina norte"
            required
          />
        </div>

        <div>
          <Label htmlFor="cv-descripcion">Descripción</Label>
          <Input id="cv-descripcion" name="descripcion" placeholder="Opcional" />
        </div>

        <div>
          <Label htmlFor="cv-responsable">Responsable (opcional)</Label>
          <ResponsableSelect
            usuarios={usuarios}
            value={responsableId}
            onChange={setResponsableId}
            ariaLabel="Responsable del caso"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="cv-monto">Monto (MXN)</Label>
            <Input
              id="cv-monto"
              name="monto"
              type="number"
              step="any"
              min="0"
              placeholder="0.00"
              ref={montoRef}
              defaultValue=""
            />
          </div>
          <div>
            <Label htmlFor="cv-referencia">Referencia</Label>
            <Input
              id="cv-referencia"
              name="referencia"
              placeholder="OV-3005 (auto)"
            />
          </div>
        </div>

        <div>
          <Label>Materiales requeridos</Label>
          <div className="space-y-2">
            {filas.map((fila, i) => (
              <FilaMaterial
                key={i}
                fila={fila}
                index={i}
                materiales={materiales}
                clienteId={clienteId}
                onCambiar={(cambio) => setFila(i, cambio)}
                onConvenio={(convenio) =>
                  setConveniosPorFila((prev) => ({ ...prev, [i]: convenio }))
                }
                onQuitar={() => setFilas((prev) => prev.filter((_, idx) => idx !== i))}
                puedeQuitar={filas.length > 1}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setFilas((prev) => [...prev, { material_id: "", cantidad: "" }])
              }
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              <Plus className="h-4 w-4" /> Agregar material
            </button>
            {hayAlgunConvenio && (
              <button
                type="button"
                onClick={calcularConConvenios}
                className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-accent hover:underline"
              >
                Calcular con convenios
              </button>
            )}
          </div>
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
            {cargando ? "Guardando..." : "Crear caso"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Una fila propia (en vez de inline en el .map de arriba) porque necesita
// su propio efecto para consultar el convenio vigente cliente+material sin
// violar las reglas de hooks dentro de un .map.
function FilaMaterial({
  fila,
  index,
  materiales,
  clienteId,
  onCambiar,
  onConvenio,
  onQuitar,
  puedeQuitar,
}: {
  fila: Fila;
  index: number;
  materiales: MaterialOpcion[];
  clienteId: string;
  onCambiar: (cambio: Partial<Fila>) => void;
  onConvenio: (convenio: ConvenioCliente | null) => void;
  onQuitar: () => void;
  puedeQuitar: boolean;
}) {
  const [convenio, setConvenio] = useState<ConvenioCliente | null>(null);
  const sel = materiales.find((m) => m.id === fila.material_id);

  useEffect(() => {
    if (!clienteId || !fila.material_id) {
      setConvenio(null);
      onConvenio(null);
      return;
    }
    let cancelado = false;
    obtenerConvenioClienteVigente(fila.material_id, clienteId).then((c) => {
      if (!cancelado) {
        setConvenio(c);
        onConvenio(c);
      }
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, fila.material_id]);

  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <Select
          value={fila.material_id}
          onChange={(e) => onCambiar({ material_id: e.target.value })}
          aria-label={`Material ${index + 1}`}
        >
          <option value="">— Material —</option>
          {materiales.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
              {m.sku ? ` (${m.sku})` : ""}
            </option>
          ))}
        </Select>
        {sel && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-faint">
            Stock: {formatQty(sel.stock_actual, sel.unidad)}
            {Number(fila.cantidad) > sel.stock_actual && (
              <Badge tone="danger">Stock insuficiente</Badge>
            )}
          </p>
        )}
        {convenio && (
          <p className="mt-0.5 text-xs text-accent">
            Convenio: {formatMoney(convenio.precio_pactado)}/unidad
          </p>
        )}
      </div>
      <Input
        type="number"
        step="any"
        min="0"
        placeholder="Cant."
        className="w-24"
        value={fila.cantidad}
        onChange={(e) => onCambiar({ cantidad: e.target.value })}
        aria-label={`Cantidad ${index + 1}`}
      />
      <button
        type="button"
        onClick={onQuitar}
        disabled={!puedeQuitar}
        aria-label="Quitar material"
        className="mt-2 cursor-pointer rounded-lg p-1.5 text-faint transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-red-400"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
