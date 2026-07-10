# Inventario — Control en tiempo real

App para responder en segundos: **"¿Qué tengo en inventario AHORA MISMO?"**
Evita compras duplicadas y revela el dinero parado en stock.

Construida con **Next.js 15 (App Router) + Supabase (PostgreSQL) + Tailwind**.
Diseño responsivo (celular y escritorio) e instalable como PWA.

## Funcionalidades

- 📦 **Ver inventario** con búsqueda, filtros e indicador de stock bajo.
- 🔄 **Movimientos**: entradas (compras), salidas (consumo) y ajustes (conteo).
- 📈 **Reportes**: *Comprar ahora* (stock bajo), *Dinero parado* (stock sin
  consumo) y *Valor total* de inventario.
- 📥 **Importar Excel** del inventario actual con mapeo de columnas.
- 👥 **Roles**: admin / gerente (editan) y operario (registra movimientos).
- ⚡ **Tiempo real**: los cambios se reflejan en vivo entre dispositivos.

---

## Modo demo (frontend sin backend)

Para trabajar el **frontend sin configurar Supabase**, simplemente **no crees**
`.env.local`. La app detecta que no hay credenciales y arranca en **modo demo**
con datos de ejemplo en memoria:

```bash
npm install
npm run dev      # http://localhost:3000
```

En modo demo:
- Funciona todo el CRUD (materiales, movimientos, catálogos, import, reportes).
- Los cambios **persisten durante la sesión** del servidor y se reinician al
  reiniciar `npm run dev` (el estado vive en memoria, ver `lib/mock/`).
- No hay login: entras directo como usuario admin de demo.

Cuando llenes `.env.local` con las credenciales reales (abajo), la app cambia
**automáticamente** a Supabase, sin tocar código (ver `lib/config.ts`).

---

## Puesta en marcha con Supabase (backend real)

### 1. Crear el proyecto de Supabase
1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. En **Project Settings → API** copia:
   - *Project URL* → `NEXT_PUBLIC_SUPABASE_URL`
   - *anon public key* → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Crear el esquema
En el **SQL Editor** de Supabase, ejecuta en orden:
1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. *(Opcional, datos de ejemplo)* `supabase/seed.sql`

### 3. Activar Realtime
En **Database → Replication** (o **Realtime**), habilita las tablas
`materiales` y `movimientos`.

### 4. Variables de entorno
Copia `.env.local.example` a `.env.local` y llena los dos valores del paso 1.

### 5. Instalar y correr
```bash
npm install
npm run dev
```
Abre http://localhost:3000 → te redirige a `/login`.

### 6. Crear el primer usuario
- En `/login` usa **"Crear una"** cuenta (o créalo en Supabase →
  *Authentication → Users*).
- Para hacerlo **gerente/admin**, en el SQL Editor:
  ```sql
  update public.profiles set rol = 'admin' where id = (
    select id from auth.users where email = 'tu-correo@empresa.com'
  );
  ```
  > Nota: si en *Authentication → Providers → Email* está activada la
  > confirmación por correo, confirma el usuario antes de iniciar sesión.

---

## Estructura

```
app/
  (auth)/login/         Inicio de sesión
  (app)/
    inventario/         Pantalla principal "¿Qué tengo?"
    movimientos/        Registrar y listar movimientos
    materiales/[id]/    Detalle + historial
    reportes/           Comprar / dinero parado / valor
    importar/           Importar Excel
    catalogos/          Categorías, ubicaciones, proveedores
components/             UI y vistas (cliente)
lib/
  supabase/             Clientes (browser/server) + middleware
  actions/              Server Actions (mutaciones)
  data.ts, reportes.ts  Consultas del servidor
supabase/
  migrations/           Esquema + RLS
  seed.sql              Datos de ejemplo
```

## Despliegue (Vercel)
1. Sube el repo a GitHub e impórtalo en [vercel.com](https://vercel.com).
2. Agrega las dos variables `NEXT_PUBLIC_SUPABASE_*` en el proyecto.
3. Deploy. El mismo proyecto de Supabase sirve como backend.

## Notas
- Los iconos PWA (`public/icon-192.png`, `public/icon-512.png`) son
  pendientes de agregar para instalación en celular.
- **Fase 2** (post-MVP): escaneo QR/código de barras, notificaciones de stock
  bajo, integración con sistema contable.
