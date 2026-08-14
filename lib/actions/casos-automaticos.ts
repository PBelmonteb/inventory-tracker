"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { getCurrentProfile, puedeGestionarCompras } from "@/lib/auth";
import {
  generarCasosAutomaticosPorStockBajo,
  type ResumenReposicionAutomatica,
} from "@/lib/casos-automaticos";

export type RevisionResult =
  | { ok: true; resumen: ResumenReposicionAutomatica }
  | { ok: false; error: string };

// Botón manual "Revisar reposición ahora": corre la misma lógica que el
// cron (lib/casos-automaticos.ts), pero con el cliente de sesión normal.
// Gestor/compras-only: esto puede terminar mandando una orden real por
// convenio (auto_enviar), así que es una decisión de compras, no algo que
// cualquier autenticado deba poder disparar -- antes no tenía candado
// propio, solo confiaba en que RLS dejara pasar cualquier insert/update
// (ver migración 0048_endurecer_casos_compra.sql, que además ya exige
// esto mismo del lado de la base de datos).
export async function revisarReposicionAutomatica(): Promise<RevisionResult> {
  const yo = await getCurrentProfile();
  if (!yo || !puedeGestionarCompras(yo)) return { ok: false, error: "No autorizado" };

  try {
    let resumen: ResumenReposicionAutomatica;
    if (DEMO) {
      resumen = store.generarCasosAutomaticosPorStockBajo();
    } else {
      const supabase = await createClient();
      resumen = await generarCasosAutomaticosPorStockBajo(supabase);
    }
    if (resumen.casosCreados > 0) revalidatePath("/proveedores");
    return { ok: true, resumen };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Error" };
  }
}
