"use client";

// Cotización en PDF, 100% client-side (sin ida al servidor) — mismo
// espíritu que lib/utils.ts:exportarCSV, solo que arma un PDF en vez de un
// CSV. Precio y subtotal por línea vienen de casos_venta_items.precio_
// unitario (migración 0045_precio_linea_venta.sql) — el total del pie se
// suma directo de los items, no de caso.monto, para ser autoconsistente.

import jsPDF from "jspdf";
import { Button } from "@/components/ui";
import { formatMoney, formatQty, formatDate } from "@/lib/utils";
import type { CasoVentaConRelaciones } from "@/lib/types";
import { FileDown } from "lucide-react";

export function BotonCotizacionPDF({ caso }: { caso: CasoVentaConRelaciones }) {
  function generar() {
    const doc = new jsPDF();
    const margenIzq = 14;
    const margenDer = 196;
    let y = 20;

    doc.setFontSize(18);
    doc.text("Cotización", margenIzq, y);
    y += 10;

    doc.setFontSize(10);
    doc.text(`Referencia: ${caso.referencia ?? "—"}`, margenIzq, y);
    y += 6;
    doc.text(`Fecha: ${formatDate(caso.created_at)}`, margenIzq, y);
    y += 6;
    doc.text(
      `Cliente: ${caso.clientes?.nombre ?? caso.cliente_nombre ?? "Cliente eliminado"}`,
      margenIzq,
      y
    );
    y += 10;

    doc.setFontSize(13);
    doc.text(caso.titulo, margenIzq, y);
    y += 7;

    if (caso.descripcion) {
      doc.setFontSize(10);
      doc.text(caso.descripcion, margenIzq, y);
      y += 8;
    }
    y += 3;

    doc.setFontSize(11);
    doc.text("Material", margenIzq, y);
    doc.text("Cantidad", 118, y);
    doc.text("Precio unit.", 148, y);
    doc.text("Subtotal", 178, y);
    y += 2;
    doc.line(margenIzq, y, margenDer, y);
    y += 7;

    doc.setFontSize(10);
    let total = 0;
    for (const item of caso.items) {
      const subtotal = item.cantidad * item.precio_unitario;
      total += subtotal;
      doc.text(item.materiales?.nombre ?? "Material eliminado", margenIzq, y);
      doc.text(formatQty(item.cantidad, item.materiales?.unidad), 118, y);
      doc.text(formatMoney(item.precio_unitario), 148, y);
      doc.text(formatMoney(subtotal), 178, y);
      y += 7;
    }

    y += 2;
    doc.line(margenIzq, y, margenDer, y);
    y += 9;

    doc.setFontSize(13);
    doc.text(`Total: ${formatMoney(total)}`, margenIzq, y);
    y += 12;

    doc.setFontSize(9);
    doc.text(
      "Cotización válida por 15 días a partir de la fecha de emisión.",
      margenIzq,
      y
    );

    doc.save(`Cotizacion-${caso.referencia ?? caso.id}.pdf`);
  }

  return (
    <Button type="button" variant="secondary" onClick={generar}>
      <FileDown className="h-4 w-4" /> Descargar PDF
    </Button>
  );
}
