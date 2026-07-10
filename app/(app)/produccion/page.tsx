import { ProduccionView } from "@/components/produccion-view";
import { getProducibles } from "@/lib/data";

export const dynamic = "force-dynamic";

// Sin guard de gestor: producir es una acción operativa de piso de planta,
// igual que registrar un movimiento (ver lib/actions/produccion.ts).
export default async function ProduccionPage() {
  const producibles = await getProducibles();
  return <ProduccionView producibles={producibles} />;
}
