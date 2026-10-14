# ARCHITECTURE — Somos Aurora

## Vista general
Sitio estático + funciones de borde en **Vercel**, con **Supabase** como backend (DB, Auth, Storage). Deploy automático desde GitHub (repo `Somosaurora/somosaurora`).

```
Visitante ─▶ index.html (Vercel, estático)
   │ POST formulario (multipart)
   ▼
/api/submit  (Vercel Edge Function)
   │  valida + anti-spam (honeypot) + sube foto a Storage
   │  usa SUPABASE_SERVICE_ROLE_KEY (solo en el servidor)
   ▼
Supabase
   ├── Postgres
   │    ├── submissions      (crudo, se purga cada semana)
   │    ├── featured_opinions (top semanal, PERSISTE)
   │    └── weekly_reports    (informes, PERSISTE)
   ├── Auth   (admins, email+password, signup público DESHABILITADO)
   └── Storage (bucket privado "evidencias", fotos de reportes)

Público ◀─ /api/featured  (lee top vía anon key, con cache) ─▶ index.html
Admin   ─▶ /admin/ (supabase-js en navegador, anon key + sesión JWT, RLS admin-only)
            ├─ tabla tipo Excel + filtros + exportar CSV
            ├─ generar informe (conteos + top por frecuencia)
            └─ archivar y limpiar (guarda report+featured, borra submissions)
```

## Componentes
- **Frontend público:** `index.html` (se conserva el diseño). Cambios: (a) el `submit` del formulario va a `/api/submit` como `multipart/form-data`; (b) la sección "Opiniones recientes" se llena desde `/api/featured`.
- **Panel admin:** `/admin/index.html` (HTML + `@supabase/supabase-js` por CDN). Login con Supabase Auth. Lecturas/escrituras bajo RLS con el JWT del admin.
- **Edge (Vercel Functions, carpeta `/api`):**
  - `POST /api/submit` — entrada pública. La service_role key solo vive aquí.
  - `GET /api/featured` — top público (cache corto).
  - `GET /api/config` — URL + anon key públicas para el panel admin.
- **Backend gestionado:** Supabase (Postgres 17, Auth, Storage). Región sugerida: `sa-east-1` (São Paulo), cercana a Ecuador.

## Decisiones de borde vs. navegador
- La **inserción pública** NO usa claves en el navegador: va por `/api/submit` con service role → validamos, limitamos y subimos la foto de forma segura.
- El **admin** usa la `anon key` (pública por diseño) + sesión; la protección real es **RLS**.

## Estructura del repo (plano, raíz del repo)
```
/index.html  /informe-demo.html  /admin/index.html
/assets/*
/api/{submit,featured,config}.js   (Vercel Edge)
/vercel.json                        (cabeceras de seguridad)
/supabase/migrations/0001_init.sql
/docs/loanix/*  /design/*  /marketing/*
```
> En Vercel: **Root Directory = raíz del repo** (vacío). Variables de entorno en Project Settings.
