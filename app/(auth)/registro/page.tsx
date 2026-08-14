"use client";

import { useState } from "react";
import Link from "next/link";
import { registrarCuenta } from "@/lib/actions/registro";
import { Button, Card, Input, Label } from "@/components/ui";
import { Boxes, Eye, EyeOff, CheckCircle2 } from "lucide-react";

// Auto-registro: crea la cuenta pero no da acceso todavía -- un gestor la
// tiene que aprobar desde Administración > Usuarios (ver
// lib/actions/registro.ts y app/(app)/layout.tsx).
export default function RegistroPage() {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    const fd = new FormData();
    fd.set("nombre", nombre);
    fd.set("email", email);
    fd.set("password", password);
    const res = await registrarCuenta(fd);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setEnviado(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-sm p-6 shadow-soft">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-fg">
            <Boxes className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">
            Inventario
          </h1>
          <p className="text-sm text-muted">Pedir una cuenta</p>
        </div>

        {enviado ? (
          <div className="space-y-4 text-center">
            <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 px-4 py-3 text-left text-sm">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="font-medium text-emerald-700 dark:text-emerald-400">
                  Solicitud enviada
                </p>
                <p className="mt-1 text-muted">
                  Un gestor tiene que aprobar tu cuenta antes de que puedas
                  entrar. Si tu correo necesita confirmarse, revísalo también.
                </p>
              </div>
            </div>
            <Link
              href="/login"
              className="inline-block text-sm font-medium text-accent hover:underline"
            >
              Ir a iniciar sesión
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Tu nombre completo"
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Correo</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@empresa.com"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={verPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={6}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setVerPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-muted transition-colors hover:text-fg"
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

              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={cargando}>
                {cargando ? "Enviando..." : "Pedir cuenta"}
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-faint">
              Tu cuenta queda pendiente de aprobación de un gestor. ¿Ya
              tienes una?{" "}
              <Link href="/login" className="font-medium text-accent hover:underline">
                Inicia sesión
              </Link>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
