import { redirect } from "next/navigation";
import { EtiquetasView } from "@/components/etiquetas-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { getMateriales } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function EtiquetasPage() {
  const [profile, materiales] = await Promise.all([
    getCurrentProfile(),
    getMateriales(),
  ]);
  // Imprimir etiquetas es una tarea de gestor (igual que catálogos/importar).
  if (!esGestor(profile)) redirect("/inventario");

  return <EtiquetasView materiales={materiales} />;
}
