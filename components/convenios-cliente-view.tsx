"use client";

// Mirror de components/convenios-view.tsx del lado de venta — sin
// dias_entrega_pactado/auto_enviar (no aplican a una venta).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { Modal } from "@/components/modal";
import {
  actualizarConvenioCliente,
  crearConvenioCliente,
  desactivarConvenioCliente,
} from "@/lib/actions/convenios-clientes";
import { esConvenioClienteVigente } from "@/lib/convenios-clientes";
import { formatMoney, formatQty } from "@/lib/utils";
import type { Cliente, ConvenioClienteConRelaciones } from "@/lib/types";
import { FileText, Plus } from "lucide-react";

type MaterialOpcion = {
  id: string;
  nombre: string;
  sku: string | null;
  unidad: string;
};

function formatFecha(iso: string | null): string {
  if (!iso) return "Sin vencimiento";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(
    new Date(`${iso}T00:00:00`)
  );
}

function estadoConvenio(
  c: ConvenioClienteConRelaciones
): { label: string; tone: "ok" | "warn" | "danger" | "neutral" } {
  if (!c.activo) return { label: "Desactivado", tone: "neutral" };
  if (!esConvenioClienteVigente(c)) return { label: "Vencido", tone: "warn" };
  return { label: "Vigente", tone: "ok" };
}

export function ConveniosClienteView({
  convenios,
  clientes,
  materiales,
}: {
  convenios: ConvenioClienteConRelaciones[];
  clientes: Cliente[];
  materiales: MaterialOpcion[];
}) {
  const router = useRouter();
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<ConvenioClienteConRelaciones | null>(null);
  const [filtroCliente, setFiltroCliente] = useState("");

  const conveniosFiltrados = convenios.filter(
    (c) => !filtroCliente || c.cliente_id === filtroCliente
  );

  function abrirNuevo() {
    setEditando(null);
    setFormAbierto(true);
  }

  function abrirEditar(c: ConvenioClienteConRelaciones) {
    setEditando(c);
    setFormAbierto(true);
  }

  async function desactivar(id: string) {
    if (!confirm("¿Desactivar este convenio? Ya no se usará para sugerir precio en cotizaciones."))
      return;
    const res = await desactivarConvenioCliente(id);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Sin h1 propio: vive como tab dentro de Clientes (ver
          components/clientes-view.tsx), que ya pone el título. */}
      <div className="mb-6 flex justify-end">
        <Button onClick={abrirNuevo}>
          <Plus className="h-4 w-4" /> Nuevo convenio
        </Button>
      </div>

      <div className="mb-4 flex justify-end">
        <Select
          value={filtroCliente}
          onChange={(e) => setFiltroCliente(e.target.value)}
          className="w-auto py-1.5 text-xs"
          aria-label="Filtrar por cliente"
        >
          <option value="">Todos los clientes</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Select>
      </div>

      <Card className="p-4 md:p-5">
        {conveniosFiltrados.length === 0 ? (
          <p className="flex items-center gap-2 py-6 text-sm text-faint">
            <FileText className="h-4 w-4" /> Sin convenios con esos filtros.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {conveniosFiltrados.map((c) => {
              const estado = estadoConvenio(c);
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-fg">
                      {c.materiales?.nombre ?? "Material eliminado"}
                      <Badge tone={estado.tone}>{estado.label}</Badge>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {c.clientes?.nombre ?? "Cliente eliminado"} ·{" "}
                      {formatMoney(c.precio_pactado)}/unidad
                      {c.cantidad_minima
                        ? ` · mínimo ${formatQty(c.cantidad_minima, c.materiales?.unidad)}`
                        : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-faint">
                      {c.condiciones_pago && <>{c.condiciones_pago} · </>}
                      Vence: {formatFecha(c.vigencia_hasta)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => abrirEditar(c)}
                    >
                      Editar
                    </Button>
                    {c.activo && (
                      <Button
                        variant="ghost"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => desactivar(c.id)}
                      >
                        Desactivar
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ConvenioClienteForm
        open={formAbierto}
        onClose={() => setFormAbierto(false)}
        clientes={clientes}
        materiales={materiales}
        editando={editando}
      />
    </div>
  );
}

function ConvenioClienteForm({
  open,
  onClose,
  clientes,
  materiales,
  editando,
}: {
  open: boolean;
  onClose: () => void;
  clientes: Cliente[];
  materiales: MaterialOpcion[];
  editando: ConvenioClienteConRelaciones | null;
}) {
  const router = useRouter();
  const [clienteId, setClienteId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (open) {
      setClienteId(editando?.cliente_id ?? "");
      setMaterialId(editando?.material_id ?? "");
      setError(null);
    }
  }, [open, editando]);

  async function onSubmit(formData: FormData) {
    setError(null);
    setCargando(true);
    formData.set("cliente_id", clienteId);
    formData.set("material_id", materialId);
    const res = editando
      ? await actualizarConvenioCliente(editando.id, formData)
      : await crearConvenioCliente(formData);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editando ? "Editar convenio" : "Nuevo convenio"}
    >
      <form action={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="cvc-cliente">Cliente</Label>
          <Select
            id="cvc-cliente"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            required
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
          <Label htmlFor="cvc-material">Material</Label>
          <Select
            id="cvc-material"
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

        <div>
          <Label htmlFor="cvc-precio">Precio pactado (MXN/unidad)</Label>
          <Input
            id="cvc-precio"
            name="precio_pactado"
            type="number"
            step="any"
            min="0.01"
            defaultValue={editando?.precio_pactado ?? ""}
            required
          />
        </div>

        <div>
          <Label htmlFor="cvc-cantidad">Cantidad mínima (opcional)</Label>
          <Input
            id="cvc-cantidad"
            name="cantidad_minima"
            type="number"
            step="any"
            min="0"
            defaultValue={editando?.cantidad_minima ?? ""}
          />
        </div>

        <div>
          <Label htmlFor="cvc-condiciones">Condiciones de pago (opcional)</Label>
          <Input
            id="cvc-condiciones"
            name="condiciones_pago"
            placeholder="30 días fecha factura"
            defaultValue={editando?.condiciones_pago ?? ""}
          />
        </div>

        <div>
          <Label htmlFor="cvc-vigencia">Vigente hasta (opcional)</Label>
          <Input
            id="cvc-vigencia"
            name="vigencia_hasta"
            type="date"
            defaultValue={editando?.vigencia_hasta ?? ""}
          />
        </div>

        <div>
          <Label htmlFor="cvc-notas">Notas (opcional)</Label>
          <Input id="cvc-notas" name="notas" defaultValue={editando?.notas ?? ""} />
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
            {cargando ? "Guardando..." : editando ? "Guardar cambios" : "Crear convenio"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
