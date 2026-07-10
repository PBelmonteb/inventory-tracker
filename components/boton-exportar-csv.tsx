"use client";

import { Button } from "@/components/ui";
import { exportarCSV } from "@/lib/utils";
import { Download } from "lucide-react";

/** Botón reusable: exporta un arreglo de objetos como CSV (raw data). */
export function BotonExportarCSV({
  filename,
  filas,
  label = "Exportar CSV",
}: {
  filename: string;
  filas: Record<string, unknown>[];
  label?: string;
}) {
  return (
    <Button
      variant="secondary"
      onClick={() => exportarCSV(filename, filas)}
      disabled={filas.length === 0}
    >
      <Download className="h-4 w-4" />
      {label}
    </Button>
  );
}
