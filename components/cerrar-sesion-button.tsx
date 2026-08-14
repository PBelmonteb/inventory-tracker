"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEMO } from "@/lib/config";
import { Button } from "@/components/ui";

// Botón de cerrar sesión reusable fuera de AppShell (ej. /pendiente, donde
// alguien sin cuenta aprobada todavía necesita poder salir).
export function CerrarSesionButton() {
  const [cargando, setCargando] = useState(false);

  async function cerrarSesion() {
    if (DEMO) {
      alert("Modo demo: la autenticación se activa al conectar Supabase.");
      return;
    }
    setCargando(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <Button variant="secondary" className="w-full" onClick={cerrarSesion} disabled={cargando}>
      {cargando ? "Saliendo..." : "Cerrar sesión"}
    </Button>
  );
}
