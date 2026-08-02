"use client";

import { Select } from "@/components/ui";
import type { UsuarioAsignable } from "@/lib/actions/usuarios";

const ROL_LABEL: Record<UsuarioAsignable["rol"], string> = {
  admin: "Admin",
  gerente: "Gerente",
  operario: "Operario",
  compras: "Compras",
};

// Selector de responsable reusado en casos de compra/venta y salidas
// pendientes. value = "" significa "Sin asignar".
export function ResponsableSelect({
  usuarios,
  value,
  onChange,
  className,
  ariaLabel = "Responsable",
  disabled,
}: {
  usuarios: UsuarioAsignable[];
  value: string;
  onChange: (usuarioId: string) => void;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      disabled={disabled}
      className={className}
    >
      <option value="">Sin asignar</option>
      {usuarios.map((u) => (
        <option key={u.id} value={u.id}>
          {u.nombre} ({ROL_LABEL[u.rol]})
        </option>
      ))}
    </Select>
  );
}
