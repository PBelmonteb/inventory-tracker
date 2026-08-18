"use client";

// Cualquier usuario logueado cambia su propia contraseña. No usa
// service_role ni toca RLS -- solo el cliente de sesión del navegador
// (supabase.auth.updateUser). Pide la contraseña actual y la reconfirma
// con signInWithPassword antes de dejar cambiarla: sin eso, alguien con
// la sesión abierta (computadora sin bloquear) podría tomar la cuenta sin
// saber la contraseña real -- updateUser() por sí solo no la pide.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/modal";
import { Button, Input, Label } from "@/components/ui";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";

export function CambiarPasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [verActual, setVerActual] = useState(false);
  const [verNueva, setVerNueva] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [exito, setExito] = useState(false);

  function cerrar() {
    setActual("");
    setNueva("");
    setConfirmar("");
    setError(null);
    setExito(false);
    onClose();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (nueva.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (nueva !== confirmar) {
      setError("Las contraseñas nuevas no coinciden");
      return;
    }
    if (nueva === actual) {
      setError("La nueva contraseña debe ser distinta a la actual");
      return;
    }

    setCargando(true);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setCargando(false);
      setError("No se pudo verificar tu sesión. Vuelve a iniciar sesión e intenta de nuevo.");
      return;
    }

    // Confirma la contraseña actual re-autenticando -- ver nota arriba.
    const { error: errVerif } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: actual,
    });
    if (errVerif) {
      setCargando(false);
      setError("La contraseña actual no es correcta.");
      return;
    }

    const { error: errUpdate } = await supabase.auth.updateUser({ password: nueva });
    setCargando(false);
    if (errUpdate) {
      setError(errUpdate.message || "No se pudo cambiar la contraseña.");
      return;
    }
    setExito(true);
  }

  return (
    <Modal open={open} onClose={cerrar} title="Cambiar contraseña">
      {exito ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-emerald-700 dark:text-emerald-400">
              Contraseña actualizada. La usarás la próxima vez que inicies sesión.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={cerrar}>Cerrar</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="pw-actual">Contraseña actual</Label>
            <div className="relative">
              <Input
                id="pw-actual"
                type={verActual ? "text" : "password"}
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setVerActual((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-muted transition-colors hover:text-fg"
                aria-label={verActual ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {verActual ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="pw-nueva">Contraseña nueva</Label>
            <div className="relative">
              <Input
                id="pw-nueva"
                type={verNueva ? "text" : "password"}
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                minLength={6}
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setVerNueva((v) => !v)}
                className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-muted transition-colors hover:text-fg"
                aria-label={verNueva ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {verNueva ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-faint">Mínimo 6 caracteres.</p>
          </div>

          <div>
            <Label htmlFor="pw-confirmar">Confirmar contraseña nueva</Label>
            <Input
              id="pw-confirmar"
              type={verNueva ? "text" : "password"}
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={cerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={cargando}>
              {cargando ? "Guardando..." : "Cambiar contraseña"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
