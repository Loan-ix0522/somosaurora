# INTEGRATIONS — Somos Aurora

| Servicio | Uso | Plan | Notas |
|----------|-----|------|-------|
| **Supabase** | Postgres + Auth + Storage | Free | Proyecto dedicado `somos-aurora` (lo crea el dueño del producto). Región sugerida `sa-east-1`. Ojo límite Free de 2 proyectos activos por org. |
| **Cloudflare Pages** | Hosting estático + Functions (edge) | Free | Reemplaza Netlify. `/functions/api/*`. |
| **Cloudflare Turnstile** | Captcha anti-spam (opcional) | Free | Si se activa: `TURNSTILE_SECRET` en Pages. |
| **Google Fonts** | Tipografías (Allura, DM Sans, Montserrat) | Free | Ya en uso. |

## Pendiente de credenciales (lo entrega el dueño)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (publishable)
- `SUPABASE_SERVICE_ROLE_KEY` (secreta)
- Acceso al proyecto (o reconectar el MCP de Supabase a la cuenta correcta).

## Integraciones futuras (no v1)
- Envío de avisos por WhatsApp/SMS al ciudadano (campo `celular` ya se captura).
- IA (Claude) para clustering semántico del top.
- Generación asistida del reel a partir del top semanal.
