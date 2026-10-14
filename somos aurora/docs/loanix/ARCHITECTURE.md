# ARCHITECTURE — Somos Aurora

## Vista general
Sitio estático + funciones de borde en Cloudflare, con Supabase como backend (DB, Auth, Storage).

```
Visitante ─▶ index.html (Cloudflare Pages, estático)
   │ POST formulario (multipart)
   ▼
/functions/api/submit  (Cloudflare Pages Function)
   │  valida + anti-spam (honeypot, opcional Turnstile) + sube foto a Storage
   │  usa SERVICE_ROLE_KEY (server-side)
   ▼
Supabase
   ├── Postgres
   │    ├── submissions      (crudo, se purga cada semana)
   │    ├── featured_opinions (top semanal, PERSISTE)
   │    └── weekly_reports    (informes, PERSISTE)
   ├── Auth   (admins, email+password, signup público DESHABILITADO)
   └── Storage (bucket "evidencias", fotos de reportes)

Público ◀─ /functions/api/featured  (lee top vía service role, con cache) ─▶ index.html
Admin   ─▶ /admin (supabase-js en navegador, anon key + sesión JWT, RLS admin-only)
            ├─ tabla + filtros + exportar CSV
            ├─ generar informe (conteos + top por frecuencia)
            └─ archivar y limpiar (guarda report+featured, borra submissions)
```

## Componentes
- **Frontend público:** `index.html` existente (se conserva el diseño). Se cambia solo: (a) el `submit` del formulario apunta a `/functions/api/submit`; (b) la sección "Opiniones recientes" se llena desde `/functions/api/featured`.
- **Panel admin:** nueva página `/admin/` (HTML + JS con `@supabase/supabase-js`). Login con Supabase Auth. Todas las lecturas/escrituras pasan por RLS con el JWT del admin.
- **Edge (Cloudflare Pages Functions):**
  - `POST /api/submit` — entrada pública de opiniones. Clave service role solo aquí.
  - `GET /api/featured` — top público (cache corto).
  - `GET /api/report` *(opcional)* — informe público (equivalente real de `informe-demo.html`).
- **Backend gestionado:** Supabase (Postgres 17, Auth, Storage). Región sugerida: `sa-east-1` (São Paulo) por cercanía a Ecuador.

## Decisiones de borde vs. navegador
- La **inserción pública** NO usa claves en el navegador: va por la Function con service role → podemos validar, limitar y subir la foto de forma segura.
- El **admin** sí usa la `anon key` (pública por diseño) + sesión; la protección real es **RLS**.

## Despliegue
- **Cloudflare Pages** para el estático + `/functions`. Se reemplaza Netlify.
- `netlify.toml` → se migra a `_headers` (mismas cabeceras de seguridad) y `wrangler`/Pages.
- Variables/secretos en Cloudflare Pages: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, (opcional) `TURNSTILE_SECRET`.
