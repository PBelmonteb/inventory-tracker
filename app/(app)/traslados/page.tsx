import { TrasladosView } from "@/components/traslados-view";
import { getTraslados } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function TrasladosPage() {
  const traslados = await getTraslados();
  return <TrasladosView traslados={traslados} />;
}
