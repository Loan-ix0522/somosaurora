# SECURITY — Somos Aurora

## Clasificación de datos
- **PII baja/media:** nombre y celular son **opcionales**. El sitio pide explícitamente no incluir datos de terceros. El nombre real **no** se muestra en público.
- Sin datos financieros, de pago ni credenciales de usuarios finales.
- Consentimiento explícito capturado por envío (`consentimiento = true`).

## Autenticación y autorización
- **Admin:** Supabase Auth (email+password). **Signup público deshabilitado** — admins creados a mano.
- **RLS activado en todas las tablas:**
  - `submissions`: sin acceso para `anon`. `authenticated` (admin) puede `SELECT/UPDATE/DELETE`. Inserción solo vía service role (Function).
  - `featured_opinions`: `SELECT` público (anon); escritura solo admin/service role.
  - `weekly_reports`: `SELECT` público; escritura solo admin/service role.
- La `service_role key` vive **solo** en variables de entorno de Cloudflare; nunca en el navegador ni en el repo.

## Entrada y anti-abuso
- Validación en Function `/api/submit`: tipos permitidos, longitudes, consentimiento obligatorio, tamaño de foto ≤ 5 MB, MIME de imagen.
- **Honeypot** (`bot-field`) ya existe; se mantiene. Opcional: **Cloudflare Turnstile** (captcha gratis) para frenar spam.
- Rate limiting básico por `ip_hash` (hash, no IP cruda) en la Function.
- Cabeceras de seguridad vía `_headers` (migradas de `netlify.toml`): `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, + CSP a definir.

## Storage
- Bucket `evidencias` **privado**. Subidas solo vía service role. Las fotos no se exponen públicamente en v1.
- Al purgar la semana se borran también los objetos de Storage de esos envíos.

## Operación sensible: purga
- "Archivar y limpiar" es **destructivo**. Flujo obligatorio: generar informe → revisar → exportar CSV → confirmar (doble confirmación) → borrar solo `submissions` + sus fotos. `weekly_reports` y `featured_opinions` nunca se tocan.

## Secretos
- `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET` → secretos de Cloudflare Pages.
- `SUPABASE_ANON_KEY`, `SUPABASE_URL` → públicos por diseño (pueden ir al cliente admin).
- Nada de claves en el repositorio. `.gitignore` cubre `.dev.vars`, `.env`.
