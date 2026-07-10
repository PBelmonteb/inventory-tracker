import { Card } from "@/components/ui";
import { formatQty } from "@/lib/utils";
import type { StockPorUbicacion } from "@/lib/types";
import { MapPin } from "lucide-react";

export function StockPorUbicacionCard({
  filas,
  unidad,
}: {
  filas: StockPorUbicacion[];
  unidad: string;
}) {
  if (filas.length === 0) return null;
  return (
    <Card className="mt-4 p-5">
      <div className="mb-3 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-accent" />
        <h2 className="font-semibold text-fg">Stock por ubicación</h2>
      </div>
      <ul className="divide-y divide-line">
        {filas.map((f) => (
          <li
            key={f.ubicacion_id ?? "sin-ubicacion"}
            className="flex items-center justify-between py-2 text-sm"
          >
            <span className="text-muted">{f.ubicacion_nombre}</span>
            <span className="font-semibold text-fg">
              {formatQty(f.stock, unidad)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
