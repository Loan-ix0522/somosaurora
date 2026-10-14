# DECISIONS — Somos Aurora

Registro de decisiones y temas abiertos.

## Decididas (2026-10-14)
1. **Login admin → Supabase Auth** (email+password). Signup público deshabilitado.
2. **Top semanal → por frecuencia/categoría, sin IA.** El admin puede editar/reordenar/quitar antes de publicar. IA queda para v2.
3. **Fotos → Supabase Storage** (bucket privado `evidencias`). Se purgan junto con la semana.
4. **Base de datos → nuevo proyecto Supabase `somos-aurora`** dedicado.
5. **Hosting → Vercel** (actualizado 2026-10-14). Deploy automático desde GitHub `Somosaurora/somosaurora`. Se abandonan Netlify y la opción Cloudflare; el backend se escribe como **Vercel Edge Functions** en `/api`. `netlify.toml` y `_headers` se reemplazan por `vercel.json`.
6. **Inserción pública vía Function con service role** (sin claves en el navegador); admin vía supabase-js + RLS.
7. **Estructura del repo → plana en la raíz** (actualizado 2026-10-14). Se saca todo de la subcarpeta `somos aurora/` para que Vercel funcione con Root Directory por defecto.
8. **Entrega de cambios → Pull Request** (fork `Loan-ix0522` → `Somosaurora/somosaurora:main`); el dueño hace Merge. La cuenta de GitHub disponible aquí solo tiene lectura en el repo.

## Abiertas / pendientes
- **[BLOQUEANTE para desplegar] Proyecto Supabase:** el dueño lo crea manualmente y dará acceso/credenciales. Hasta entonces: preparar SQL de migración + código, sin aplicar.
- **Límite Free de 2 proyectos activos por org:** verificar al crear; si topa, pausar uno o usar otra cuenta.
- **Cloudflare Turnstile:** ¿se activa en v1? (recomendado si llega spam). Por defecto: honeypot + rate-limit; Turnstile opcional.
- **Vercel Root Directory:** confirmar que esté en la raíz del repo (vacío) tras aplanar la estructura; si el deploy no aparece, revisar ese ajuste.
- **Pausa por inactividad (7 días, Free):** definir si se programa un ping/cron para mantener el proyecto activo.
- **Definición de "opinión fuerte" sin IA:** v1 usa heurística longitud+frecuencia + curaduría del admin. Revisar tras la primera semana real.
- **Assets finales:** pendientes de entrega por el cliente (no bloquean el backend).
