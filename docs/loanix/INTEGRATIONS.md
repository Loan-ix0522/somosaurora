# INTEGRATIONS — Somos Aurora

| Servicio | Uso | Plan | Notas |
|----------|-----|------|-------|
| **Supabase** | Postgres + Auth + Storage | Free | Proyecto dedicado `somos-aurora` (lo crea el dueño del producto). Región sugerida `sa-east-1`. Ojo: límite Free de 2 proyectos activos por org. |
| **Vercel** | Hosting estático + Edge Functions (`/api`) | Free | Deploy automático desde GitHub `Somosaurora/somosaurora`. Root Directory = raíz del repo. |
| **GitHub** | Repositorio / origen del deploy | — | `github.com/Somosaurora/somosaurora`, rama `main`. |
| **Google Fonts** | Tipografías (Allura, DM Sans, Montserrat) | Free | Ya en uso. |
| **Cloudflare Turnstile** | Captcha anti-spam (opcional, futuro) | Free | Aún no activado. |

## Variables de entorno (Vercel → Settings → Environment Variables)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (publishable, pública)
- `SUPABASE_SERVICE_ROLE_KEY` (secreta — solo en Vercel, nunca en el navegador ni en el repo)
- `IP_SALT` (texto aleatorio para el hash de IP anti-abuso)

## Pendiente de credenciales (lo entrega el dueño)
- Crear el proyecto Supabase `somos-aurora` y pasar `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- (O reconectar el MCP de Supabase a la cuenta correcta para que yo aplique la migración.)

## Integraciones futuras (no v1)
- Avisos por WhatsApp/SMS al ciudadano (el campo `celular` ya se captura).
- IA (Claude) para clustering semántico del top.
- Generación asistida del reel a partir del top semanal.
