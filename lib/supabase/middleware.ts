import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// Rutas sin sesión de usuario por diseño: son webhooks (Cloudflare Email
// Worker, pg_cron -> pg_net) que se autentican con su propio secreto
// (x-webhook-secret, ver lib/webhook-auth.ts) — nunca traen cookie de
// sesión, así que antes de esto el middleware las redirigía a /login sin
// que su propio chequeo de secreto llegara siquiera a ejecutarse.
const PUBLIC_PATHS = [
  "/login",
  "/registro",
  "/auth",
  "/api/email-caso",
  "/api/generar-casos-automaticos",
];

// Rutas que sí puede alcanzar alguien autenticado pero con estado_cuenta
// distinto de "aprobada" (auto-registro sin revisar, o rechazado) -- para
// no generar un loop de redirects hacia sí mismas y para poder cerrar
// sesión desde /pendiente.
const RUTAS_PENDIENTE_PERMITIDAS = ["/pendiente", "/login", "/registro", "/auth"];

/** Refresca la sesión y protege rutas privadas. */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user) {
    // Cuenta autenticada pero sin aprobar (auto-registro pendiente de
    // revisión, o rechazada) no puede tocar nada de la app -- ni páginas
    // ni Server Actions, que llegan aquí igual que cualquier otro request
    // a la misma ruta. Antes esto solo se checaba en app/(app)/layout.tsx,
    // que NO corre para una Server Action invocada directo (un POST a la
    // misma URL con el header interno de Next) -- una cuenta pendiente
    // podía invocar registrarMovimiento, crearSolicitudCompra, etc.
    // saltándose por completo la aprobación (ver auditoría de seguridad,
    // corregido junto con la migración 0046_aprobacion_cuentas.sql).
    if (!RUTAS_PENDIENTE_PERMITIDAS.some((p) => path.startsWith(p))) {
      const { data: perfil } = await supabase
        .from("profiles")
        .select("estado_cuenta")
        .eq("id", user.id)
        .single();
      if (perfil && perfil.estado_cuenta !== "aprobada") {
        const url = request.nextUrl.clone();
        url.pathname = "/pendiente";
        return NextResponse.redirect(url);
      }
    }

    if (path === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/inicio";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
