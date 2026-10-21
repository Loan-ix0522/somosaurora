# SECURITY — Somos Aurora

Clasificación de riesgo LOAN-IX: **HIGH** (formulario público + panel admin + fotos + RLS + secretos). Última revisión: 2026-10-21 (incluye Comunidad JUMP).

## Clasificación de datos
- **PII baja/media:** nombre y celular son **opcionales**. El sitio pide explícitamente no incluir datos de terceros. El nombre real **no** se muestra en público.
- Sin datos financieros, de pago ni credenciales de usuarios finales.
- Consentimiento explícito por envío: `consentimiento = true` + `consent_version` (versión de la política aceptada) + `consent_at` (hora del servidor). Migración 0004. Los envíos anteriores quedan con esos dos campos vacíos.
- Las fotos se reducen en el navegador antes de enviarse (≤ 1600 px, JPEG), lo que además quita los datos de ubicación (EXIF) de los celulares.
- Retención: 30 días, automática (`/api/purge`, ver README), salvo opiniones marcadas "En gestión".
- **Contador de visitas (migración 0006):** cada página pública abierta guarda página, hora, **IP**, ciudad y país aproximados (cabeceras de Vercel), tipo de aparato, dominio de procedencia y un código anónimo del navegador (`localStorage`). La IP es dato personal: `/api/purge` la borra a los 30 días (`borrar_ip_visitas()`); el resto queda como estadística. Declarado en `politica-datos.html` (punto 2, 3, 4 y 6; base legal: interés legítimo).

## Autenticación y autorización
- **Admin:** Supabase Auth (email+password). **Signup público deshabilitado** (confirmado por el dueño) — admins creados a mano. Solo los correos de `public.admins` pasan `is_admin()` (migración 0002).
- **RLS activado en todas las tablas:**
  - `submissions`: sin acceso para `anon`. Solo admins (`is_admin()`). Inserción solo vía service role (Function).
  - `featured_opinions` / `weekly_reports`: `SELECT` público (anon); escritura solo admins.
  - `purga_log`: lectura solo admins.
- La `service_role key` vive **solo** en variables de entorno de Vercel; nunca en el navegador ni en el repo.

## Entrada y anti-abuso (`/api/submit`)
En orden, antes de tocar la base de datos:
1. **Mismo origen** (`Origin` = el propio sitio) y cuerpo ≤ 4,4 MB (Vercel rechaza > 4,5 MB).
2. **Prueba de trabajo** (estilo ALTCHA, sin terceros): `GET /api/submit` entrega un desafío firmado con HMAC y ligado al hash de IP; el navegador lo resuelve al abrir el formulario y lo manda en `X-Aurora-Pow`. Caduca a los 15 min y no se acepta antes de 4 s. La firma usa `IP_SALT` (≥ 16 caracteres; si falta, la prueba se desactiva y el formulario sigue funcionando).
3. **Límites por conexión (hash de IP)**: 5 envíos / 10 min y 30 / día; **tope global** 400 / hora. Los límites son holgados a propósito (varias personas comparten una misma IP móvil).
4. **Honeypot** (`bot-field`), **listas permitidas** de tipo, tema y sector, largos máximos, celular con formato.
5. **Fotos**: ≤ 4 MB; el formato se verifica por el contenido real (JPG, PNG, WEBP, GIF, HEIC), no por el tipo que declare el navegador; se guarda con tipo y extensión deducidos. Si el insert falla, la foto subida se borra.
6. Respuestas de error genéricas: nunca se devuelve detalle interno de la base de datos.

Límites del diseño (honestos): la prueba de trabajo frena scripts, no a una persona decidida con tiempo. Para eso existe el siguiente nivel: **Cloudflare Turnstile** (gratis; implica un tercero y habría que nombrarlo en la política de datos).

## Navegador y cabeceras (`vercel.json`)
- **CSP con hashes** para los `<script>` en línea (sin `unsafe-inline` en scripts), `connect-src` restringido (público: solo el propio sitio; admin: solo el proyecto Supabase), `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`.
- **Mantenimiento obligatorio:** al editar un `<script>` en línea de cualquier página hay que correr `node scripts/csp.mjs` (recalcula los hashes). Si se olvida, el navegador bloquea ese script. `node scripts/csp.mjs --check` verifica sin modificar.
- HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP `same-origin`.
- El panel carga `supabase-js` con **SRI** (hash fijo): si el CDN sirviera otro archivo, el navegador no lo ejecuta.
- Sin recursos de terceros en la página pública salvo Google Fonts (se quitó una imagen enlazada desde un portal inmobiliario).
- El panel escapa todo texto que viene del público y el CSV exportado neutraliza fórmulas de Excel (`= + - @`).

## Anti-scraping / anti-bots
Capas (ninguna es infalible; juntas suben mucho el costo):
1. `robots.txt` (solo detiene a quien lo respeta) y cabecera `X-Robots-Tag: noai, noimageai`.
2. **Bloqueo por User-Agent** en `vercel.json` → `/api/blocked` (403): rastreadores de IA (GPTBot, ClaudeBot, PerplexityBot, CCBot, Bytespider, FirecrawlAgent…), bibliotecas HTTP genéricas (curl, python-requests, Go-http-client, axios…), navegadores sin interfaz y peticiones sin User-Agent. Googlebot/Bing y las vistas previas de WhatsApp/Facebook siguen permitidos. `/api/purge` está exento (lo protege su secreto).
3. **Vercel Firewall (panel de Vercel, lo configura el dueño)**: Bot Protection, AI Bots y una regla de rate limit sobre `/api/submit`. Un bot que falsifique su User-Agent solo se frena aquí.
4. Lo que se publica en la web es público por diseño; lo privado (opiniones, nombres, celulares, fotos) nunca sale del panel autenticado.

## Contador de visitas (`/api/track`)
- Solo `POST` desde el mismo sitio (Origin o `Sec-Fetch-Site: same-origin`), cuerpo ≤ 2 KB con solo `path`, `vid` y `ref`; responde 204 siempre y nunca devuelve datos.
- Escribe con la service role a través de `registrar_visita()` (`security definer`, ejecutable solo por `service_role`), que limpia cada campo y no cuenta recargas (mismo código + misma página en 10 s).
- `visitas` tiene RLS: lectura solo para `is_admin()`; `anon` y `authenticated` sin escritura. `estadisticas_visitas()` corre con los permisos de quien llama (otra cuenta ve ceros).
- No cuenta `/admin`, ni User-Agents de bots (además del bloqueo de `vercel.json`).
- Riesgo aceptado: alguien con un navegador real puede inflar el conteo cambiando el código anónimo; es una estadística, no un control. Si pasa, poner un límite de tasa a `/api/track` en el Firewall de Vercel.

## Storage
- Bucket `evidencias` **privado**. Subidas solo vía service role. Las fotos no se exponen públicamente; el admin las abre con URL firmada de 120 s.
- Al purgar (manual o automática) se borran también los objetos de Storage de esos envíos.

## Operación sensible: purga
- Manual ("Archivar y limpiar"): destructiva, exige escribir `BORRAR`; respeta las opiniones "En gestión".
- Automática (`/api/purge`): exige `Authorization: Bearer CRON_SECRET`, falla cerrado sin secreto, fotos primero, tope de 1000 por ejecución. `weekly_reports` y `featured_opinions` nunca se tocan.

## Secretos
- `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `IP_SALT` → solo variables de entorno de Vercel.
- `SUPABASE_ANON_KEY`, `SUPABASE_URL` → públicos por diseño (los entrega `/api/config` al panel).
- Nada de claves en el repositorio. `.gitignore` cubre `.env*` (salvo `.env.example`).

## Comunidad JUMP (2026-10-19)

Superficie nueva: la app `jump/comunidad/` (HTML estático + módulos), cinco funciones `api/jump-*.js` (admin, clave, config, y los dos avisos de Zoom), 14 tablas `jump_*` y 3 buckets de Storage (portadas públicas; material y muro privados) en un **proyecto de Supabase propio de JUMP** (`supabase/jump/0001_comunidad_jump.sql`), y la conexión con Zoom por OAuth. Clasificación: **HIGH** (cuentas con clave, panel de equipo, cédula y WhatsApp de personas, OAuth de un tercero).

### Cómo está cerrado
- **Un proyecto aparte.** JUMP no comparte base, llaves ni variables con La Aurora: `JUMP_SUPABASE_URL`, `JUMP_SUPABASE_ANON_KEY` y `JUMP_SUPABASE_SERVICE_ROLE_KEY`, sin respaldo en las de La Aurora. Sin ellas el servidor no llama a ninguna base y `/api/jump-config` responde 503.
- **Nadie se registra solo.** Las cuentas las crea el equipo (la guía manda apagar "Allow new users to sign up"). Cada persona tiene una fila en `jump_miembros` con rol (`admin`/`emprendedor`) y estado (`activa`/`suspendida`); sin fila no hay acceso a nada.
- **La base es la barrera, no la pantalla.** Las 14 tablas tienen RLS, `anon` no tiene ningún permiso, y quien escribe contenido, cuentas o bitácora lo hace por la API con `service_role` (siempre detrás de `exigirAdmin`: mismo origen + token + admin activo + sin cambio de clave pendiente) o por funciones `security definer` con `search_path` fijo. La app solo esconde lo que la base ya niega.
- **La `service_role` solo vive en Vercel.** El navegador recibe la URL y la llave pública (`/api/jump-config`); no hay ninguna llave en el código del cliente.
- **Zoom.** Los tokens se guardan cifrados en `jump_zoom` (sin permisos para ninguna sesión), nunca salen del servidor y el navegador solo ve el correo y el nombre de la cuenta conectada. El `state` del OAuth va firmado, vence a los 10 minutos y se amarra a una cookie `HttpOnly` del navegador que lo inició; el aviso de desautorización de Zoom se acepta solo con su firma HMAC y marca de tiempo.
- **Texto de personas siempre como texto.** Todo lo que escribe alguien (nombres, publicaciones, comentarios) pasa por `esc()` antes de entrar al HTML. Los enlaces tienen restricción en la propia tabla (`video_url` solo YouTube/Vimeo, `join_url` solo `zoom.us`, grabaciones y material solo `https://`) y el reproductor incrustado usa una lista de dominios permitidos.
- **CSP de `/jump`** (generada por `scripts/csp.mjs`): solo habla con la base de JUMP; la de La Aurora no cambió.

### Casos de abuso → prueba → resultado
Las pruebas unitarias corren contra un simulador de Supabase con Postgres real (PGlite: RLS, Auth y Storage) y las de pantalla contra un Chrome real (`tests/jump/ui/cdp.mjs`, escritorio y móvil). Última corrida: **109/109** unitarias y **112/112** escenarios de pantalla (consola sin errores). Los nombres son los de la prueba, tal como salen en `node --test`.

| Caso de abuso | Prueba | Resultado |
|---|---|---|
| Alguien sin cuenta, o con sesión pero sin ser de JUMP, intenta leer | «quien no es miembro de JUMP no lee nada de JUMP, ni con sesión iniciada»; «anon no puede leer jump_miembros»; «S, N y U no ven nada de contenido»; «anon (sin sesión) no tiene ningún permiso sobre las tablas de JUMP» | Nada visible |
| Adivinar claves | «clave mala → invalid_credentials»; pantalla `ingreso-malo` | Mensaje genérico, sin decir si el usuario existe |
| Cuenta suspendida o baneada que sigue conectada | «suspender E: no entra y su token viejo ya no ve nada; reactivar lo revierte»; «ban: E baneada no entra (user_banned)»; pantallas `ingreso-suspendida`, `suspendida-en-uso` | Pierde el acceso al instante, con el token viejo también |
| Clave temporal reutilizada o sin cambiar | «clave temporal»; «jump-clave en el primer ingreso: privacidad, vencimiento y cambio»; «clave nueva: el token viejo ya no ve contenido y la nueva clave temporal sirve» | Obliga a cambiarla; la anterior deja de servir |
| Cambiar la clave de otra persona o sin la actual | «jump-clave desde el perfil exige la clave actual»; «jump-clave: sin token 401, suspendida 403, sin cuenta JUMP 403, otro origen 403» | Rechazado |
| Emprendedor se sube de rol o se reactiva | «E no puede cambiar su rol ni su estado»; «la bitácora y las cuentas solo las cambia el servidor, no una sesión» | Rechazado por permisos de tabla y RLS |
| Emprendedor escribe contenido, avisos o material | «E no escribe contenido ni avisos»; «Storage: E no sube a jump-material ni a jump-portadas; A sí» | Rechazado |
| Emprendedor usa acciones del equipo (crear cuentas, suspender, Zoom, ejemplos) | «sin token 401, emprendedor 403, admin suspendido 403, otro origen 403»; «un emprendedor no puede cargar ni borrar ejemplos»; «zoom-iniciar: emprendedor 403» | 401/403 |
| Admin suspendido sigue escribiendo | «A escribe contenido; un admin suspendido no» | Rechazado |
| Un admin se suspende a sí mismo, o dos a la vez dejan el equipo vacío | «A no puede suspenderse a sí mismo»; «no deja el equipo sin nadie activo (carrera entre dos admins que se suspenden)»; pantalla `equipo-rechazo` | Siempre queda alguien activo |
| Ver datos de otras personas (cédula, WhatsApp) | «E solo ve su fila de jump_miembros; A ve todas»; «jump_directorio muestra 'María V.' y no expone cédula ni whatsapp»; «jump_conteos: el equipo recibe los conteos; un emprendedor, null» | Solo nombre corto; el resto, solo el equipo |
| Ver mentorías en borrador, sus módulos o su material | «E ve P y sus módulos, no ve B ni sus módulos»; «E no ve C2 (de un borrador)»; «Storage: E lee material de P, no de B»; «Storage: URL firmada del material de P sí, de B no; y se descarga» | Solo lo publicado |
| Marcar avance a nombre de otra persona o de un módulo ajeno | «E no inserta progreso a nombre de otro ni de un módulo de B» | Rechazado |
| Entrar a una clase de Zoom fuera de hora, o leer los enlaces | «jump_entrar_clase da el enlace en la ventana y falla fuera»; «E no lee jump_clases_zoom» | El enlace solo sale dentro de la ventana |
| Publicar o comentar a nombre de otra persona | «E no publica a nombre de E2»; «E no edita el texto de su post»; «post solo con foto vale; la foto debe estar en la carpeta del autor»; «Storage: E sube a jump-muro/<su id>/…, no a la carpeta de E2» | Rechazado |
| Llenar el muro (spam, textos o fotos gigantes) | «el 11.º post en 24 h falla con limite_publicaciones»; «el 51.º comentario en 24 h falla con limite_comentarios»; «post vacío sin foto falla; post de 1001 caracteres falla; comentario de 501 falla»; «Storage: los buckets quedan con sus límites»; pantalla `muro-limite` | Tope por persona y por tamaño |
| Contenido que no debe verse | «A oculta: E2 deja de verlo, E (autor) lo sigue viendo, A lo ve»; «no se comenta un post oculto»; pantalla `muro-ocultar` | Oculto para el resto, visible para su autor y el equipo |
| Borrar lo de otra persona | «E2 borra solo su comentario; E borra su post» | Solo lo propio |
| Código escrito en un nombre, post o comentario | pantalla `muro-xss`; «embedVideo devuelve null para todo lo demás» | Se muestra como texto, no se ejecuta |
| Volver al login desde otra cuenta o abrir rutas de otro rol | pantallas `ruta-ajena`, `sesion-separada` | Cada rol ve solo lo suyo |
| Falsificar el regreso de Zoom (state alterado, vencido, sin cookie, cancelado, admin inactivo) | «callback con state alterado, sin la cookie del navegador, cancelado o con admin inactivo → no conecta nada»; «state firmado: válido, alterado y vencido» | No conecta nada |
| Falsificar el aviso de desautorización de Zoom | «deauth: firma mala, sin firma o vieja → 401; la validación de URL devuelve el HMAC; app_deauthorized borra solo la cuenta conectada» | 401; solo con firma válida |
| Sacar los tokens de Zoom | «cifrado ida y vuelta; alterado falla»; «zoom-estado muestra la cuenta conectada sin tokens»; «las llaves de Zoom (jump_zoom) no se tocan con una sesión: solo con service_role»; «conectar otra cuenta revoca la anterior; volver a conectar la misma no revoca» | Cifrados; ninguna sesión los lee |
| Zoom sin configurar o caído | «sin ZOOM_CLIENT_ID: zoom-iniciar 503 y zoom-estado configurada:false»; «zoom-reunion con el token vencido: refresca, guarda el refresh rotado y crea la reunión en hora de Guayaquil»; «zoom-reunion: id inválido 400, clase inexistente 404, refresh rechazado por Zoom 409»; pantallas `zoom-no-configurado`, `zoom-sin-respuesta` | Aviso claro, sin romper nada |
| Mezclar JUMP con La Aurora | «las variables de JUMP son propias: las de La Aurora Escucha no se usan, ni como respaldo»; «/api/jump-config entrega la URL y la llave pública de JUMP; nunca la service_role ni nada de La Aurora»; «/api/jump-config sin configurar responde 503 y no entrega la base de La Aurora»; «la CSP de /jump solo deja hablar con la base de JUMP, y la de La Aurora no cambia»; «la migración de JUMP corre sola, en una base de Supabase sin nada de La Aurora Escucha» | Separados |
| Alguna tabla o función quedó abierta por olvido | «toda tabla jump_* tiene RLS (y la consulta de control sí detecta una que no)»; «ninguna función jump_* la puede ejecutar anon, y las de security definer fijan su search_path»; «la bitácora y las cuentas solo las cambia el servidor, no una sesión» | Se revisa el catálogo de Postgres, no casos sueltos |
| Entradas raras a la API | «ids inválidos → 400 (nunca llegan a la ruta de Auth)»; «acción desconocida → 400»; «la misma cédula otra vez → 409 sin usuario huérfano»; «si Auth ya tiene el correo (huérfano) → 409 y no se toca»; «si el insert en jump_miembros falla, se borra el usuario de Auth (compensación) y responde 500» | Errores claros; sin cuentas a medias |
| Borrar de más al quitar los datos de ejemplo | «borrar exige escribir BORRAR; con BORRAR no queda nada de ejemplo y lo real sigue»; «cargar crea el contenido del mockup; cargar otra vez → 409»; «las cédulas de ejemplo son válidas, empiezan con 30 y nadie las ve como clave»; pantalla `ejemplos-borrar` | Solo se borra lo marcado de ejemplo |
| Cargar algo que la política de contenido no deja | pantalla `csp` en cada grupo (ingreso, emprendedor, admin, muro, ajustes) | Cero violaciones de CSP |

### Hallazgo de la revisión y arreglo
- **Menor (defensa en profundidad):** al mirar el catálogo de Postgres, `authenticated` conservaba `INSERT` y `DELETE` de tabla sobre `jump_miembros` (el permiso que Supabase da de fábrica). La RLS ya los negaba por no tener políticas de escritura, pero era una sola capa: una política `for all` puesta por error habría abierto altas y cambios de rol desde el navegador. Arreglo: `revoke insert, update, delete on table public.jump_miembros from authenticated;` en la migración. Prueba: `tests/jump/superficie.test.mjs` («la bitácora y las cuentas solo las cambia el servidor, no una sesión») falló antes y pasa después.
- Revisado sin hallazgos: toda `service_role` está detrás de `exigirAdmin`, token, `state`+cookie o HMAC; ningún secreto en el cliente; los 65 puntos que marcó el rastreo de texto sin `esc()` son constantes, texto de avisos o ya escapados; los errores 500 son genéricos; las 14 tablas tienen RLS.

### Riesgos aceptados
- **Dirección de Zoom en Ajustes.** `Ajustes → Conectar Zoom` hace `location.assign()` a la URL que devuelve `/api/jump-admin`; solo la puede pedir un admin activo del mismo origen y el servidor la arma sobre `https://zoom.us/oauth/authorize`. No se re-valida en el navegador. Si se quiere una capa más: comprobar ese prefijo antes de navegar.
- **Intentos de clave.** Los limita Supabase Auth por IP; no hay CAPTCHA. Si aparece fuerza bruta: Supabase Auth → Attack Protection.
- **Datos de ejemplo y reales conviven** en el mismo proyecto (cada fila de ejemplo está marcada `es_ejemplo` y el panel muestra una franja mientras existan). Antes de cargar datos reales: borrar los ejemplos (la guía lo pide).
- **La CSP de `/jump` solo deja hablar con la base de JUMP** (`JUMP_SUPABASE_HOST` en `scripts/csp.mjs`, hoy `https://yibbjwpitawmfnrnyjek.supabase.co`, el proyecto creado el 2026-10-21). Si esa dirección no coincide con el proyecto real, no deja hablar con ninguna base: falla cerrado. Si se cambia de proyecto, hay que editarla y correr `node scripts/csp.mjs`.
- **Aviso de «hecho» en pantalla.** Es cosmético (el aviso muestra siempre el mismo ícono, también para rechazos); no afecta la seguridad.

## Pendiente / riesgos aceptados
- Turnstile (o equivalente) si el spam supera a las capas actuales.
- CAPTCHA en el inicio de sesión del panel (Supabase Auth → Attack Protection) si se detectan intentos de fuerza bruta; hoy lo limita Supabase por IP.
- La prueba de trabajo no es de un solo uso (se acota con el límite por conexión).
- Comunidad JUMP: ver sus riesgos aceptados en su sección, arriba.
