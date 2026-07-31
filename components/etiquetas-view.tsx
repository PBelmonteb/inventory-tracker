"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Button, Card } from "@/components/ui";
import { normalizarTexto } from "@/lib/utils";
import type { MaterialConRelaciones } from "@/lib/types";
import { Printer, QrCode, Search } from "lucide-react";

export function EtiquetasView({
  materiales,
}: {
  materiales: MaterialConRelaciones[];
}) {
  // Solo materiales con SKU (el QR codifica el SKU).
  const conSku = useMemo(
    () => materiales.filter((m) => m.sku && m.sku.trim()),
    [materiales]
  );

  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Set<string>>(() => new Set(conSku.map((m) => m.id)));
  const [busqueda, setBusqueda] = useState("");

  // Genera los QR (data URL) de cada SKU una vez.
  useEffect(() => {
    let activo = true;
    Promise.all(
      conSku.map(async (m) => [
        m.id,
        await QRCode.toDataURL(m.sku!.trim(), { width: 280, margin: 1 }),
      ] as const)
    ).then((pares) => {
      if (activo) setQrs(Object.fromEntries(pares));
    });
    return () => {
      activo = false;
    };
  }, [conSku]);

  const filtrados = conSku.filter((m) => {
    if (!busqueda) return true;
    const q = normalizarTexto(busqueda);
    return normalizarTexto(`${m.nombre} ${m.sku ?? ""}`).includes(q);
  });

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function imprimir() {
    const elegidos = conSku.filter((m) => sel.has(m.id));
    if (elegidos.length === 0) return;
    const labels = elegidos
      .map(
        (m) => `
        <div class="label">
          <img src="${qrs[m.id]}" alt="${m.sku}" />
          <div class="nombre">${escapeHtml(m.nombre)}</div>
          <div class="sku">${escapeHtml(m.sku!)}</div>
        </div>`
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: system-ui, sans-serif; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8mm; padding: 10mm; }
        .label { border: 1px solid #ccc; border-radius: 8px; padding: 6mm; text-align: center;
                 page-break-inside: avoid; }
        .label img { width: 100%; max-width: 45mm; height: auto; }
        .nombre { font-weight: 600; font-size: 11pt; margin-top: 2mm; }
        .sku { font-family: monospace; font-size: 13pt; letter-spacing: 1px; margin-top: 1mm; }
        @media print { .grid { padding: 5mm; } }
      </style></head>
      <body><div class="grid">${labels}</div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }

  const total = sel.size;

  return (
    <div className="mx-auto max-w-5xl">
      {/* Sin h1 propio: vive como tab dentro de Administración. */}
      <div className="mb-6 flex justify-end">
        <Button onClick={imprimir} disabled={total === 0}>
          <Printer className="h-4 w-4" /> Imprimir {total > 0 ? `(${total})` : ""}
        </Button>
      </div>

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-faint" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar material o SKU..."
            className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-faint"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSel(new Set(conSku.map((m) => m.id)))}
            className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-accent hover:underline"
          >
            Seleccionar todo
          </button>
          <button
            onClick={() => setSel(new Set())}
            className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-muted hover:underline"
          >
            Ninguno
          </button>
        </div>
      </Card>

      {conSku.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No hay materiales con SKU. Asígnales un SKU para generar su etiqueta.
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {filtrados.map((m) => {
            const elegido = sel.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                className={
                  "flex cursor-pointer flex-col items-center rounded-xl border p-3 text-center transition-colors " +
                  (elegido
                    ? "border-accent bg-accent/5"
                    : "border-line bg-surface hover:bg-surface-2/60")
                }
              >
                {qrs[m.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrs[m.id]}
                    alt={`QR ${m.sku}`}
                    className="h-24 w-24"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center text-faint">
                    <QrCode className="h-8 w-8" />
                  </div>
                )}
                <p className="mt-2 line-clamp-2 text-xs font-medium text-fg">
                  {m.nombre}
                </p>
                <p className="font-mono text-xs text-faint">{m.sku}</p>
                <span
                  className={
                    "mt-2 text-[11px] font-medium " +
                    (elegido ? "text-accent" : "text-faint")
                  }
                >
                  {elegido ? "✓ Incluida" : "Excluida"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
