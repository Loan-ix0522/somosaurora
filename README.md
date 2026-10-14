# Somos Aurora

Plataforma de escucha ciudadana de **La Aurora (Daule)**. Landing pública + formulario de opiniones, panel administrativo privado e informe semanal.

- **Frontend:** estático (`index.html`, `admin/index.html`) — se conserva el diseño original.
- **Backend:** Supabase (Postgres + Auth + Storage).
- **Hosting:** Vercel (estático + Edge Functions en `/api`), deploy automático desde GitHub.

## Estructura
```
index.html            Landing pública (formulario + top en vivo)
informe-demo.html     Demo del informe
admin/index.html      Panel privado (login, tabla Excel, informe, limpieza)
api/submit.js         POST: guarda opiniones (usa service_role, server-side)
api/featured.js       GET:  top público del último informe
api/config.js         GET:  URL + anon key para el panel
vercel.json           Cabeceras de seguridad
supabase/migrations/  Esquema SQL (tablas, RLS, bucket)
docs/loanix/          Contrato del proyecto
```

## Puesta en marcha

### 1) Supabase
1. Crea un proyecto `somos-aurora` (región sugerida: `sa-east-1`).
2. En **SQL Editor**, pega y ejecuta `supabase/migrations/0001_init.sql` (crea tablas, RLS y el bucket `evidencias`).
3. **Auth → Providers → Email:** desactiva *"Allow new users to sign up"*.
4. **Auth → Users → Add user:** crea el/los admin (correo + contraseña).
5. Copia de **Project Settings → API**: `Project URL`, `anon public` y `service_role`.

### 2) Vercel
1. El repo ya está conectado. En **Project → Settings:**
   - **Root Directory:** raíz del repo (déjalo vacío).
   - **Environment Variables** (Production + Preview):
     ```
     SUPABASE_URL=...
     SUPABASE_ANON_KEY=...            (anon public)
     SUPABASE_SERVICE_ROLE_KEY=...    (SECRETA)
     IP_SALT=texto-largo-aleatorio
     ```
2. Haz **Redeploy**. Listo: el formulario guarda en Supabase y el panel vive en `/admin`.

### 3) Local (opcional)
```bash
npm i -g vercel
cp .env.example .env.local   # pon tus valores
vercel dev
```

## Flujo semanal (panel `/admin`)
1. Entra con tu correo/contraseña.
2. Revisa las opiniones en la **tabla** (filtros, orden, **Exportar CSV**).
3. **Generar informe** (usa el rango de fechas; por defecto, últimos 7 días): calcula conteos y propone el **top 5–10**; edítalo.
4. **Publicar top** → se guarda el informe y el top aparece en la web pública.
5. **Archivar y limpiar** (escribe `BORRAR`): elimina las opiniones crudas del rango y sus fotos. **Conserva** informes y top.

## Seguridad
- `service_role` solo en variables de entorno de Vercel. Nunca en el navegador ni en el repo.
- RLS activo: `anon` no puede leer `submissions`; sí puede leer el top publicado.
- Signup de Auth deshabilitado → solo los admins creados a mano pueden entrar.
