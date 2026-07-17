"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import {
  generarCasosAutomaticosPorStockBajo,
  type ResumenReposicionAutomatica,
} from "@/lib/casos-automaticos";

export type RevisionResult =
  | { ok: true; resumen: ResumenReposicionAutomatica }
  | { ok: false; error: string };

// Botón manual "Revisar reposición ahora": corre la misma lógica que el
// cron (lib/casos-automaticos.ts), pero con el cliente de sesión normal —
// las políticas RLS de casos_compra/notificaciones ya permiten insert/update
// a cualquier autenticado, así que no hace falta service_role aquí.
export async function revisarReposicionAutomatica(): Promise<RevisionResult> {
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
