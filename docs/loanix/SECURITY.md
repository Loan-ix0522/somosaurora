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
  - `informe_publico`: `SELECT` público (anon); `DELETE` solo admins; sin `INSERT`/`UPDATE` desde el navegador (solo el servidor).
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

## Informe público (`/api/informe`, `/api/informe-auto`, `/api/informe-admin`)
- **Qué se publica:** solo **conteos por tema y fechas**; ningún texto, nombre, celular, foto ni IP. Cada informe es una fila de `informe_publico` (migración 0007: `origen`, `periodo_desde`, `periodo_hasta`, `total`, `por_tema`).
- **`informe_publico` (RLS activo):** `SELECT` público (son solo conteos); `DELETE` solo `is_admin()` (retirar un informe); **nadie inserta ni actualiza desde el navegador, ni siquiera un admin** (no hay política y además se quitan los permisos de tabla). Solo escribe el servidor con la service role, que es quien cuenta las opiniones: un porcentaje nunca llega desde el navegador.
- **`GET /api/informe` (público):** sin `?consulta` (cada consulta distinta saltaría la caché de Vercel y golpearía la base → 400). Devuelve el último informe publicado (solo tema y porcentaje, y aparte los temas sin opiniones; sin ids ni cantidades de ningún tipo: ni el total, ni por tema, ni cuántas llegaron desde el corte). Si aún no hay informe, o falta la migración, devuelve el conteo en vivo de los últimos 30 días.
- **Cómo se cuenta:** `submissions` no se puede leer en público, así que el servidor la consulta con la service role pero únicamente pide el **conteo** (`HEAD` + `Prefer: count=exact`, 1 por tema + 1 del total): ninguna fila sale de la base. Los temas salen de una lista fija (`api/_informe.js`); una prueba vigila que sea la misma que acepta `api/submit.js`. Lo que no coincide va a «Otros temas».
- **Caché:** `s-maxage=300` y `max-age=60`. Los errores responden 502 genérico, sin detalles, y `no-store`.
- **`GET /api/informe-auto` (Vercel Cron, 07:30 UTC):** exige `Authorization: Bearer CRON_SECRET` (≥ 16 caracteres, comparación en tiempo constante); sin secreto responde 503 y no hace nada. Publica solo si pasaron 5 días **y** hay al menos 10 opiniones nuevas; si no, no cambia nada y el informe vigente se mantiene. `?dry=1` calcula sin guardar. Los errores salen genéricos; el detalle va solo a los registros del servidor.
- **`POST /api/informe-admin` (panel):** solo desde el mismo sitio (Origin o `Sec-Fetch-Site: same-origin`); cuerpo JSON ≤ 1 KB con exactamente `accion` (`calcular` | `publicar`), `desde` y `hasta`. Exige `Authorization: Bearer <sesión>` y la verifica en cada llamada con `rpc/is_admin` usando el token de esa persona (no hay lista de admins en el servidor). El rango se valida (fechas reales, `desde` ≤ `hasta`, ni en el futuro, máximo 31 días) y no se publica un informe vacío.
- **Riesgos aceptados:** (1) si el equipo usa «Archivar y limpiar» a mano, esas opiniones salen del conteo en vivo que se muestra mientras no haya informe publicado (los informes ya publicados no cambian). (2) Un informe manual de fechas antiguas reinicia el reloj de 5 días a partir del final de ese rango. (3) Pulsar «Publicar» dos veces seguidas puede dejar dos filas iguales; el panel deshabilita el botón mientras trabaja y se puede retirar la repetida.

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
Las pruebas unitarias corren contra un simulador de Supabase con Postgres real (PGlite: RLS, Auth y Storage) y las de pantalla contra un Chrome real (`tests/jump/ui/cdp.mjs`, escritorio y móvil). Última corrida (2026-10-23, con postulaciones): **130/130** unitarias y **134/134** escenarios de pantalla (consola sin errores). Los nombres son los de la prueba, tal como salen en `node --test`.

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

### Postulaciones desde la página de JUMP (2026-10-23)
Superficie nueva: el formulario «Postula» de `/jump/` (público, sin sesión) → `POST /api/jump-postular` (Edge, `service_role`) → tabla `jump_postulaciones` (`supabase/jump/0002_postulaciones.sql`), y la vista **Postulaciones** del panel del equipo. Datos personales: nombres y WhatsApp de quien postula, su emprendimiento y su sector.

- **Nadie escribe directo en la base.** Ni `anon` ni `authenticated` tienen `INSERT`; solo la API, que valida cada campo con las mismas reglas que la tabla (largos, celular `09xxxxxxxx`, listas cerradas de rubro y RUC). La tabla vuelve a revisarlo con sus `check`.
- **Freno a abusos.** Solo desde el mismo sitio, cuerpo de hasta 4 KB, campo trampa para robots, hasta 5 postulaciones por conexión cada 24 h y el mismo WhatsApp no se duplica. La conexión se guarda como huella HMAC (clave derivada de `JUMP_SECRET`), nunca la IP.
- **Quién ve qué.** Solo un admin activo (`jump_es_admin()`) las lee, cambia su estado (solo esa columna) o las borra. La huella de la conexión no se puede leer desde el navegador (permiso por columna).
- **Texto como texto.** Lo que escribe quien postula pasa por `esc()` en el panel y el enlace de WhatsApp se arma con el número ya normalizado.
- **Privacidad.** El formulario enlaza a la sección «postulaciones» de `jump/comunidad/privacidad.html` (qué se guarda, quién lo ve, para qué y cómo pedir que se borre). El panel recuerda usarlas solo para la convocatoria y permite borrarlas.

| Caso de abuso | Prueba | Resultado |
|---|---|---|
| Escribir postulaciones directo en la base, sin pasar por la API | «desde el navegador nadie crea postulaciones (solo la API, con service_role)» | Rechazado |
| Leer las postulaciones sin ser del equipo | «anon, emprendedores, suspendidas y cuentas en primer ingreso no las ven» | Nada visible |
| Sacar la huella de la conexión o cambiar los datos de quien postuló | «el equipo las ve, pero no el hash de la conexión»; «el equipo cambia el estado, pero no los datos de la persona» | Solo nombres, contacto y estado; solo cambia el estado |
| Borrar postulaciones sin ser del equipo | «el equipo borra una postulación; un emprendedor no» | Rechazado |
| Enviar desde otro sitio o datos fuera de forma | «solo POST y solo desde este mismo sitio»; «cada dato inválido responde 400 con su campo»; «la base rechaza datos fuera de forma aunque vengan con service_role» | 403 / 400 por campo; la tabla también lo rechaza |
| Llenar la tabla con robots o envíos en masa | «el campo trampa para robots responde ok pero no guarda nada»; «más de 5 postulaciones en un día desde la misma conexión → 429»; «el mismo WhatsApp otra vez no se duplica»; pantalla `landing-limite` | No se guarda; 429 con aviso en la página |
| Guardar la IP de quien postula | «una postulación válida se guarda normalizada y sin la IP cruda» | Solo una huella HMAC |

Riesgo aceptado: el límite por conexión se salta cambiando de IP; si llega spam de verdad, el paso siguiente es Turnstile (ya listado en «Pendiente»). El equipo puede borrar lo que llegue.

### Encuestas de JUMP (2026-10-26)
Superficie nueva: la «Encuesta del mes» (`supabase/jump/0003_encuestas.sql`: 3 tablas y 9 funciones). Votan cualquier visitante de `/jump/` (público, sin sesión) por `GET`/`POST /api/jump-publico` (Edge, `service_role`) y los inscritos desde la comunidad; los inscritos también proponen un curso; el equipo arma, abre, cierra y borra encuestas desde su panel. Datos: el voto de cada inscrito (con su cuenta), las ideas propuestas (con quién las propuso) y, del voto público, huellas HMAC del aparato y de la conexión.

- **Nadie escribe votos directo.** Los inscritos votan y proponen por funciones (`jump_votar`, `jump_proponer`) que revisan que sean miembros activos y que la encuesta siga abierta. El voto público solo lo guarda la API, con `jump_voto_publico`, que solo puede ejecutar `service_role`.
- **Freno a votos en masa.** Solo desde el mismo sitio, cuerpo de hasta 1 KB, un voto por aparato (se puede cambiar) y hasta 30 aparatos por conexión y encuesta (en IPv6 cuenta la red /64). El tope se revisa y el voto se guarda en un solo paso, con un candado por encuesta y conexión: muchos votos a la vez no lo pasan.
- **Quién ve qué.** Afuera (página pública e inscritos) solo porcentajes, nunca cantidades ni quién votó. Quién propuso cada idea y los votos por origen los ve solo el equipo (`jump_encuesta_conteos`); cada inscrito solo sabe cuál es la suya. `propuesta_por` y las huellas no se pueden leer desde el navegador (permiso por columna).
- **Huellas que vencen.** Las huellas del voto público se borran 30 días después de cerrar la encuesta (`jump_olvidar_huellas`, en cada lectura de `/api/jump-publico` y en cada voto); el voto sigue contando. Nunca se guarda la IP ni el id del aparato, solo su HMAC (clave derivada de `JUMP_SECRET`).
- **El panel guarda en un paso.** `jump_guardar_encuesta` corre con los permisos de quien llama (`security invoker`), solo para un admin activo, y si algo falla no deja nada a medias. Borra solo las opciones que el equipo quitó, nunca las ideas que llegaron mientras editaba.
- **Una idea por persona y encuesta**, también desde dos pestañas a la vez (candado en `jump_proponer` e índice único).
- **Lectura pública con caché en Vercel.** `GET /api/jump-publico` lo guarda la red de Vercel 30 s (`Vercel-CDN-Cache-Control`); el navegador no (`no-cache`). No sale nada que no sea público: ni ejemplos, ni borradores, ni Zoom, ni mensajes de las clases.

| Caso de abuso | Prueba | Resultado |
|---|---|---|
| Leer o votar sin sesión directo en la base | «anon no lee ni ejecuta nada de encuestas» | Nada visible ni ejecutable |
| Escribir votos directo o leer las huellas | «nadie inserta votos directo ni lee las huellas»; «el voto público solo lo guarda la API (service_role), con el tope por conexión en la base» | Rechazado |
| Votar en masa desde una conexión | «tope por conexión: el aparato 31 desde la misma IP → 429, otra IP sí»; «tope por conexión con 60 votos a la vez desde la misma IP: entran 30»; «tope por conexión en IPv6: las direcciones de una misma red /64 cuentan como una conexión»; pantalla `landing-voto-tope` | 429 con aviso en la página |
| Votar dos veces con el mismo aparato | «votar: un voto por aparato, cambiarlo no duplica» | Cambia el voto, no suma otro |
| Votar desde otro sitio o con datos fuera de forma | «votar valida origen, método, cuerpo y opción» | 403 / 400 |
| Votar en una encuesta cerrada, de ejemplo o en borrador | «en una encuesta cerrada no se vota ni se propone»; «en una encuesta de ejemplo no se vota desde la página»; «GET nunca devuelve encuestas de ejemplo» | 409 / rechazado |
| Ver borradores o datos privados desde la página pública | «el emprendedor ve la abierta y las cerradas, no los borradores»; «GET da la próxima clase sin datos privados y sin ejemplos ni borradores» | Solo lo publicado |
| Saber quién propuso o votó por cada idea | «quién propuso cada idea lo ve solo el equipo; cada inscrito sabe cuál es la suya»; «resultados: porcentajes sin conteos para el emprendedor; conteos por origen solo para el equipo» | Solo el equipo |
| Proponer varias ideas (también desde dos pestañas) o repetir una | «proponer crea la opción, vota por ella y solo una vez»; «una idea por persona y encuesta, aunque proponga desde dos pestañas a la vez»; pantalla `comunidad-idea-repetida` | Una por persona; la repetida se rechaza |
| Suspendida que sigue votando | «suspendida no vota» | Rechazado |
| Emprendedor que arma o edita encuestas | «el equipo arma la encuesta; un emprendedor no»; «el equipo guarda la encuesta en un paso: puede intercambiar dos textos y, si algo falla, no cambia nada» | Rechazado |
| Un voto apuntando a una opción de otra encuesta | «un voto no puede apuntar a una opción de otra encuesta» | Rechazado por la tabla |
| Guardar huellas para siempre | «las huellas del voto público se borran 30 días después de cerrar la encuesta; el voto sigue contando»; «GET borra las huellas de las encuestas cerradas hace más de 30 días» | Se borran; el voto queda |
| Perder ideas de los inscritos al guardar en el panel | pantallas `panel-guardar-conserva-ideas`, `panel-intercambiar-textos` | Las ideas y sus votos siguen |
| Sin la 0003 aplicada | «sin la tabla de encuestas (falta la 0003) GET responde 200 con encuesta null»; pantallas `sin-0003`, `panel-sin-0003` | Sin errores; el panel dice qué falta |

Riesgos aceptados:
- **El tope por conexión no es un tope por persona.** Borrando los datos del navegador se puede votar otra vez, hasta 30 aparatos por conexión. Al revés, una red con muchas personas detrás de la misma IP (un colegio, una operadora móvil) puede llegar al tope: el aviso dice que intenten desde otra red. La encuesta orienta al equipo; no decide nada sola.
- **Reabrir una encuesta cerrada hace más de 30 días** deja votar otra vez a quien ya votó desde la página pública (sus huellas ya se borraron). Reabrir una cerrada hace menos, no.
- **Resultados de hasta 90 s** para quien no acaba de votar (30 s de caché en Vercel y hasta 60 s más mientras la renueva). Quien acaba de votar pide los suyos frescos.

## Pendiente / riesgos aceptados
- Turnstile (o equivalente) si el spam supera a las capas actuales.
- CAPTCHA en el inicio de sesión del panel (Supabase Auth → Attack Protection) si se detectan intentos de fuerza bruta; hoy lo limita Supabase por IP.
- La prueba de trabajo no es de un solo uso (se acota con el límite por conexión).
- Comunidad JUMP: ver sus riesgos aceptados en su sección, arriba.
