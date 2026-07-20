import { redirect } from "next/navigation";
import { ConveniosView } from "@/components/convenios-view";
import { getCurrentProfile, esGestor } from "@/lib/auth";
import { getConvenios, getMateriales, getProveedores } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ConveniosPage() {
  const profile = await getCurrentProfile();
  if (!esGestor(profile)) redirect("/inventario");

  const [convenios, proveedores, materiales] = await Promise.all([
    getConvenios(),
    getProveedores(),
    getMateriales(),
  ]);

  const opcionesMaterial = materiales.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    sku: m.sku,
    unidad: m.unidad,
  }));

  return (
    <ConveniosView
      convenios={convenios}
      proveedores={proveedores}
      materiales={opcionesMaterial}
    />
  );
}
