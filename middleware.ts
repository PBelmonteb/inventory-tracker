import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { DEMO } from "@/lib/config";

export async function middleware(request: NextRequest) {
  // En modo demo no hay autenticación: deja pasar todo y manda /login al inicio.
  if (DEMO) {
    if (request.nextUrl.pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/inicio";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Aplica a todas las rutas excepto archivos estáticos e imágenes.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icon-.*\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
