// Envío de correo real (servidor), a diferencia del resto de la app que
// usa mailto: (requiere que un humano con navegador le dé clic). Lo
// necesita el envío automático de órdenes por convenio
// (lib/casos-automaticos.ts), que corre desde un cron sin nadie presente.
//
// Gateado por RESEND_API_KEY/EMAIL_FROM — si faltan (todavía no hay
// dominio propio configurado con SPF/DKIM), regresa { ok: false } sin
// lanzar, mismo patrón que SENTRY_DSN en lib/config.ts: sin la variable,
// la funcionalidad simplemente no se activa en vez de romper nada.

import { Resend } from "resend";

export interface ResultadoEnvioCorreo {
  ok: boolean;
  error?: string;
}

export async function enviarCorreo(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<ResultadoEnvioCorreo> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return {
      ok: false,
      error: "Servicio de correo no configurado (falta RESEND_API_KEY/EMAIL_FROM).",
    };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      text: params.body,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error enviando correo",
    };
  }
}
