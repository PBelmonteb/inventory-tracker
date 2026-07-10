"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, Input } from "@/components/ui";
import { producir } from "@/lib/actions/produccion";
import { formatQty, nivelStock } from "@/lib/utils";
import type { ProducibleConReceta } from "@/lib/types";
import { Factory } from "lucide-react";

export function ProduccionView({
  producibles,
}: {
  producibles: ProducibleConReceta[];
}) {
  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      <div className="mb-6 flex items-center gap-2">
        <Factory className="h-6 w-6 text-accent" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
            Producción
          </h1>
          <p className="mt-1 text-sm text-muted">
            Produce artículos a partir de su receta — descuenta los insumos
            automáticamente.
          </p>
        </div>
      </div>

      {producibles.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          Ningún material tiene una receta configurada todavía. Abre el
          detalle de un material y agrégale una receta de producción para que
          aparezca aquí.
        </Card>
      ) : (
        <div className="space-y-4">
          {producibles.map((p) => (
            <ProductoCard key={p.producto.id} item={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductoCard({ item }: { item: ProducibleConReceta }) {
  const router = useRouter();
  const { producto, receta } = item;
  const nivel = nivelStock(producto);
  const [cantidad, setCantidad] = useState("1");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onProducir() {
    setError(null);
    const n = Number(cantidad);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Cantidad inválida");
      return;
    }
    setCargando(true);
    const res = await producir(producto.id, n);
    setCargando(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCantidad("1");
    router.refresh();
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/materiales/${producto.id}`}
            className="font-medium text-fg transition-colors hover:text-accent"
          >
            {producto.nombre}
          </Link>
          {producto.sku && (
            <span className="ml-2 text-xs text-faint">{producto.sku}</span>
          )}
          <p className="mt-1 text-xs text-faint">
            Stock actual: {formatQty(producto.stock_actual, producto.unidad)}
          </p>
        </div>
        <Badge
          tone={nivel === "bajo" ? "danger" : nivel === "aviso" ? "warn" : "ok"}
        >
          {nivel === "bajo" ? "Stock bajo" : nivel === "aviso" ? "Por agotarse" : "OK"}
        </Badge>
      </div>

      <ul className="mt-3 space-y-1 text-xs text-muted">
        {receta.map((r) => (
          <li key={r.id}>
            {formatQty(r.cantidad_por_unidad, r.componente.unidad)} de{" "}
            {r.componente.nombre} por unidad ·{" "}
            <span
              className={
                r.componente.stock_actual <= 0
                  ? "text-red-600 dark:text-red-400"
                  : undefined
              }
            >
              disp. {formatQty(r.componente.stock_actual, r.componente.unidad)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-end gap-2">
        <div className="w-28">
          <Input
            type="number"
            min="1"
            step="any"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            aria-label={`Cantidad a producir de ${producto.nombre}`}
          />
        </div>
        <Button onClick={onProducir} disabled={cargando}>
          {cargando ? "Produciendo..." : `Producir ${producto.unidad}`}
        </Button>
      </div>
      {error && (
        <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </Card>
  );
}
