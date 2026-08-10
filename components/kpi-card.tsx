import { Card } from "@/components/ui";

// Tarjeta de KPI reusada entre /inicio (gestor/compras/ventas) y el
// dashboard gerencial (components/kpi-dashboard-view.tsx) — antes vivía
// duplicada como componente local de inicio-view.tsx.
export function KpiCard({
  icon,
  label,
  value,
  tone = "accent",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "accent" | "warn" | "danger";
}) {
  const tones = {
    accent: "bg-accent/12 text-accent",
    warn: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    danger: "bg-red-500/12 text-red-600 dark:text-red-400",
  };
  return (
    <Card className="p-4">
      <div className={`mb-2.5 inline-flex rounded-lg p-2 ${tones[tone]}`}>{icon}</div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tracking-tight text-fg">{value}</p>
    </Card>
  );
}
