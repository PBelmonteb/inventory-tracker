import { redirect } from "next/navigation";
import { AuditoriaView } from "@/components/auditoria-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { getAuditoria } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  const [profile, registros] = await Promise.all([
    getCurrentProfile(),
    getAuditoria(),
  ]);
  if (!esGestor(profile)) redirect("/inventario");

  return <AuditoriaView registros={registros} />;
}
