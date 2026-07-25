// Plantillas de correo para proveedores — funciones puras, sin React,
// para poder compartirlas entre el formulario cliente (mailto) y el envío
// automático del servidor (lib/email.ts). Dos tonos deliberadamente
// distintos: una PIDE un precio, la otra CONFIRMA una orden ya pactada.

import { formatMoney, formatQty } from "@/lib/utils";

interface MaterialCorreo {
  nombre: string;
  sku: string | null;
  unidad: string;
}

export interface CorreoProveedor {
  asunto: string;
  cuerpo: string;
}

export function lineaCantidadCotizacion(cantidad: number, unidad: string): string {
  return `• Cantidad requerida: ${formatQty(cantidad, unidad)}`;
}

// Solicitud de cotización: no se sabe el precio todavía, se le pide al
// proveedor. Usada por el formulario manual (components/solicitud-
// cotizacion-form.tsx) — extraída tal cual de ahí, mismo texto exacto.
// `referencia` viaja entre corchetes en el asunto para que una respuesta
// se ligue sola al caso vía matchReferenciaEnAsunto (lib/email-caso.ts),
// en vez de crear un caso nuevo.
export function construirCorreoCotizacion(params: {
  material: MaterialCorreo;
  proveedorNombre: string | null;
  cantidad: number;
  referencia: string;
}): CorreoProveedor {
  const { material, proveedorNombre, cantidad, referencia } = params;
  const asunto = `Solicitud de cotización [${referencia}] — ${material.nombre}${
    material.sku ? ` (${material.sku})` : ""
  }`;
  const cuerpo = [
    `Estimados ${proveedorNombre ?? "proveedor"},`,
    "",
    "Solicitamos cotización para el siguiente material:",
    "",
    `• Material: ${material.nombre}`,
    `• SKU: ${material.sku ?? "—"}`,
    lineaCantidadCotizacion(cantidad, material.unidad),
    "",
    "Por favor indíquennos precio unitario, tiempo de entrega y condiciones de pago.",
    "",
    "Quedamos atentos. Saludos.",
  ].join("\n");
  return { asunto, cuerpo };
}

// Confirmación de orden por convenio: el precio/cantidad/condiciones ya
// están pactados de antemano — no se pide nada, se confirma. Usada por el
// envío automático de la reposición (lib/casos-automaticos.ts) cuando el
// convenio tiene auto_enviar = true.
export function construirCorreoOrdenConvenio(params: {
  material: MaterialCorreo;
  proveedorNombre: string | null;
  cantidad: number;
  precioUnitario: number;
  condicionesPago: string | null;
  diasEntregaPactado: number | null;
  referencia: string;
}): CorreoProveedor {
  const {
    material,
    proveedorNombre,
    cantidad,
    precioUnitario,
    condicionesPago,
    diasEntregaPactado,
    referencia,
  } = params;
  const total = precioUnitario * cantidad;

  const asunto = `Orden de compra [${referencia}] — ${material.nombre}${
    material.sku ? ` (${material.sku})` : ""
  }`;
  const lineas = [
    `Estimados ${proveedorNombre ?? "proveedor"},`,
    "",
    "Confirmamos la siguiente orden de compra, conforme al convenio vigente:",
    "",
    `• Material: ${material.nombre}`,
    `• SKU: ${material.sku ?? "—"}`,
    `• Cantidad: ${formatQty(cantidad, material.unidad)}`,
    `• Precio unitario pactado: ${formatMoney(precioUnitario)}`,
    `• Total estimado: ${formatMoney(total)}`,
    diasEntregaPactado
      ? `• Tiempo de entrega acordado: ~${diasEntregaPactado} días`
      : null,
    condicionesPago ? `• Condiciones de pago: ${condicionesPago}` : null,
    `• Referencia: ${referencia}`,
    "",
    "Por favor confírmenos recepción de esta orden. Quedamos atentos.",
    "",
    "Saludos.",
  ];
  const cuerpo = lineas.filter((l): l is string => l !== null).join("\n");
  return { asunto, cuerpo };
}

// Confirmación de orden ya autorizada por un gestor, SIN convenio de por
// medio (a diferencia de construirCorreoOrdenConvenio) — usada cuando un
// gestor autoriza un caso de compra "por_autorizar" en el Portal de
// Proveedores (lib/actions/autorizacion.ts). No menciona "convenio" porque
// puede no haberlo; el precio ya viene decidido por el gestor al autorizar.
export function construirCorreoOrdenAutorizada(params: {
  material: MaterialCorreo;
  proveedorNombre: string | null;
  cantidad: number;
  precioUnitario: number;
  referencia: string;
}): CorreoProveedor {
  const { material, proveedorNombre, cantidad, precioUnitario, referencia } = params;
  const total = precioUnitario * cantidad;

  const asunto = `Orden de compra [${referencia}] — ${material.nombre}${
    material.sku ? ` (${material.sku})` : ""
  }`;
  const cuerpo = [
    `Estimados ${proveedorNombre ?? "proveedor"},`,
    "",
    "Confirmamos la siguiente orden de compra:",
    "",
    `• Material: ${material.nombre}`,
    `• SKU: ${material.sku ?? "—"}`,
    `• Cantidad: ${formatQty(cantidad, material.unidad)}`,
    `• Precio unitario: ${formatMoney(precioUnitario)}`,
    `• Total estimado: ${formatMoney(total)}`,
    `• Referencia: ${referencia}`,
    "",
    "Por favor confírmenos recepción de esta orden. Quedamos atentos.",
    "",
    "Saludos.",
  ].join("\n");
  return { asunto, cuerpo };
}
