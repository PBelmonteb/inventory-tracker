import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  // Cuenta creada por auto-registro, todavía sin revisar (o rechazada) --
  // no entra a la app hasta que un gestor la apruebe (ver /pendiente y
  // lib/actions/registro.ts). Las cuentas que un gestor da de alta desde
  // /usuarios quedan "aprobada" de una vez, nunca pasan por aquí.
  if (profile.estado_cuenta !== "aprobada") redirect("/pendiente");

  return <AppShell profile={profile}>{children}</AppShell>;
}
