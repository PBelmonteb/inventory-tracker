import { redirect } from "next/navigation";
import { ClientesView } from "@/components/clientes-view";
import { getCurrentProfile, puedeGestionarVentas } from "@/lib/auth";
import { listarUsuariosParaAsignar } from "@/lib/actions/usuarios";
import {
  getCasosVenta,
  getClientes,
  getConveniosClientes,
  getMateriales,
  getSalidasPendientes,
  getScorecardClientes,
} from "@/lib/data";

export const dynamic = "force-dynamic";

const TABS = ["casos", "convenios", "scorecard"] as const;

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ todos?: string; tab?: string }>;
}) {
  const { todos, tab } = await searchParams;
  const verTodos = todos === "1";
  const profile = await getCurrentProfile();
  if (!profile || !puedeGestionarVentas(profile)) redirect("/inventario");
  const [clientes, casos, salidasPendientes, materiales, convenios, scorecardClientes, usuariosRes] =
    await Promise.all([
      getClientes(),
      getCasosVenta({ todos: verTodos }),
      getSalidasPendientes({ todos: verTodos }),
      getMateriales(),
      getConveniosClientes(),
      getScorecardClientes(),
      listarUsuariosParaAsignar(),
    ]);

  const tabInicial = TABS.find((t) => t === tab) ?? "casos";

  const opciones = materiales.map((m) => ({
    id: m.id,
    nombre: m.nombre,
    sku: m.sku,
    unidad: m.unidad,
    stock_actual: m.stock_actual,
  }));

  return (
    <ClientesView
      clientes={clientes}
      casos={casos}
      salidasPendientes={salidasPendientes}
      materiales={opciones}
      convenios={convenios}
      scorecardClientes={scorecardClientes}
      usuarios={usuariosRes.ok ? usuariosRes.usuarios : []}
      verTodos={verTodos}
      puedeGestionarVentas={puedeGestionarVentas(profile)}
      tabInicial={tabInicial}
    />
  );
}
