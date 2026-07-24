-- ============================================================
--  Mitigación encontrada en revisión de seguridad (jul 2026): el webhook de
--  correo entrante ligaba respuestas a un caso abierto por código en el
--  asunto sin verificar que el remitente coincidiera con el proveedor del
--  caso — un correo con un asunto adivinado (el código es solo 6 dígitos
--  del timestamp, y viaja en el asunto saliente) se guardaba en el
--  timeline como si fuera una respuesta legítima del proveedor.
--
--  No se bloquea el correo (rechazar de plano rompería respuestas legítimas
--  desde un contacto distinto al registrado) — en vez de eso, cada evento
--  de correo guarda dos banderas para que el staff decida con contexto:
--  si el remitente es externo a la organización, y si coincide con el
--  contacto registrado del proveedor de ESE caso. Ver
--  app/api/email-caso/route.ts y components/caso-timeline.tsx.
-- ============================================================

alter table public.casos_compra_eventos
  add column remitente_externo boolean,
  add column remitente_verificado boolean;
