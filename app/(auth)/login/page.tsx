"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { mensajeSupabase } from "@/lib/supabase/errors";
import { Button, Card, Input, Label } from "@/components/ui";
import { Boxes, Eye, EyeOff } from "lucide-react";

// Sin auto-registro: las cuentas las da de alta un gestor desde /usuarios.
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const supabase = createClient();
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      // Navegación completa (no router.push) para que la cookie de sesión
      // recién escrita llegue de una vez al servidor — con router.push, la
      // caché de navegación de Next puede reusar el árbol ya renderizado
      // (sin sesión) que se prefetcheó antes de iniciar sesión.
      window.location.href = "/inventario";
    } catch (err) {
      setError(
        err instanceof Error ? mensajeSupabase(err) : "Ocurrió un error"
      );
    } finally {
      setCargando(false);
    }
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
          <p className="text-sm text-muted">Control en tiempo real</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
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
            {cargando ? "Procesando..." : "Iniciar sesión"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-faint">
          ¿Necesitas una cuenta? Pídele a tu gestor que te dé de alta.
        </p>
      </Card>
    </div>
  );
}
