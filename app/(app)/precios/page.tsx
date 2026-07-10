import { redirect } from "next/navigation";
import { PreciosView } from "@/components/precios-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { getMateriales } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function PreciosPage() {
  const [profile, materiales] = await Promise.all([
    getCurrentProfile(),
    getMateriales(),
  ]);
  if (!esGestor(profile)) redirect("/inventario");

  return <PreciosView materiales={materiales} />;
}
