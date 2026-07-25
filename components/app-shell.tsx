"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DEMO } from "@/lib/config";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificacionesBell } from "@/components/notificaciones-bell";
import { NotificacionesProvider } from "@/components/notificaciones-provider";
import type { Profile } from "@/lib/types";
import {
  Boxes,
  ArrowLeftRight,
  ScanLine,
  Truck,
  Users,
  BarChart3,
  Upload,
  QrCode,
  Tag,
  ShieldCheck,
  UserCog,
  Settings,
  Factory,
  LogOut,
  FileText,
  Sparkles,
  ClipboardList,
} from "lucide-react";

const NAV = [
  { href: "/inventario", label: "Inventario", icon: Boxes },
  { href: "/escanear", label: "Escanear", icon: ScanLine },
  { href: "/movimientos", label: "Movimientos", icon: ArrowLeftRight },
  { href: "/conteos", label: "Conteos", icon: ClipboardList },
  { href: "/produccion", label: "Producción", icon: Factory },
  { href: "/proveedores", label: "Proveedores", icon: Truck },
  // Oculto para operario mientras no exista el rol "ventas" (ver
  // app/(app)/clientes/page.tsx para el bloqueo del lado servidor).
  { href: "/clientes", label: "Clientes", icon: Users, ocultoOperario: true },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/novedades", label: "Novedades", icon: Sparkles },
  { href: "/precios", label: "Precios", icon: Tag, gestor: true },
  { href: "/importar", label: "Importar", icon: Upload, gestor: true },
  { href: "/etiquetas", label: "Etiquetas", icon: QrCode, gestor: true },
  { href: "/auditoria", label: "Auditoría", icon: ShieldCheck, gestor: true },
  { href: "/usuarios", label: "Usuarios", icon: UserCog, gestor: true },
  { href: "/catalogos", label: "Catálogos", icon: Settings, gestor: true },
  { href: "/convenios", label: "Convenios", icon: FileText, gestor: true },
];

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AppShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const esGestor = profile.rol === "admin" || profile.rol === "gerente";
  const items = NAV.filter(
    (i) =>
      (!i.gestor || esGestor) &&
      !(i.ocultoOperario && profile.rol === "operario")
  );

  async function signOut() {
    if (DEMO) {
      alert("Modo demo: la autenticación se activa al conectar Supabase.");
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <NotificacionesProvider>
    <div className="flex min-h-screen flex-col bg-canvas md:flex-row">
      {/* ---------- Sidebar (escritorio) ---------- */}
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-fg md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <Boxes className="h-5 w-5" />
          </div>
          <div className="flex-1 leading-tight">
            <p className="text-sm font-semibold tracking-tight">Inventario</p>
            <p className="text-[11px] text-sidebar-muted">
              {DEMO ? "Modo demo" : "Tiempo real"}
            </p>
          </div>
          <NotificacionesBell variant="side" />
        </div>

        <p className="px-5 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
          Menú
        </p>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                  active
                    ? "bg-sidebar-surface text-sidebar-fg"
                    : "text-sidebar-muted hover:bg-sidebar-surface/60 hover:text-sidebar-fg"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent" />
                )}
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Usuario + acciones */}
        <div className="mt-auto border-t border-sidebar-line p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="relative">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-surface text-xs font-semibold text-sidebar-fg">
                {iniciales(profile.nombre)}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-sidebar bg-emerald-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-sidebar-fg">
                {profile.nombre}
              </p>
              <p className="text-[11px] capitalize text-sidebar-muted">
                {profile.rol}
              </p>
            </div>
            <ThemeToggle />
          </div>
          <button
            onClick={signOut}
            className="mt-1 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-surface hover:text-sidebar-fg"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Salir
          </button>
        </div>
      </aside>

      {/* ---------- Header móvil ---------- */}
      <header className="flex items-center justify-between bg-sidebar px-4 py-3 text-sidebar-fg md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <Boxes className="h-4 w-4" />
          </div>
          <span className="font-semibold">Inventario</span>
          {DEMO && (
            <span className="rounded-full bg-sidebar-surface px-2 py-0.5 text-[10px] font-medium text-sidebar-muted">
              Demo
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <NotificacionesBell variant="mobile" />
          <ThemeToggle />
          <button
            onClick={signOut}
            aria-label="Salir"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-sidebar-muted hover:bg-sidebar-surface hover:text-sidebar-fg"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      {/* ---------- Contenido ---------- */}
      <main className="flex-1 pb-24 md:pb-0">{children}</main>

      {/* ---------- Barra inferior (móvil) ---------- */}
      {/* Con más de 5 items la barra scrollea horizontal (min-w por item). */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-line bg-surface md:hidden">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-[72px] flex-1 shrink-0 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-accent" : "text-faint"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
    </NotificacionesProvider>
  );
}
