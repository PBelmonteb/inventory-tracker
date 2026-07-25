import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// Notificación push real (Web Push), además de la campana in-app —
// gateado por VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_CONTACT_EMAIL, igual
// que RESEND_API_KEY en lib/email.ts: sin esas variables, se degrada con
// gracia (regresa {ok:false} sin lanzar) en vez de romper el flujo que la
// llama — el caso se autoriza/rechaza igual, solo sin push real.
//
// Usa el cliente service_role porque quien manda el push (un gestor) no es
// dueño de la suscripción del destinatario — el RLS de push_subscripciones
// solo deja ver la propia.

export interface ResultadoEnvioPush {
  ok: boolean;
  error?: string;
}

export async function enviarPush(
  usuarioId: string,
  payload: { titulo: string; cuerpo: string; url?: string }
): Promise<ResultadoEnvioPush> {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const contacto = process.env.VAPID_CONTACT_EMAIL;
  if (!publicKey || !privateKey || !contacto) {
    return {
      ok: false,
      error: "Push no configurado (falta VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_CONTACT_EMAIL).",
    };
  }

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscripciones")
    .select("id, endpoint, p256dh, auth_key")
    .eq("usuario_id", usuarioId);
  if (!subs || subs.length === 0) {
    return { ok: false, error: "El usuario no tiene notificaciones push activadas." };
  }

  webpush.setVapidDetails(`mailto:${contacto}`, publicKey, privateKey);
  const cuerpoJson = JSON.stringify({
    title: payload.titulo,
    body: payload.cuerpo,
    url: payload.url ?? "/",
  });

  let algunaExitosa = false;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        cuerpoJson
      );
      algunaExitosa = true;
    } catch (err) {
      // Suscripción caducada/inválida (410/404): se borra sola, no vale la
      // pena reintentar — el navegador tendrá que suscribirse de nuevo.
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await admin.from("push_subscripciones").delete().eq("id", s.id);
      }
    }
  }

  return algunaExitosa
    ? { ok: true }
    : { ok: false, error: "No se pudo entregar a ninguna suscripción activa." };
}
