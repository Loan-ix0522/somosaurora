# Somos Aurora

Plataforma de escucha ciudadana de **La Aurora (Daule)**. Landing pública + formulario de opiniones, panel administrativo privado e informe semanal.

- **Frontend:** estático (`index.html`, `admin/index.html`) — se conserva el diseño original.
- **Backend:** Supabase (Postgres + Auth + Storage).
- **Hosting:** Vercel (estático + Edge Functions en `/api`), deploy automático desde GitHub.

## Estructura
```
index.html            Landing pública (formulario + top en vivo)
informe-demo.html     Informe ciudadano (el último informe publicado o, si aún no hay, el conteo en vivo; lo dibuja informe.js)
informe.js            Pide /api/informe y /api/featured y dibuja la página del informe
admin/index.html      Panel privado (login, tabla Excel, informe, informe público, limpieza)
admin/panel-informe.js  Pestaña «Informe público» del panel (vista previa, publicar y retirar)
api/submit.js         GET: desafío anti-bot · POST: guarda opiniones (usa service_role, server-side)
api/featured.js       GET:  top público del último informe
api/informe.js        GET:  el último informe publicado (o, si no hay, los porcentajes de los últimos 30 días); solo conteos
api/informe-auto.js   GET:  publica el informe cada 5 días (la llama Vercel Cron)
api/informe-admin.js  POST: calcula o publica un informe a mano desde el panel (verifica que sea admin)
api/config.js         GET:  URL + anon key para el panel
api/purge.js          GET:  limpieza automática de 30 días (la llama Vercel Cron)
api/blocked.js        GET:  destino (403) de los clientes automatizados bloqueados
robots.txt            Rastreadores de IA no autorizados
scripts/csp.mjs       Recalcula la CSP de vercel.json (hashes de los scripts en línea)
vercel.json           Cabeceras de seguridad, redirecciones y los crons diarios (limpieza e informe)
supabase/migrations/  Esquema SQL (tablas, RLS, bucket)
docs/loanix/          Contrato del proyecto
```

## Puesta en marcha

### 1) Supabase
1. Crea un proyecto `somos-aurora` (región sugerida: `sa-east-1`).
2. En **SQL Editor**, ejecuta en orden `supabase/migrations/0001_init.sql` (tablas, RLS y el bucket `evidencias`), `0002_admins_y_destacadas.sql` (solo los admins listados entran al panel) y `0003_retencion_30_dias.sql` (limpieza automática) y `0004_consentimiento_versionado.sql` (versión de la política y hora de aceptación de cada opinión), `0006_contador_visitas.sql` (contador de visitas) y `0007_informe_publico.sql` (informe ciudadano publicado cada 5 días).
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
     CRON_SECRET=texto-aleatorio-de-32+-caracteres   (activa la limpieza automática)
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
5. **Archivar y limpiar** (escribe `BORRAR`): limpieza manual, antes de tiempo, de las opiniones del rango y sus fotos. **Conserva** informes, top y las opiniones *En gestión*.

## Informe ciudadano público (cada 5 días)
La página `informe-demo.html` muestra los porcentajes por tema de las opiniones reales (solo conteos; nunca textos, nombres ni fotos). Cada informe publicado es una fila de la tabla `informe_publico` (migración `0007`).

- **Automático:** cada día a las 07:30 UTC (02:30 en Ecuador) Vercel Cron llama a `/api/informe-auto`. Si ya pasaron 5 días desde el último informe **y** llegaron al menos 10 opiniones nuevas, publica uno nuevo con las opiniones de ese periodo. Si llegaron menos de 10 **no publica**: el informe anterior se mantiene y el periodo sigue acumulando hasta que alcancen. El primer informe cuenta los últimos 30 días.
- **Manual:** en `/admin` → pestaña **Informe público** el equipo elige un rango de fechas (hasta 31 días), ve la **vista previa** y lo **publica**. También puede **retirar** un informe (vuelve a verse el anterior). Un informe manual reinicia el reloj de los 5 días.
- **Mientras no haya ninguno publicado** (o si falta aplicar la migración) la página muestra el conteo en vivo de los últimos 30 días. La página muestra solo el periodo y los porcentajes (nunca cuántas opiniones hay) y `/api/informe` tampoco manda cantidades.
- **Activarlo (una sola vez):** aplica `0007_informe_publico.sql` en el SQL Editor de Supabase y haz Redeploy. Usa el mismo `CRON_SECRET` de la limpieza: no hay variables nuevas. Sin la migración, `/api/informe-auto` responde 500 con el aviso "Falta aplicar la migración 0007_informe_publico.sql."
- **Comprobarlo:** el panel muestra el informe vigente y cuándo toca el próximo. Para probar sin publicar:
  ```bash
  curl -A "Mozilla/5.0" -H "Authorization: Bearer <CRON_SECRET>" "https://www.laauroraescucha.com/api/informe-auto?dry=1"
  ```
- Es independiente de **Generar informe** del flujo semanal (ese arma el top de comentarios destacados de la portada).

## Limpieza automática (30 días)
La Política de tratamiento de datos personales promete borrar las opiniones y sus fotos a los 30 días. Se hace sola:

- **Qué hace:** cada día a las 07:00 UTC (02:00 en Ecuador) Vercel Cron llama a `/api/purge`, que borra las opiniones con más de 30 días y sus fotos del bucket `evidencias`. No toca informes ni opiniones destacadas (ya anónimas).
- **Excepción "En gestión":** en el panel, abre una opinión (doble clic) y pulsa *Mantener en gestión* mientras haya un trámite abierto ante una institución. Esa opinión no se borra hasta que la quites de gestión. La columna **Se borra** muestra cuántos días le quedan.
- **Activarla (una sola vez):** aplica la migración `0003`, crea la variable `CRON_SECRET` en Vercel (cualquier texto aleatorio de 32+ caracteres, en Production) y haz Redeploy. Sin `CRON_SECRET` el endpoint responde 503 y no borra nada.
- **Comprobarla:** el panel muestra "Última limpieza" (fecha y conteos, o el error). Para probar sin borrar, en Vercel → Settings → Cron Jobs → *Run*, o:
  ```bash
  curl -H "Authorization: Bearer <CRON_SECRET>" "https://www.laauroraescucha.com/api/purge?dry=1"
  ```
  `?dry=1` solo cuenta lo que se borraría. Cada ejecución borra hasta 1000 opiniones; si sobran, siguen al día siguiente. Si falla el borrado de fotos, no se borra la fila y se reintenta.

## Seguridad
Detalle y límites en `docs/loanix/SECURITY.md`. Lo esencial:
- `service_role` solo en variables de entorno de Vercel. Nunca en el navegador ni en el repo.
- RLS activo: `anon` no puede leer `submissions`; sí puede leer el top publicado.
- Signup de Auth deshabilitado → solo los admins creados a mano pueden entrar.
- `/api/purge` y `/api/informe-auto` exigen `Authorization: Bearer CRON_SECRET` (Vercel lo envía solo); sin secreto configurado no hacen nada.
- `/api/informe-admin` solo responde a un admin con sesión (se verifica con `is_admin()` en cada llamada) y desde el mismo sitio. Los porcentajes los cuenta siempre el servidor, nunca vienen del navegador.
- **Si editas un `<script>` en línea** de cualquier página (`index.html`, `admin/index.html`, `terminos.html`, `politica-datos.html`, `informe-demo.html`), corre `node scripts/csp.mjs` antes de subir. La CSP solo deja correr los scripts cuyo hash conoce; si se olvida, la página pierde su JavaScript.
- **Si cambias el texto de la Política de datos**, cambia también `CONSENT_VERSION` en `api/submit.js` (debe ser la fecha de "Última actualización").
- Las pruebas con `curl` a la web las bloquea el filtro anti-bots; agrega un navegador de verdad: `curl -A "Mozilla/5.0" ...`. `/api/purge` está exento (con `/api/informe-auto` agrega el `-A` de navegador).

### Vercel Firewall (lo activa el dueño en el panel de Vercel; incluido en el plan Hobby)
Proyecto → **Firewall** → **Configure / Rules**:
1. **Bot Management → Bot Protection:** primero *Log*; tras un par de días sin falsos positivos, *Challenge*. Después de activarlo, pulsa *Run* en Settings → Cron Jobs y revisa que la limpieza siga funcionando.
2. **Bot Management → AI Bots:** *Deny* (bloquea a los bots de IA que se identifican).
3. **Rate limit** (1 regla gratis): ruta `/api/submit`, ventana 60 s, 20 solicitudes por IP, acción por defecto (429).
4. **Emergencia:** *Attack Challenge Mode* (en la página Firewall del proyecto) mientras dure un ataque; apágalo después.
