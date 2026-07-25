import { redirect } from "next/navigation";
import { ClientesView } from "@/components/clientes-view";
import { getCurrentProfile } from "@/lib/auth";
import { listarUsuariosParaAsignar } from "@/lib/actions/usuarios";
import {
  getCasosVenta,
  getClientes,
  getMateriales,
  getSalidasPendientes,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ todos?: string }>;
}) {
  const { todos } = await searchParams;
  const verTodos = todos === "1";
  // Mientras no exista el rol "ventas" (pendiente, sesión aparte), el
  // operario no maneja el Portal de Clientes.
  const profile = await getCurrentProfile();
  if (profile?.rol === "operario") redirect("/inventario");
  const [clientes, casos, salidasPendientes, materiales, usuariosRes] =
    await Promise.all([
      getClientes(),
      getCasosVenta({ todos: verTodos }),
      getSalidasPendientes({ todos: verTodos }),
      getMateriales(),
      listarUsuariosParaAsignar(),
    ]);

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
      usuarios={usuariosRes.ok ? usuariosRes.usuarios : []}
      verTodos={verTodos}
    />
  );
}
