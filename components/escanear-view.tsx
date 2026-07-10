"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { Escaner } from "@/components/escaner";
import { normalizarTexto } from "@/lib/utils";
import type { MaterialConRelaciones } from "@/lib/types";
import { ScanLine, PackageSearch } from "lucide-react";

export function EscanearView({
  materiales,
  esGestor,
}: {
  materiales: MaterialConRelaciones[];
  esGestor: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [noEncontrado, setNoEncontrado] = useState<string | null>(null);

  const onDetected = useCallback(
    (texto: string) => {
      setAbierto(false);
      // El QR puede traer el SKU directo o una URL con el SKU al final.
      const code = texto.split(/[/?#]/).filter(Boolean).pop() ?? texto;
      const objetivo = normalizarTexto(code);
      const material = materiales.find(
        (m) => m.sku && normalizarTexto(m.sku) === objetivo
      );
      if (material) {
        setNoEncontrado(null);
        // Abre directo el formulario de movimiento de ese material.
        router.push(`/materiales/${material.id}?mov=1`);
      } else {
        setNoEncontrado(code);
      }
    },
    [materiales, router]
  );

  return (
    <div className="mx-auto max-w-xl p-4 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-3xl">
          Escanear material
        </h1>
        <p className="mt-1 text-sm text-muted">
          Lee el código del material para registrar un movimiento al instante.
        </p>
      </div>

      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <ScanLine className="h-8 w-8" />
        </div>
        <p className="text-sm text-muted">
          Apunta la cámara al código QR pegado en el rack o el material.
        </p>
        <Button onClick={() => setAbierto(true)} className="w-full justify-center">
          <ScanLine className="h-4 w-4" /> Abrir cámara y escanear
        </Button>
      </Card>

      {noEncontrado && (
        <Card className="mt-4 p-5">
          <div className="flex items-start gap-3">
            <PackageSearch className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-fg">
                No hay ningún material con el código{" "}
                <span className="font-mono">{noEncontrado}</span>
              </p>
              <p className="mt-1 text-xs text-muted">
                {esGestor
                  ? "Puedes darlo de alta desde Inventario con ese SKU."
                  : "Pídele al encargado que lo dé de alta."}
              </p>
              {esGestor && (
                <Link
                  href="/inventario"
                  className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
                >
                  Ir a Inventario →
                </Link>
              )}
            </div>
          </div>
        </Card>
      )}

      <Escaner
        open={abierto}
        onClose={() => setAbierto(false)}
        onDetected={onDetected}
      />
    </div>
  );
}
