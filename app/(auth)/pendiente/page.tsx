import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { CerrarSesionButton } from "@/components/cerrar-sesion-button";
import { Card } from "@/components/ui";
import { Clock3, XCircle } from "lucide-react";

// A donde cae cualquiera cuya cuenta no está "aprobada" (ver
// app/(app)/layout.tsx) -- ya sea porque se acaba de auto-registrar y
// espera revisión, o porque un gestor la rechazó.
export default async function PendientePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.estado_cuenta === "aprobada") redirect("/inicio");

  const rechazada = profile.estado_cuenta === "rechazada";

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <Card className="w-full max-w-sm p-6 text-center shadow-soft">
        <div
          className={
            "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl " +
            (rechazada ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-accent/10 text-accent")
          }
        >
          {rechazada ? <XCircle className="h-6 w-6" /> : <Clock3 className="h-6 w-6" />}
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-fg">
          {rechazada ? "Tu cuenta no fue aprobada" : "Tu cuenta está pendiente de aprobación"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {rechazada
            ? "Un gestor revisó tu solicitud y no la aprobó. Si crees que es un error, contáctalo directamente."
            : "Ya se registró con éxito. Un gestor tiene que aprobarla antes de que puedas entrar — te avisaremos cuando esté lista."}
        </p>
        <div className="mt-5">
          <CerrarSesionButton />
        </div>
      </Card>
    </div>
  );
}
