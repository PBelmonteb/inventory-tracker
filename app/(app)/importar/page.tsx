import { redirect } from "next/navigation";
import { ImportarView } from "@/components/importar-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const profile = await getCurrentProfile();
  if (!esGestor(profile)) redirect("/inventario");

  return <ImportarView />;
}
