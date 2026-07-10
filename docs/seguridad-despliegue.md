# Seguridad — guía de despliegue

Esta app corre hoy en **modo DEMO** (datos en memoria, sin base de datos ni
credenciales). La superficie de ataque real aparece al conectar Supabase y
desplegar. Este documento es el checklist para ese momento.

> Principio rector: **el RLS de Supabase es el muro de seguridad real, no el
> frontend.** Cualquiera puede saltarse la UI y pegarle directo a la API.

---

## 1. Variables de entorno

| Variable | Dónde | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (build + runtime) | **Su ausencia activa el modo DEMO.** Si falta en producción, el webhook queda abierto y el simulador de correos visible. Verifícala siempre. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | Clave pública (segura para el cliente). |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (solo servidor) | **Llave maestra: salta el RLS.** Nunca con prefijo `NEXT_PUBLIC_`, nunca en el cliente, nunca en el repo. |
| `EMAIL_WEBHOOK_SECRET` | Vercel + Cloudflare Worker | Secreto compartido del webhook. Genéralo con `openssl rand -hex 32`. Rótalo si se filtra. |

- `.env.local` debe estar en `.gitignore` (verifícalo).
- En producción confirma `DEMO === false` (es decir, `NEXT_PUBLIC_SUPABASE_URL`
  definida). El modo demo es abierto **a propósito**; nunca confíes en su
  seguridad.

---

## 2. Webhook de correo entrante (`/api/email-caso`)

Es el único endpoint público con efectos de escritura. Mitigaciones ya en código:

- ✅ Secreto compartido con **comparación en tiempo constante** (`secretoValido`).
- ✅ Idempotencia por `Message-ID` (los reintentos no duplican casos).
- ✅ Allowlist: solo remitentes que son contacto de un proveedor crean caso.
- ✅ Límite de tamaño del cuerpo (10 000 chars) y parseo en `try/catch`.
- ✅ Regex acotadas (sin ReDoS).

Pendientes **obligatorios** antes de activar correo real:

1. **Verificar SPF/DKIM en Cloudflare Email Routing.** El campo `From` de un
   correo es falsificable; hacer match del remitente **no es autenticación**.
   Sin SPF/DKIM, quien conozca el correo de un proveedor puede inyectar casos
   falsos. Cloudflare valida SPF/DKIM en el inbound — actívalo.
2. **El webhook debe usar el cliente de `service_role`**, no el cliente por
   cookie (`@/lib/supabase/server`). El webhook no tiene sesión de usuario, así
   que con el cliente normal el RLS **bloquearía** los inserts. La rama Supabase
   del route está marcada con este TODO. Crea un cliente con la
   `SUPABASE_SERVICE_ROLE_KEY` solo para este handler.
3. Opcional pero recomendado: restringir el endpoint a las **IPs de Cloudflare**
   (o validar un header firmado), además del secreto.

Prueba de humo (deben fallar todas menos la primera):
```bash
# OK
curl -XPOST $URL/api/email-caso -H "x-webhook-secret: $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"de":"ventas@proveedor.mx","asunto":"x","cuerpo":"y","mensajeId":"<1@a>"}'
# 401 sin secreto / con secreto malo
curl -XPOST $URL/api/email-caso -d '{...}'
# 200 duplicado (mismo mensajeId, no crea caso)
# 422 remitente desconocido
```

---

## 3. Row Level Security (el muro real)

- Tras cada migración, corre el **Security Advisor** del dashboard de Supabase
  (detecta tablas sin RLS o políticas laxas).
- **Decisión a confirmar:** hoy las tablas operativas (`casos_compra`,
  `casos_venta`, `movimientos`, etc.) permiten que **cualquier usuario
  autenticado** inserte/actualice. No hay propiedad por fila. Si quieres que un
  operario no pueda modificar casos ajenos, hay que endurecer las políticas.
- **Prueba el RLS de verdad:** inicia sesión como `operario` e intenta acciones
  que deberían estar prohibidas (editar catálogos, borrar materiales). Si pasan,
  el muro tiene hueco.
- `clientes` se trata como catálogo: escritura solo `es_gestor()`.

---

## 4. Checklist pre-deploy

- [ ] `npm audit` sin vulnerabilidades altas/críticas.
- [ ] `.env.local` ignorado por git; secretos solo en Vercel/Cloudflare.
- [ ] `NEXT_PUBLIC_SUPABASE_URL` definida → `DEMO === false` en producción.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` solo del lado servidor.
- [ ] Webhook: secreto fuerte, cliente service-role, SPF/DKIM activo.
- [ ] Security Advisor de Supabase en verde tras las migraciones.
- [ ] Prueba de RLS con un usuario `operario` real.
- [ ] Prueba de humo del webhook (los 4 casos de arriba).
- [ ] `NEXT_PUBLIC_SENTRY_DSN` definida en Vercel (opcional pero recomendado
      antes de tener clientes reales — sin ella, un error en producción solo
      se nota si el cliente te escribe). Ver sección 5.1.

---

## 4.1 Hallazgos de `npm audit` (jun 2026)

- **`xlsx` (SheetJS) — ALTA.** Prototype Pollution (GHSA-4r6h-8v6p-xvw6) y ReDoS
  (GHSA-5pgg-2g8v-p4x9). **Sin fix en npm** (SheetJS dejó de publicar en npm).
  Relevante porque el **import de Excel parsea archivos no confiables** del
  cliente. Mitigación: actualizar a la última versión desde el CDN oficial de
  SheetJS (`cdn.sheetjs.com`) y limitar el tamaño del archivo subido. Mientras
  tanto, el import solo lo usan gestores y los datos no se ejecutan, pero hay
  que cerrarlo antes de producción.
- **`postcss` vía `next` — moderada.** Ruido conocido: el "fix" propuesto
  degrada Next a 9.3.3 (absurdo). Es una herramienta de build, no afecta runtime.
  Baja prioridad; se resuelve solo al subir de versión mayor de Next.

## 5. Lo que ya está cubierto en código

- Validación de entrada en todas las server actions (rechazo antes de tocar datos).
- React escapa el HTML por defecto; sin `dangerouslySetInnerHTML` salvo el script
  de tema (string estático, sin input de usuario).
- Consultas vía query builder de Supabase (parametrizado → sin inyección SQL);
  el `format()` del RLS usa identificadores de un array fijo, no input.
- Contraseñas gestionadas por Supabase Auth (nunca las tocamos).
- `mailto:` con `encodeURIComponent` en asunto y cuerpo.

## 5.1 Monitoreo de errores (Sentry)

Código ya integrado (`@sentry/nextjs`), **inactivo por defecto**: sin
`NEXT_PUBLIC_SENTRY_DSN` en el entorno, ningún archivo `sentry.*.config.ts`
llama a `Sentry.init()` — la app corre exactamente igual que hoy (mismo
patrón que `DEMO`, ver `lib/config.ts`).

Para activarlo:

1. Crear cuenta gratis en [sentry.io](https://sentry.io) + proyecto Next.js.
2. Copiar el DSN (Settings → Client Keys) a `NEXT_PUBLIC_SENTRY_DSN` en
   Vercel (y opcionalmente en `.env.local` para probarlo en dev).
3. Opcional — para que los stack traces de producción se traduzcan a tu
   código real (no JS minificado): agregar `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
   `SENTRY_PROJECT` (Sentry Dashboard → Settings → Auth Tokens). Sin esto el
   build sigue funcionando, solo sin esa traducción de source maps.

Archivos relevantes: `instrumentation.ts` / `instrumentation-client.ts`
(init de servidor/edge/navegador), `sentry.server.config.ts` /
`sentry.edge.config.ts`, `app/global-error.tsx` (red de seguridad para
errores que escapan cualquier boundary), `next.config.mjs`
(`withSentryConfig`, sube source maps solo si hay `SENTRY_AUTH_TOKEN`).

`sendDefaultPii: false` en los tres inits — este proyecto maneja datos de
negocio reales (costos, nombres de clientes/proveedores); no se manda nada
de eso a un tercero por defecto.
