"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { Modal } from "@/components/modal";
import {
  actualizarConvenio,
  crearConvenio,
  desactivarConvenio,
} from "@/lib/actions/convenios";
import { esConvenioVigente } from "@/lib/convenios";
import { formatMoney, formatQty } from "@/lib/utils";
import type { ConvenioConRelaciones, Proveedor } from "@/lib/types";
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
  c: ConvenioConRelaciones
): { label: string; tone: "ok" | "warn" | "danger" | "neutral" } {
  if (!c.activo) return { label: "Desactivado", tone: "neutral" };
  if (!esConvenioVigente(c)) return { label: "Vencido", tone: "warn" };
  return { label: "Vigente", tone: "ok" };
}

export function ConveniosView({
  convenios,
  proveedores,
  materiales,
}: {
  convenios: ConvenioConRelaciones[];
  proveedores: Proveedor[];
  materiales: MaterialOpcion[];
}) {
  const router = useRouter();
  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<ConvenioConRelaciones | null>(null);
  const [filtroProveedor, setFiltroProveedor] = useState("");

  const conveniosFiltrados = convenios.filter(
    (c) => !filtroProveedor || c.proveedor_id === filtroProveedor
  );

  function abrirNuevo() {
    setEditando(null);
    setFormAbierto(true);
  }

  function abrirEditar(c: ConvenioConRelaciones) {
    setEditando(c);
    setFormAbierto(true);
  }

  async function desactivar(id: string) {
    if (!confirm("¿Desactivar este convenio? Ya no se usará para pre-llenar casos de compra.")) return;
    const res = await desactivarConvenio(id);
    if (!res.ok) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
            Convenios con proveedores
          </h1>
          <p className="mt-1 text-sm text-muted">
            Precio pactado y condiciones por proveedor + material — se usan
            para pre-llenar casos de compra (manual, cotización y reposición
            automática).
          </p>
        </div>
        <Button onClick={abrirNuevo}>
          <Plus className="h-4 w-4" /> Nuevo convenio
        </Button>
      </div>

      <div className="mb-4 flex justify-end">
        <Select
          value={filtroProveedor}
          onChange={(e) => setFiltroProveedor(e.target.value)}
          className="w-auto py-1.5 text-xs"
          aria-label="Filtrar por proveedor"
        >
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
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
                      {c.proveedores?.nombre ?? "Proveedor eliminado"} ·{" "}
                      {formatMoney(c.precio_pactado)}/unidad
                      {c.cantidad_minima
                        ? ` · mínimo ${formatQty(c.cantidad_minima, c.materiales?.unidad)}`
                        : ""}
                      {c.dias_entrega_pactado
                        ? ` · entrega ~${c.dias_entrega_pactado} días`
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

      <ConvenioForm
        open={formAbierto}
        onClose={() => setFormAbierto(false)}
        proveedores={proveedores}
        materiales={materiales}
        editando={editando}
      />
    </div>
  );
}

function ConvenioForm({
  open,
  onClose,
  proveedores,
  materiales,
  editando,
}: {
  open: boolean;
  onClose: () => void;
  proveedores: Proveedor[];
  materiales: MaterialOpcion[];
  editando: ConvenioConRelaciones | null;
}) {
  const router = useRouter();
  const [proveedorId, setProveedorId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (open) {
      setProveedorId(editando?.proveedor_id ?? "");
      setMaterialId(editando?.material_id ?? "");
      setError(null);
    }
  }, [open, editando]);

  async function onSubmit(formData: FormData) {
    setError(null);
    setCargando(true);
    formData.set("proveedor_id", proveedorId);
    formData.set("material_id", materialId);
    const res = editando
      ? await actualizarConvenio(editando.id, formData)
      : await crearConvenio(formData);
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
          <Label htmlFor="cv-proveedor">Proveedor</Label>
          <Select
            id="cv-proveedor"
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
        </div>

        <div>
          <Label htmlFor="cv-material">Material</Label>
          <Select
            id="cv-material"
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
          <Label htmlFor="cv-precio">Precio pactado (MXN/unidad)</Label>
          <Input
            id="cv-precio"
            name="precio_pactado"
            type="number"
            step="any"
            min="0.01"
            defaultValue={editando?.precio_pactado ?? ""}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="cv-cantidad">Cantidad mínima (opcional)</Label>
            <Input
              id="cv-cantidad"
              name="cantidad_minima"
              type="number"
              step="any"
              min="0"
              defaultValue={editando?.cantidad_minima ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="cv-dias">Días de entrega (opcional)</Label>
            <Input
              id="cv-dias"
              name="dias_entrega_pactado"
              type="number"
              step="any"
              min="0"
              defaultValue={editando?.dias_entrega_pactado ?? ""}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="cv-condiciones">Condiciones de pago (opcional)</Label>
          <Input
            id="cv-condiciones"
            name="condiciones_pago"
            placeholder="30 días fecha factura"
            defaultValue={editando?.condiciones_pago ?? ""}
          />
        </div>

        <div>
          <Label htmlFor="cv-vigencia">Vigente hasta (opcional)</Label>
          <Input
            id="cv-vigencia"
            name="vigencia_hasta"
            type="date"
            defaultValue={editando?.vigencia_hasta ?? ""}
          />
        </div>

        <div>
          <Label htmlFor="cv-notas">Notas (opcional)</Label>
          <Input id="cv-notas" name="notas" defaultValue={editando?.notas ?? ""} />
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
