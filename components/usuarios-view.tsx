"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Label, Select } from "@/components/ui";
import { Modal } from "@/components/modal";
import { BotonExportarCSV } from "@/components/boton-exportar-csv";
import {
  cambiarEstadoUsuario,
  cambiarRolUsuario,
  crearUsuario,
  type UsuarioListado,
} from "@/lib/actions/usuarios";
import { formatDate } from "@/lib/utils";
import type { Rol } from "@/lib/types";
import { Eye, EyeOff, Plus, UserCog, Wand2 } from "lucide-react";

const ROL_LABEL: Record<Rol, string> = {
  admin: "Admin",
  gerente: "Gerente",
  operario: "Operario",
};

// Sin caracteres ambiguos (I/l/O/0/1) — esta contraseña se comparte a mano
// (verbalmente o por chat) con el empleado, no debe prestarse a confusión.
const ALFABETO_PASSWORD =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";

function generarPasswordSegura(longitud = 12): string {
  const bytes = new Uint32Array(longitud);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => ALFABETO_PASSWORD[n % ALFABETO_PASSWORD.length]).join(
    ""
  );
}

export function UsuariosView({
  usuarios,
  errorInicial,
  miId,
}: {
  usuarios: UsuarioListado[];
  errorInicial: string | null;
  miId: string;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [errorFila, setErrorFila] = useState<Record<string, string>>({});

  async function onCambiarRol(id: string, rol: Rol) {
    setCambiando(id);
    setErrorFila((e) => ({ ...e, [id]: "" }));
    const res = await cambiarRolUsuario(id, rol);
    setCambiando(null);
    if (!res.ok) {
      setErrorFila((e) => ({ ...e, [id]: res.error }));
      return;
    }
    router.refresh();
  }

  async function onCambiarEstado(id: string, nombre: string, activo: boolean) {
    if (
      !activo &&
      !window.confirm(
        `¿Desactivar a ${nombre}? No podrá iniciar sesión hasta que lo reactives.`
      )
    )
      return;
    setCambiando(id);
    setErrorFila((e) => ({ ...e, [id]: "" }));
    const res = await cambiarEstadoUsuario(id, activo);
    setCambiando(null);
    if (!res.ok) {
      setErrorFila((e) => ({ ...e, [id]: res.error }));
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <UserCog className="h-6 w-6 text-accent" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
              Usuarios
            </h1>
            <p className="mt-1 text-sm text-muted">
              Da de alta empleados y administra sus roles.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <BotonExportarCSV
            filename="usuarios"
            filas={usuarios.map((u) => ({
              Nombre: u.nombre,
              Correo: u.email ?? "",
              Rol: ROL_LABEL[u.rol],
              "Fecha de alta": u.created_at,
            }))}
            label="CSV"
          />
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo usuario
          </Button>
        </div>
      </div>

      {errorInicial && (
        <Card className="mb-4 p-4 text-sm text-red-600 dark:text-red-400">
          {errorInicial}
        </Card>
      )}

      <Card className="overflow-hidden">
        {usuarios.length === 0 && !errorInicial ? (
          <p className="p-10 text-center text-sm text-muted">
            Sin usuarios todavía.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {usuarios.map((u) => {
              const esYo = u.id === miId;
              return (
                <li key={u.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium text-fg">
                        {u.nombre}
                        {esYo && <Badge tone="accent">Tú</Badge>}
                        <Badge tone={u.activo ? "ok" : "danger"}>
                          {u.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </p>
                      <p className="text-xs text-faint">
                        {u.email ?? "—"} · Alta {formatDate(u.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={u.rol}
                        disabled={esYo || cambiando === u.id}
                        onChange={(e) =>
                          onCambiarRol(u.id, e.target.value as Rol)
                        }
                        className="w-auto"
                        aria-label={`Rol de ${u.nombre}`}
                      >
                        {(Object.keys(ROL_LABEL) as Rol[]).map((r) => (
                          <option key={r} value={r}>
                            {ROL_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                      <Button
                        type="button"
                        variant={u.activo ? "danger" : "secondary"}
                        disabled={esYo || cambiando === u.id}
                        onClick={() =>
                          onCambiarEstado(u.id, u.nombre, !u.activo)
                        }
                      >
                        {u.activo ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  </div>
                  {esYo && (
                    <p className="mt-1 text-xs text-faint">
                      No puedes cambiar tu propio rol ni desactivar tu cuenta.
                    </p>
                  )}
                  {errorFila[u.id] && (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {errorFila[u.id]}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <NuevoUsuarioForm open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}

function NuevoUsuarioForm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);

  async function onSubmit(formData: FormData) {
    setError(null);
    setCargando(true);
    const res = await crearUsuario(formData);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPassword("");
    setVerPassword(false);
    router.refresh();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo usuario">
      <form action={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="nombre">Nombre</Label>
          <Input id="nombre" name="nombre" required autoFocus />
        </div>
        <div>
          <Label htmlFor="email">Correo</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div>
          <Label htmlFor="password">Contraseña temporal</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={verPassword ? "text" : "password"}
              minLength={6}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-20"
            />
            <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-1">
              <button
                type="button"
                onClick={() => {
                  setPassword(generarPasswordSegura());
                  setVerPassword(true);
                }}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label="Generar contraseña segura"
                title="Generar contraseña segura"
              >
                <Wand2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setVerPassword((v) => !v)}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {verPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-faint">
            Mínimo 6 caracteres. Compártesela al empleado para que entre y la
            cambie.
          </p>
        </div>
        <div>
          <Label htmlFor="rol">Rol</Label>
          <Select id="rol" name="rol" defaultValue="operario">
            <option value="operario">Operario</option>
            <option value="gerente">Gerente</option>
            <option value="admin">Admin</option>
          </Select>
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
            {cargando ? "Creando..." : "Crear usuario"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
