// Blanco del job periódico (pg_cron -> pg_net) que revisa el stock de todos
// los materiales y crea automáticamente los casos de compra que ya cruzaron
// su punto de reposición (ver lib/casos-automaticos.ts). Sin sesión de
// usuario (lo llama Postgres, no un navegador), por eso usa service_role y
// se protege con el mismo patrón de secreto que app/api/email-caso/route.ts.
//
// Configuración del cron: ver el comentario al final de
// supabase/migrations/0017_reposicion_automatica.sql.

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { DEMO } from "@/lib/config";
import { store } from "@/lib/mock/store";
import { secretoValido } from "@/lib/webhook-auth";
import { generarCasosAutomaticosPorStockBajo } from "@/lib/casos-automaticos";

export async function POST(req: Request) {
  const secreto = process.env.AUTO_CASOS_SECRET;
  if (secreto) {
    if (!secretoValido(req.headers.get("x-webhook-secret"), secreto))
      return NextResponse.json(
        { ok: false, error: "No autorizado" },
        { status: 401 }
      );
  } else if (!DEMO) {
    return NextResponse.json(
      { ok: false, error: "Endpoint no configurado (AUTO_CASOS_SECRET)" },
      { status: 503 }
    );
  }

  if (DEMO) {
    const resumen = store.generarCasosAutomaticosPorStockBajo();
    return NextResponse.json({ ok: true, ...resumen });
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const resumen = await generarCasosAutomaticosPorStockBajo(supabase);
  return NextResponse.json({ ok: true, ...resumen });
}
