# DECISIONS — Somos Aurora

Registro de decisiones y temas abiertos.

## Decididas (2026-10-14)
1. **Login admin → Supabase Auth** (email+password). Signup público deshabilitado.
2. **Top semanal → por frecuencia/categoría, sin IA.** El admin puede editar/reordenar/quitar antes de publicar. IA queda para v2.
3. **Fotos → Supabase Storage** (bucket privado `evidencias`). Se purgan junto con la semana.
4. **Base de datos → nuevo proyecto Supabase `somos-aurora`** dedicado.
5. **Hosting → Cloudflare Pages + Functions.** Se abandona Netlify (el `netlify.toml` se migra a `_headers`).
6. **Inserción pública vía Function con service role** (sin claves en el navegador); admin vía supabase-js + RLS.

## Abiertas / pendientes
- **[BLOQUEANTE para desplegar] Proyecto Supabase:** el dueño lo crea manualmente y dará acceso/credenciales. Hasta entonces: preparar SQL de migración + código, sin aplicar.
- **Límite Free de 2 proyectos activos por org:** verificar al crear; si topa, pausar uno o usar otra cuenta.
- **Cloudflare Turnstile:** ¿se activa en v1? (recomendado si llega spam). Por defecto: honeypot + rate-limit; Turnstile opcional.
- **Pausa por inactividad (7 días, Free):** definir si se programa un ping/cron para mantener el proyecto activo.
- **Definición de "opinión fuerte" sin IA:** v1 usa heurística longitud+frecuencia + curaduría del admin. Revisar tras la primera semana real.
- **Assets finales:** pendientes de entrega por el cliente (no bloquean el backend).
