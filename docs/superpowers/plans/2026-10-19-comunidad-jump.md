# Comunidad JUMP: plan de implementación

> **Para quien ejecute:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguir el avance.

**Objetivo:** convertir el mockup aprobado `mockups/jump/plataforma.html` en la plataforma real de la Comunidad JUMP. Incluye:
- cuentas con cédula/usuario y clave;
- mentorías con módulos de video o en vivo, y material;
- clases con Zoom por OAuth;
- avisos;
- muro;
- datos de ejemplo que se pueden borrar.

JUMP usa **su propio proyecto de Supabase** (en la misma organización que el de La Aurora Escucha) y el mismo proyecto de Vercel.

> **Enmienda del 2026-10-20 (decisión del usuario):** se separó la base. Antes JUMP compartía el Supabase de La Aurora; ahora no. Cambios que ya están en el código:
> - la migración pasó de `supabase/migrations/0005_comunidad_jump.sql` a `supabase/jump/0001_comunidad_jump.sql`, sin la precondición de la 0002 ni el endurecimiento de `is_admin()` (no hacen falta);
> - variables `JUMP_SUPABASE_URL`, `JUMP_SUPABASE_ANON_KEY` y `JUMP_SUPABASE_SERVICE_ROLE_KEY`, sin respaldo en las de La Aurora;
> - el navegador lee `/api/jump-config` (nuevo) en vez de `/api/config`;
> - la CSP de `/jump` nombra solo la base de JUMP (`JUMP_SUPABASE_HOST` en `scripts/csp.mjs`);
> - `crearBase()` de las pruebas aplica solo la migración de JUMP.
>
> Las Tasks 1, 2, 3, 5 y 9 describen el estado anterior; el código vigente manda sobre lo que digan.

**Arquitectura:**
- **Página estática** `jump/comunidad/`, con módulos ES que usan supabase-js 2.45.4 desde la CDN con SRI. Las lecturas y escrituras van directo a Supabase y las decide RLS.
- **Acciones privilegiadas** (cuentas, claves, Zoom y ejemplos) en funciones Edge de Vercel, `api/jump-*.js`, que usan `service_role` después de verificar el JWT y el rol.
- **Pruebas** con un "Supabase simulado": PGlite (Postgres real con RLS) detrás de un servidor HTTP que imita el subconjunto de PostgREST, Auth y Storage que usa la app.

**Tecnología:**
- HTML, CSS y JS sin compilación.
- Funciones Edge de Vercel (`runtime: "edge"`).
- Postgres 15+ con RLS.
- Pruebas: `node --test` (Node 24), `@electric-sql/pglite`, `@supabase/supabase-js@2.45.4` (solo pruebas) y `@vercel/routing-utils`. También Chrome sin cabeza por CDP.

**Diseño (spec):** `docs/superpowers/specs/2026-10-19-comunidad-jump-design.md`, con muro aprobado por el usuario el 2026-10-19. Para lo visual valen `mockups/jump/plataforma.html`, `mockups/jump/DESIGN.md` y `mockups/jump/.impeccable/surfaces/plataforma-html.md`.

## Restricciones globales

**Repo y entrega**
- Se trabaja en el clon `C:/Users/Luisma/AppData/Local/Temp/claude/C--Users-Luisma-Downloads-somos-aurora/d2e4364c-b507-4eb9-a85c-b8d36b1a8a50/scratchpad/deploy`, rama `feat/comunidad-jump` creada desde `origin/main` (el fork `Loan-ix0522/somosaurora`).
- Al cerrar cada tarea se copian los archivos nuevos o cambiados a `C:/Users/Luisma/Downloads/somos aurora` (la carpeta del dueño, sin git).
- No se hace push sin preguntar al usuario.
- Commits con la línea final `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Supabase y seguridad**
- Proyecto Supabase **propio de JUMP** (el de La Aurora, `jdterctcniotbipgwcdv`, no se toca). El MCP de Supabase de esta sesión (inmoai) **no se toca**. El dueño crea el proyecto y aplica la migración en su SQL Editor.
- Variables de entorno de Supabase: `JUMP_SUPABASE_URL`, `JUMP_SUPABASE_ANON_KEY`, `JUMP_SUPABASE_SERVICE_ROLE_KEY`, **sin respaldo** en las de La Aurora (`SUPABASE_URL||ProjectURL`…). Variables nuevas: `JUMP_SECRET` (≥ 32 caracteres), `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_WEBHOOK_SECRET`, `JUMP_PUBLIC_URL`. Los secretos nunca en el chat ni en el repo.
- Correos internos: `c<cedula>@cuentas.laauroraescucha.com` y `<usuario>@equipo.laauroraescucha.com`.
- Clave temporal `JUMP-####-####`, que vence en 7 días. Clave nueva: ≥ 8 caracteres y al menos un número.
- Ventana de Zoom: desde 15 min antes del inicio hasta 30 min después del fin. Zona horaria `America/Guayaquil` (UTC−5, sin horario de verano).
- Límites:
  - muro: texto ≤ 1000 caracteres; comentario ≤ 500;
  - fotos del muro y portadas: ≤ 5 MB;
  - material: ≤ 20 MB;
  - publicaciones: ≤ 10 por persona en 24 h; comentarios: ≤ 50 en 24 h (decisión del plan).
- Sesión de supabase-js con `storageKey: "jump-auth"`, para no mezclarla con el `/admin/` de La Aurora en el mismo dominio.
- Riesgo **ALTO** (loanix-security-core). Cada caso de abuso de la spec §14 tiene su prueba, y la evidencia queda en `docs/loanix/SECURITY.md`.

**Copia y diseño**
- Español de Ecuador. "Comunidad"/"sector", nunca "barrio". Lenguaje que no presupone género. Ningún testimonio, cifra ni patrocinador inventado.
- Nunca `assets/josue.webp`. Los vectores `#jump-letters` y `#fig-glyph` se copian tal cual.
- `dvh`, nunca `vh`. Amarillo solo para lo actual. Avance en tinta.

**CSP**
- Las páginas de JUMP no llevan `<script>` en línea.
- Después de tocar `vercel.json` o cualquier script en línea se corre `node scripts/csp.mjs`; `node scripts/csp.mjs --check` debe decir "CSP al día.".

**Pruebas**
- Las dependencias de prueba viven solo en `tests/jump/` (su propio `package.json`, `node_modules` ignorado) y `tests/` va en `.vercelignore`.

## Foco de revisión

1. **Sesión compartida con `/admin/` de La Aurora** (mismo origen). Esperado: entrar a JUMP no deja a nadie conectado en `/admin/` ni al revés. Lo prueba la Tarea 9 (`localStorage` solo tiene `jump-auth`).
2. **Navegador en otra zona horaria.** Esperado: un admin cuyo equipo está en UTC programa "jue 19:00" y se guarda 19:00 de Guayaquil; el emprendedor ve 19:00. Lo prueba la Tarea 9 (`fechas.test.mjs` corre con `TZ=UTC` y con `TZ=Asia/Tokyo`).
3. **Suspensión con la sesión abierta.** Esperado: en la siguiente navegación la persona ve "Tu cuenta está suspendida…" y vuelve al ingreso, sin pantallas en blanco ni errores crudos. Lo prueba la Tarea 10.
4. **Doble clic o red lenta en "Crear cuenta", "Publicar" o "Comentar".** Esperado: una sola cuenta, publicación o comentario, y el botón deshabilitado mientras espera. Lo prueban las Tareas 11 y 12.
5. **Datos escritos con otro formato.** Esperado: se aceptan y normalizan
   - cédula con espacios o guiones;
   - WhatsApp como `+593 99 123 4567` o `099-123-4567` (se guarda `0991234567`);
   - videos `youtu.be/…`, `youtube.com/shorts/…` y `vimeo.com/…`;
   - fotos HEIC que el navegador no puede leer: mensaje claro y nada se sube.

   Lo prueban las Tareas 4 (cédula, WhatsApp), 9 (videos) y 12 (foto ilegible).

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/jump/0001_comunidad_jump.sql` | Tablas, funciones, RLS, buckets y políticas de Storage, plantilla del primer admin (proyecto de Supabase propio de JUMP) |
| `api/jump-config.js` | URL y llave pública del proyecto de JUMP para el navegador |
| `api/_jump/env.js` | Lectura de variables con *fallback* |
| `api/_jump/http.js` | `json()`, `mismoOrigen()`, `leerJson()` |
| `api/_jump/supa.js` | `rest()`, `authAdmin()`, `authUsuario()` contra Supabase |
| `api/_jump/acceso.js` | `usuarioDelToken()`, `exigirAdmin()` |
| `api/_jump/secretos.js` | AES-GCM, `state` firmado, clave temporal, validación de clave |
| `api/_jump/normalizar.js` | WhatsApp, nombres y textos |
| `api/_jump/cuentas.js` | Acciones de cuentas (crear, clave nueva, suspender, reactivar) |
| `api/_jump/zoom.js` | Cliente de Zoom y acciones de Zoom |
| `api/_jump/ejemplos.js` | Datos de ejemplo: definición, cargar, contar, borrar |
| `api/jump-admin.js` | Punto único `POST {accion}` para el equipo: enruta a cuentas, zoom o ejemplos |
| `api/jump-clave.js` | Cambio de clave (primer ingreso y perfil) + aceptación de privacidad |
| `api/jump-zoom-callback.js` | Regreso de OAuth de Zoom |
| `api/jump-zoom-deauth.js` | Webhook de Zoom (validación de URL y `app_deauthorized`) |
| `jump/comunidad/index.html` | Marco: fuentes, sprite SVG, `#app`, toast, diálogos, scripts |
| `jump/comunidad/privacidad.html` | Aviso de privacidad (borrador para Josué) |
| `jump/comunidad/app.css` | CSS del mockup sin la franja demo, más muro y ajustes |
| `jump/comunidad/assets/*.webp` | Portadas de ejemplo copiadas de `mockups/jump/assets/` (las 8 que usa el mockup) |
| `jump/comunidad/js/cedula.js` | Validación de cédula y usuario, correos internos (lo usa también `api/`) |
| `jump/comunidad/js/fechas.js` | Fechas en Guayaquil (puro, se prueba en Node) |
| `jump/comunidad/js/medios.js` | `embedVideo()`, `reducirFoto()`, `icsDeClase()` |
| `jump/comunidad/js/ui.js` | `$ $$ esc ic fig logo toast copiar fieldErr hop ocupado` |
| `jump/comunidad/js/datos.js` | **Único** módulo que habla con Supabase y con `/api/jump-*` |
| `jump/comunidad/js/vistas-ingreso.js` | Ingreso, primer ingreso (clave + privacidad), avisos de cuenta |
| `jump/comunidad/js/vistas-emprendedor.js` | Inicio, mentorías, aula, clases, avisos, perfil |
| `jump/comunidad/js/vistas-admin.js` | Resumen, mentorías, clases, emprendedores, avisos |
| `jump/comunidad/js/vistas-editor.js` | Editor de mentoría |
| `jump/comunidad/js/vistas-muro.js` | Muro (emprendedor y moderación) |
| `jump/comunidad/js/vistas-ajustes.js` | Zoom, equipo JUMP, datos de ejemplo |
| `jump/comunidad/js/app.js` | Arranque, sesión, rutas, `shell`, registro de acciones |
| `scripts/csp.mjs`, `vercel.json` | Regla CSP `/jump/(.*)`, exclusión de `/jump` en la pública, UA-block exento para el webhook |
| `.vercelignore`, `.env.example` | `tests` fuera del deploy; variables nuevas documentadas |
| `tests/jump/package.json` | Dependencias de prueba |
| `tests/jump/sim/base.sql` | Imitación mínima de Supabase: roles, `auth`, `storage` |
| `tests/jump/sim/db.mjs` | `crearBase()`, `como()` |
| `tests/jump/sim/servidor.mjs` | Supabase simulado por HTTP + sitio estático con cabeceras de `vercel.json` + `/api/*` reales + Zoom falso |
| `tests/jump/*.test.mjs` | Pruebas de Node |
| `tests/jump/ui/cdp.mjs` | Pruebas de interfaz en Chrome sin cabeza |
| `docs/jump/PUESTA-EN-MARCHA.md` | Guía en español para el dueño |
| `docs/loanix/SECURITY.md` | Sección JUMP con evidencia de casos de abuso |

---

### Task 1 (Tarea 1): Base de pruebas con Postgres real

**Archivos:**
- Crear: `tests/jump/package.json`, `tests/jump/sim/base.sql`, `tests/jump/sim/db.mjs`, `tests/jump/base.test.mjs`, `.vercelignore`.
- Modificar: `.gitignore` (agregar `tests/jump/node_modules/`).

**Interfaces:**
- Produce `crearBase({ hasta = "0005" } = {}) -> Promise<PGlite>`. Aplica `base.sql` y luego las migraciones `supabase/migrations/0001…` hasta `hasta` inclusive, en orden. `hasta: "0001"` aplica solo la 0001.
- Produce `como(db, quien, sql, params = []) -> Promise<{ rows }>`. `quien` es `"anon"`, `"service"` o `{ id, email }`. Abre una transacción con `set local role` (`anon` / `service_role` / `authenticated`), `set_config('request.jwt.claims', …, true)` con `{sub, email, role}` y hace commit.
- Produce `nuevoUsuario(db, { email, password }) -> Promise<uuid>`. Inserta en `auth.users`.

- [ ] **Paso 1: Crear la rama.** `git -C <repo> fetch origin && git -C <repo> switch -c feat/comunidad-jump origin/main`.
- [ ] **Paso 2: `tests/jump/package.json`.** `{"private":true,"type":"module","scripts":{"test":"node --test"}}`. Correr `npm i -D @electric-sql/pglite @supabase/supabase-js@2.45.4 @vercel/routing-utils` dentro de `tests/jump`. Fijar las versiones exactas que queden en `package.json`.
- [ ] **Paso 3: `base.sql`.** Debe contener:
  - roles `anon`, `authenticated` y `service_role` (este último `bypassrls`);
  - esquema `auth` con `users(id uuid pk default gen_random_uuid(), email text unique, encrypted_password text, banned_until timestamptz, raw_user_meta_data jsonb default '{}')`;
  - `auth.uid()`, `auth.jwt()` y `auth.role()`, que leen `request.jwt.claims` como en Supabase;
  - esquema `storage` con `buckets(id text pk, name text, public bool, file_size_limit bigint, allowed_mime_types text[])`, `objects(id uuid pk default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now(), unique(bucket_id, name))` con RLS activada, y `storage.foldername(text) returns text[]`;
  - `grant usage` en `public`, `auth` y `storage` a los tres roles;
  - `alter default privileges in schema public grant all on tables to anon, authenticated, service_role` (como Supabase);
  - `grant all on storage.objects to authenticated, service_role`.

  Para `pgcrypto` se carga la extensión contrib de PGlite.
- [ ] **Paso 4: Escribir la prueba que falla `tests/jump/base.test.mjs`.**
  ```js
  test("0001-0004 aplican y is_admin() es falso para anon y para un usuario cualquiera", async () => {
    const db = await crearBase({ hasta: "0004" });
    assert.equal((await como(db, "anon", "select public.is_admin() a")).rows[0].a, false);
    const id = await nuevoUsuario(db, { email: "x@y.com", password: "p" });
    assert.equal((await como(db, { id, email: "x@y.com" }, "select public.is_admin() a")).rows[0].a, false);
  });
  test("un correo de admins es admin", async () => { /* insert admins 'somosaurora.daule@gmail.com' → true */ });
  ```
- [ ] **Paso 5: Correr y ver que falla.** `cd tests/jump && node --test base.test.mjs`. Esperado: FAIL ("crearBase is not a function" o similar).
- [ ] **Paso 6: Implementar `db.mjs`** con las firmas de arriba.
- [ ] **Paso 7: Correr y ver que pasa.** Mismo comando. Esperado: 2 pasan.
- [ ] **Paso 8: `.vercelignore`.** Contenido `tests`. Commit: `test(jump): base de Postgres simulado para probar RLS`.

### Task 2 (Tarea 2): Migración 0005, parte 1 (miembros, contenido, clases y avisos)

**Archivos:**
- Crear: `supabase/migrations/0005_comunidad_jump.sql`, `tests/jump/sim/escenario.mjs`, `tests/jump/rls-contenido.test.mjs`.

**Interfaces:**
- Produce las tablas de la spec §8, con los nombres exactos de la spec y estos detalles:
  - `id uuid default gen_random_uuid()`;
  - en tablas que llenan los miembros, `user_id`/`autor_id` `default auth.uid()`;
  - `es_ejemplo boolean not null default false`.
- Columnas extra: `jump_mentorias.creada_en` y `jump_clases.creada_en`.
- Restricciones `check`:
  - `jump_miembros.rol in ('admin','emprendedor')`, `estado in ('activa','suspendida')`;
  - `cedula ~ '^\d{10}$'`, `usuario ~ '^[a-z0-9._-]{3,30}$'`, `whatsapp ~ '^09\d{8}$'`;
  - `(rol='emprendedor' and cedula is not null) or (rol='admin' and usuario is not null)`;
  - `jump_modulos.tipo in ('video','vivo')`;
  - `video_url ~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)/'`;
  - `jump_materiales.tipo in ('archivo','enlace')`, con `ruta` si es archivo y `url ~ '^https://'` si es enlace;
  - `jump_clases_zoom.join_url ~ '^https://([a-z0-9-]+\.)?zoom\.us/'`;
  - `jump_clases.grabacion_url ~ '^https://'`;
  - `jump_mentorias.portada ~ '^(assets/[a-z0-9-]+\.webp|[0-9a-f-]{36}/[a-z0-9._-]+)$'`.
- Funciones (todas con `security definer`, `set search_path = public`, `revoke all … from public`, `grant execute … to authenticated`):
  - `jump_es_miembro() returns boolean`;
  - `jump_es_admin() returns boolean`;
  - `jump_mentoria_visible(p uuid) returns boolean`: publicada, o el que pregunta es admin;
  - `jump_yo() returns setof jump_miembros`: devuelve la fila propia sin importar su estado. Si `ultimo_ingreso` es nulo o tiene más de 10 min, lo actualiza;
  - `jump_actualizar_perfil(p_negocio text, p_whatsapp text) returns void`. Exige `jump_es_miembro()`; el negocio entre 1 y 80 caracteres; el WhatsApp ya normalizado `^09\d{8}$` o vacío (vacío = null);
  - `jump_entrar_clase(p_clase uuid) returns text`. Exige `jump_es_miembro()` y la clase visible. Fuera de la ventana lanza `raise exception 'fuera_de_ventana'`, y `'sin_enlace'` si no hay fila en `jump_clases_zoom`. Hace upsert de `jump_asistencia.entro_en = now()` y devuelve `join_url`.
- Va al principio del archivo un bloque `do $$` que lanza `'Falta aplicar 0002_admins_y_destacadas.sql: …'` si alguna de las políticas `submissions_admin_all`, `weekly_reports_admin_write`, `featured_admin_write` o `evidencias_admin_all` no contiene `is_admin()` en `qual`.
- Va después de crear `jump_miembros`: `create or replace function public.is_admin()`, igual a la 0002 más `and not exists (select 1 from public.jump_miembros m where m.user_id = auth.uid())`.
- RLS (`enable` en todas las `jump_*`; `revoke all on <tabla> from anon`):
  - `jump_miembros`: select `user_id = auth.uid() or jump_es_admin()`. Sin insert, update ni delete para `authenticated`.
  - `jump_mentorias`: select `jump_es_miembro() and (estado='publicada' or jump_es_admin())`. Para lo demás, `jump_es_admin()`.
  - `jump_modulos`, `jump_materiales`: select `jump_es_miembro() and jump_mentoria_visible(mentoria_id)`; para escribir, admin.
  - `jump_clases`: select `jump_es_miembro() and (mentoria_id is null or jump_mentoria_visible(mentoria_id))`; para escribir, admin.
  - `jump_clases_zoom`: todo `jump_es_admin()`.
  - `jump_progreso`, `jump_asistencia`, `jump_avisos_vistos`:
    - select `user_id = auth.uid() or jump_es_admin()`;
    - insert `user_id = auth.uid() and jump_es_miembro()`, y en `jump_progreso` además que el módulo sea visible;
    - delete solo lo propio.
  - `jump_avisos`: select `jump_es_miembro()`; para escribir, admin.

- [ ] **Paso 1: Escribir las pruebas que fallan en `rls-contenido.test.mjs`.** El `before()` llama a `crearEscenario(db) -> { A, E, E2, S, N, U, P, B, C1, C2, C3 }` de `tests/jump/sim/escenario.mjs`, que crea:
  - admin A;
  - emprendedoras E y E2 (activas);
  - S (suspendida);
  - N (`debe_cambiar_clave`);
  - un usuario U que existe solo en Auth;
  - una mentoría publicada P con 2 módulos y un material;
  - una mentoría en borrador B con 1 módulo;
  - una clase C1 de P que empieza en 10 min, una clase C2 de B y una clase C3 que empieza en 3 días;
  - `jump_clases_zoom` para C1 y C3.

  Pruebas (nombre → aserción):
  - `"precondición: sin 0002 la 0005 no corre"` → `crearBase` hasta 0001 y luego aplicar 0005 rechaza con `/Falta aplicar 0002/`.
  - `"E ve P y sus módulos, no ve B ni sus módulos"` → los conteos son 1/2/0/0.
  - `"E no ve C2 (de un borrador)"`.
  - `"E no lee jump_clases_zoom"` → 0 filas.
  - `"S, N y U no ven nada de contenido"` → 0 filas en mentorías, módulos, clases y avisos.
  - `"S ve su propia fila con jump_yo()"` → `estado = 'suspendida'`.
  - `"E solo ve su fila de jump_miembros"` → 1 fila; A ve todas.
  - `"E no puede cambiar su rol ni su estado"` → `update jump_miembros set rol='admin'` afecta 0 filas o da error de permiso.
  - `"jump_entrar_clase da el enlace en la ventana y falla fuera"` → C1 devuelve la URL y registra `entro_en`; C3 da `/fuera_de_ventana/`.
  - `"E no inserta progreso a nombre de otro ni de un módulo de B"`.
  - `"is_admin() es falso para un miembro de JUMP aunque su correo esté en admins"` → se inserta en `admins` el correo de E y debe dar false.
  - `"is_admin() sigue verdadero para el admin real de La Aurora"`.
  - `"E no lee submissions ni admins"` → 0 filas o permiso denegado.
  - `"jump_actualizar_perfil valida"` → `'0991234567'` OK; `'12345'` da error; negocio vacío da error.
- [ ] **Paso 2: Correr y ver que falla.** `node --test rls-contenido.test.mjs`. Esperado: FAIL (no existe la 0005).
- [ ] **Paso 3: Escribir la parte 1 de `0005_comunidad_jump.sql`** según las Interfaces.
- [ ] **Paso 4: Correr y ver que pasa.** Esperado: todas pasan.
- [ ] **Paso 5: Commit.** `feat(jump): migración 0005 — miembros, contenido, clases y avisos con RLS`.

### Task 3 (Tarea 3): Migración 0005, parte 2 (muro, Storage, Zoom, bitácora y directorio)

**Archivos:**
- Modificar: `supabase/migrations/0005_comunidad_jump.sql`.
- Crear: `tests/jump/rls-muro.test.mjs`.

**Interfaces:**
- `jump_posts` y `jump_comentarios`:
  - select: `jump_es_miembro() and (oculto_en is null or autor_id = auth.uid() or jump_es_admin())`. El comentario exige además que su post sea legible;
  - insert: `autor_id = auth.uid() and jump_es_miembro() and oculto_en is null and not es_ejemplo`, y en el comentario además que el post no esté oculto;
  - delete: solo lo propio;
  - update: `revoke update` + `grant update (oculto_en, oculto_por)` a `authenticated` + política `jump_es_admin()`.
- Triggers `before insert`:
  - `jump_limite_posts()`: más de 10 en 24 h → `raise exception 'limite_publicaciones'`;
  - `jump_limite_comentarios()`: más de 50 → `'limite_comentarios'`;
  - `jump_mentoria_actualizada()`: `actualizada_en = now()` antes de cada update de `jump_mentorias`.
- `check`:
  - `jump_posts`: `char_length(texto) <= 1000 and (char_length(btrim(texto)) > 0 or foto is not null)`;
  - `jump_comentarios`: `char_length(btrim(texto)) between 1 and 500`;
  - `foto ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'`.
- `jump_zoom` (fila única `id boolean primary key default true check (id)`): RLS activada, sin políticas, `revoke all` de `anon` y `authenticated`.
- `jump_bitacora`: select `jump_es_admin()`, sin escritura para `authenticated`.
- `jump_directorio() returns table(user_id uuid, nombre text, negocio text, rol text)`. `nombre` = primer nombre + " " + inicial del primer apellido + "."; para admins, `'Equipo JUMP'`. Si no es `jump_es_miembro()` devuelve vacío. Solo incluye miembros activos.
- `jump_storage_mentoria(name text) returns uuid`: primera carpeta como uuid, o null si no lo es (sin error).
- Buckets (con `on conflict (id) do update` de límites y tipos):
  - `jump-portadas`: público, 5242880, imágenes;
  - `jump-material`: privado, 20971520, `application/pdf`, los tipos de Office (doc, docx, xls, xlsx, ppt, pptx), `image/jpeg`, `image/png`, `image/webp`;
  - `jump-muro`: privado, 5242880, `image/webp`, `image/jpeg`.
- Políticas en `storage.objects`:
  - `jump_portadas_admin`: todo para admin en ese bucket;
  - `jump_material_leer`: `bucket_id='jump-material' and (jump_es_admin() or (jump_es_miembro() and jump_mentoria_visible(jump_storage_mentoria(name))))`;
  - `jump_material_admin`: escribir;
  - `jump_muro_leer`: `jump_es_miembro()`;
  - `jump_muro_subir`: `jump_es_miembro() and (storage.foldername(name))[1] = auth.uid()::text`;
  - `jump_muro_borrar`: carpeta propia o admin.
- Al final del archivo, en comentario, la plantilla del primer admin:
  ```sql
  -- insert into public.jump_miembros (user_id, rol, usuario, nombres, debe_cambiar_clave)
  -- select id, 'admin', 'TU_USUARIO', 'TU NOMBRE', false from auth.users where email = 'TU_USUARIO@equipo.laauroraescucha.com';
  ```

- [ ] **Paso 1: Escribir las pruebas que fallan en `rls-muro.test.mjs`** (usa `crearEscenario` de la Tarea 2).
  - `"E publica y E2 lo ve; S no ve el muro"`.
  - `"E no publica a nombre de E2"`.
  - `"E no edita el texto de su post"` → error de permiso.
  - `"A oculta: E2 deja de verlo, E (autor) lo sigue viendo, A lo ve"`.
  - `"no se comenta un post oculto"`.
  - `"el 11.º post en 24 h falla con limite_publicaciones"`.
  - `"post vacío sin foto falla; post de 1001 caracteres falla"`.
  - `"E no lee jump_zoom ni escribe jump_bitacora"`.
  - `"jump_directorio muestra 'María V.' y no expone cédula ni whatsapp"` → las columnas son exactamente `user_id, nombre, negocio, rol`.
  - `"Storage: E sube a jump-muro/<su id>/…, no a la carpeta de E2"`.
  - `"Storage: E lee material de P, no de B"`.
  - `"Storage: E no sube a jump-material ni a jump-portadas"`.
  - `"E2 borra solo su comentario"`.
- [ ] **Paso 2: Correr y ver que falla.** `node --test rls-muro.test.mjs`. Esperado: FAIL.
- [ ] **Paso 3: Completar la 0005.** Correr las dos suites. Esperado: todo pasa.
- [ ] **Paso 4: Reaplicación.** Prueba `"la 0005 se puede volver a correr sin error"`: aplicar la 0005 dos veces. Para lograrlo se usa `if not exists`, `drop policy if exists` y `create or replace`.
- [ ] **Paso 5: Commit.** `feat(jump): migración 0005 — muro, Storage, Zoom, bitácora y directorio`.

### Task 4 (Tarea 4): Utilidades compartidas del servidor y cédula

**Archivos:**
- Crear: `api/_jump/env.js`, `http.js`, `supa.js`, `acceso.js`, `secretos.js`, `normalizar.js`, `jump/comunidad/js/cedula.js`, `tests/jump/util.test.mjs`.

**Interfaces:**
- `cedula.js`:
  - `limpiarCedula(s) -> string` (solo dígitos);
  - `cedulaValida(c) -> boolean`: 10 dígitos; provincia 01–24 o 30; tercer dígito < 6; módulo 10 con coeficientes 2,1,2,1,2,1,2,1,2, restando 9 si el producto es > 9, y verificador `(10 - suma % 10) % 10`;
  - `usuarioValido(u) -> boolean` (`^[a-z0-9._-]{3,30}$`);
  - `correoEmprendedor(c)`, `correoEquipo(u)`.
- `normalizar.js`:
  - `whatsapp(s) -> string|null`: quita espacios, guiones y paréntesis, y cambia `+593`/`593` por `0`. Devuelve null si no queda `^09\d{8}$`;
  - `texto(s, max) -> string` (trim, colapsa espacios internos de líneas, corta en `max`);
  - `nombre(s) -> string|null` (2–80 caracteres).
- `env.js`: `supa() -> { url, anon, service }`, `secreto() -> string` (lanza si mide < 32), `publicUrl() -> string` (sin `/` final), `zoomCfg() -> { id, secret, webhook } | null`.
- `http.js`:
  - `json(body, status = 200) -> Response`, con `Cache-Control: no-store`;
  - `mismoOrigen(request) -> boolean`, con el mismo criterio que `api/submit.js:72-75`;
  - `leerJson(request, max = 16384) -> Promise<object|null>`.
- `supa.js`:
  - `rest(path, { method = "GET", body, prefer, jwt } = {}) -> Promise<Response>`. Usa `service_role` salvo que llegue `jwt`;
  - `authAdmin(path, { method, body }) -> Promise<Response>` (`/auth/v1/admin/...`);
  - `authUsuario(jwt) -> Promise<{id, email}|null>` (`GET /auth/v1/user`);
  - `claveCorrecta(email, clave) -> Promise<boolean>` (`POST /auth/v1/token?grant_type=password`).
- `acceso.js`:
  - `usuarioDelToken(request) -> Promise<{id,email}|null>`;
  - `exigirAdmin(request) -> Promise<{ ok: true, userId } | { ok: false, res: Response }>`. Devuelve 403 si el origen no es el mismo; 401 sin token o con token inválido; 403 si el miembro no es `admin` + `activa` + `!debe_cambiar_clave`.
- `secretos.js`:
  - `cifrar(texto) -> Promise<"v1.<iv>.<ct>">`, AES-GCM-256 con clave = SHA-256(`JUMP_SECRET + ":tokens"`), iv de 12 bytes, base64url;
  - `descifrar(sobre) -> Promise<string>`;
  - `firmar(obj, ttlSeg) -> Promise<string>` (`base64url(json).base64url(hmac)`, con `exp`);
  - `verificar(token) -> Promise<object|null>` (comparación de tiempo constante, rechaza vencido);
  - `claveTemporal() -> string`: `JUMP-####-####` con `crypto.getRandomValues` y muestreo por rechazo;
  - `errorDeClave(clave) -> string|null`. Mensajes: `"La clave debe tener al menos 8 caracteres."`, `"La clave debe tener al menos un número."`, y si coincide con `^JUMP-\d{4}-\d{4}$`, `"Elige una clave distinta a la temporal."`.

- [ ] **Paso 1: Escribir las pruebas que fallan en `util.test.mjs`.**
  - `cedulaValida("0912345675")`, con valores calculados en la prueba por una implementación de referencia escrita ahí mismo sobre 3 cédulas fijas;
  - `cedulaValida("0912345678") === false` (verificador incorrecto);
  - `"2512345678"` da false (provincia 25);
  - `"0962345678"` da false (tercer dígito 6);
  - `limpiarCedula("091-234 5675") === "0912345675"`;
  - `whatsapp("+593 99 123 4567") === "0991234567"`, `whatsapp("099-123-4567") === "0991234567"`, `whatsapp("12345") === null`;
  - `claveTemporal()` cumple `/^JUMP-\d{4}-\d{4}$/` y 200 llamadas dan ≥ 190 distintas;
  - `descifrar(await cifrar("hola")) === "hola"`; alterar un carácter del sobre lanza error;
  - `verificar(await firmar({a:1}, 60)).a === 1`; un token con firma alterada da null; `firmar(…, -1)` da null;
  - `errorDeClave("abc")`, `errorDeClave("abcdefgh")`, `errorDeClave("JUMP-1234-5678")` y `errorDeClave("clave2026") === null`;
  - `mismoOrigen` da true con Origin igual al host y false sin Origin o con otro host.

  Las pruebas fijan `process.env.JUMP_SECRET = "x".repeat(40)`.
- [ ] **Paso 2: Correr y ver que falla.** `node --test util.test.mjs`. Esperado: FAIL.
- [ ] **Paso 3: Implementar los módulos.**
- [ ] **Paso 4: Correr y ver que pasa.** Esperado: PASS.
- [ ] **Paso 5: Commit.** `feat(jump): utilidades del servidor (acceso, cifrado, cédula, normalización)`.

### Task 5 (Tarea 5): Supabase simulado por HTTP

**Archivos:**
- Crear: `tests/jump/sim/servidor.mjs`, `tests/jump/sim.test.mjs`.

**Interfaces:**
- `iniciarSim({ puerto = 0, raiz }) -> Promise<{ url, db, cerrar, crearUsuario, banear, zoomFalso }>`. Servidor HTTP en `127.0.0.1` que atiende:
  - **`/supa/rest/v1/<tabla>`**
    - Métodos `GET`, `HEAD`, `POST`, `PATCH` y `DELETE`.
    - Filtros `col=eq|neq|gt|gte|lt|lte|is|in.(…)`, `select=` (solo lista de columnas o `*`; sin embebidos), `order=col.asc|desc[.nullslast]` (varios separados por coma), `limit`, `offset`.
    - Cabeceras `Prefer: return=representation | count=exact | resolution=ignore-duplicates|merge-duplicates` + `on_conflict`, y `Accept: application/vnd.pgrst.object+json` (406 si no hay exactamente 1 fila).
    - Responde con `Content-Range`.
    - Cada consulta corre con `como()` según el JWT: rol `anon`, `authenticated` o `service_role` según la apikey/Bearer. Los errores de Postgres salen como `{code, message}` con el estado HTTP que da PostgREST: 403 para `42501`, 400 para `P0001`/`23514`/`22P02`, 409 para `23505`.
  - **`/supa/rest/v1/rpc/<fn>`**: `POST` con argumentos por nombre.
  - **`/supa/auth/v1/`**:
    - `token?grant_type=password|refresh_token`. Si el usuario está baneado responde 400 `{error_code:"user_banned"}`; con credenciales malas, 400 `{error_code:"invalid_credentials"}`;
    - `user` (`GET`), `logout`;
    - `admin/users` (`POST {email,password,email_confirm}`), `admin/users/:id` (`PUT {password|ban_duration}`, `DELETE`).
    - Los JWT son `base64url(header).base64url({sub,email,role,exp}).firma-falsa`.
  - **`/supa/storage/v1/`**:
    - `object/<bucket>/<ruta>` (`POST` sube: inserta en `storage.objects` con el rol y aplica tamaño/tipo del bucket; `GET`/`DELETE`);
    - `object/sign/<bucket>/<ruta>` (`POST {expiresIn}` → `{signedURL}` si la RLS deja leer la fila);
    - `object/public/<bucket>/<ruta>`;
    - `object/<bucket>` (`DELETE {prefixes}`).
  - **El sitio**:
    - estático desde `raiz`, con redirecciones y cabeceras de `vercel.json` aplicadas con `@vercel/routing-utils` (como el `devserver.mjs` del scratchpad);
    - `/api/config` devuelve `{url: "<origen>/supa", anonKey: "anon"}`;
    - `/api/jump-*` llama al handler real importado de `raiz/api/…`, con `process.env` apuntando a `<origen>/supa`, `JUMP_SECRET` de prueba, `ZOOM_*` falsos y `JUMP_PUBLIC_URL = origen`.
  - **Zoom falso**: cubre `zoom.us/oauth/token`, `zoom.us/oauth/revoke`, `api.zoom.us/v2/users/me` y `api.zoom.us/v2/users/me/meetings`, con un `fetch` envuelto. `zoomFalso` deja ver lo que se pidió y forzar errores.
  - **CSP en desarrollo**: como `connect-src 'self'` cubre `/supa`, la CSP real de `vercel.json` se aplica sin cambios.

- [ ] **Paso 1: Escribir las pruebas que fallan en `sim.test.mjs`**, usando `createClient` de `@supabase/supabase-js@2.45.4` contra el simulador con la 0005 y `crearEscenario`.
  - `signInWithPassword` de E funciona y `rpc("jump_yo")` devuelve su fila;
  - `from("jump_mentorias").select("id,titulo").order("titulo")` da 1 fila;
  - `insert` en `jump_progreso` + `.select().single()` da la fila;
  - `upsert` en `jump_asistencia` con `ignoreDuplicates` dos veces deja 1 fila;
  - `select("*", { count: "exact", head: true })` en `jump_avisos` da `count`;
  - Storage: `upload` a la carpeta propia funciona y a la ajena da error; `createSignedUrl` del material de P funciona y el de B da error;
  - ban: tras `banear(E)`, el login de E da `error.code === "user_banned"` (o `error.message` con `banned`; se registra cuál expone supabase-js 2.45.4 y se usa el mismo en la app).
- [ ] **Paso 2: Correr y ver que falla.** `node --test sim.test.mjs`. Esperado: FAIL.
- [ ] **Paso 3: Implementar `servidor.mjs`.**
- [ ] **Paso 4: Correr y ver que pasa.** Esperado: PASS. Correr también toda la suite: `node --test`.
- [ ] **Paso 5: Commit.** `test(jump): Supabase simulado (REST, Auth y Storage) sobre PGlite`.

### Task 6 (Tarea 6): API de cuentas y cambio de clave

**Archivos:**
- Crear: `api/_jump/cuentas.js`, `api/jump-admin.js`, `api/jump-clave.js`, `tests/jump/api-cuentas.test.mjs`.

**Interfaces:**
- `api/jump-admin.js`:
  - `export const config = { runtime: "edge" }`;
  - `POST` con cuerpo `{ accion, ... }`. Antes que nada: `mismoOrigen`, después `exigirAdmin`. Luego enruta según `accion` a `cuentas[accion]`, `zoom[accion]` o `ejemplos[accion]`, cada uno con la firma `(ctx: {userId}, body) -> Promise<Response>`. Una acción desconocida responde 400 `{error:"Acción no válida."}`. Cualquier excepción responde 500 `{error:"No se pudo completar. Intenta de nuevo."}` y `console.error` sin datos personales.
- `cuentas.js` (todas las respuestas `{ok:true,...}` o `{ok:false,error,campo?}`):
  - `"crear-cuenta"`: `{rol, cedula?, usuario?, nombres, negocio?, whatsapp?, correo?}`. Valida (400 con `campo`), crea el usuario en Auth (`email_confirm: true`, clave temporal), inserta en `jump_miembros` (`debe_cambiar_clave: true`, `clave_temporal_vence: now+7d`, `creado_por`) y escribe la bitácora. Si el insert falla, borra el usuario de Auth (compensación). Si la cédula o el usuario ya existen, responde 409 `{error:"Ya existe una cuenta con esa cédula."}` o `"…con ese usuario."`. Si todo sale bien, responde 201 `{ok, userId, clave}`.
  - `"clave-nueva"`: `{userId}` → `{ok, clave}`. Pone la marca y el vencimiento.
  - `"suspender"`: `{userId, motivo}` (motivo ≤ 200). No deja suspenderse a uno mismo (400 `"No puedes suspender tu propia cuenta."`) ni dejar el sistema sin admins activos (400 `"Debe quedar al menos una persona del equipo activa."`). Pone `estado='suspendida'` y `ban_duration: "876000h"`.
  - `"reactivar"`: `{userId}`. Pone `estado='activa'` y `ban_duration: "none"`.
- `api/jump-clave.js`: `POST {nueva, actual?, aceptaPrivacidad?, versionPrivacidad?}` con `Authorization: Bearer`, tras comprobar `mismoOrigen`.
  - Si el miembro tiene `debe_cambiar_clave`: exige `aceptaPrivacidad === true` y `versionPrivacidad === "2026-10-19"`. Si `clave_temporal_vence < now`, responde 403 `{error:"Tu clave temporal venció. Pídele una nueva al equipo de JUMP."}`.
  - Si no la tiene: exige `actual` y comprueba `claveCorrecta(email, actual)`; si no coincide, 400 `{campo:"actual", error:"La clave actual no es correcta."}`.
  - Responde 403 si la cuenta está suspendida y 400 si `errorDeClave(nueva)` devuelve un mensaje.
  - Cambia la clave con `authAdmin PUT`; solo después actualiza `debe_cambiar_clave=false`, `clave_temporal_vence=null`, `privacidad_aceptada_en`/`privacidad_version` y escribe la bitácora.
  - Si todo sale bien responde `{ok:true}`.

- [ ] **Paso 1: Escribir las pruebas que fallan en `api-cuentas.test.mjs`**, con `iniciarSim` y `fetch` a `/api/jump-admin` y `/api/jump-clave` con `Origin` igual al del simulador.
  - sin token → 401; con token de E → 403; con token de un admin suspendido → 403; con `Origin: https://malo.com` → 403;
  - A crea una emprendedora: 201, la clave cumple el patrón y luego se puede entrar con esa cédula y esa clave; `jump_yo().debe_cambiar_clave === true`;
  - la misma cédula otra vez → 409 y no queda un usuario huérfano en `auth.users`;
  - cédula inválida → 400 `campo:"cedula"`; WhatsApp `"+593 99 123 4567"` se guarda como `0991234567`;
  - A no puede suspenderse a sí mismo; con un solo admin, suspender a otro admin que sea el último activo → 400;
  - suspender E: el login de E da `user_banned` y `jump_es_miembro()` como E (con un token emitido antes) da false; reactivar lo revierte;
  - jump-clave en el primer ingreso: sin `aceptaPrivacidad` → 400; con clave vencida (se fuerza `clave_temporal_vence` en el pasado) → 403; válido → `{ok:true}`, la marca queda en false y se puede entrar con la nueva clave;
  - jump-clave desde el perfil: con `actual` incorrecta → 400 `campo:"actual"`; correcta → ok;
  - "clave nueva" invalida el contenido: después de `clave-nueva`, E con un token viejo ve 0 mentorías.
- [ ] **Paso 2: Correr y ver que falla.** `node --test api-cuentas.test.mjs`. Esperado: FAIL.
- [ ] **Paso 3: Implementar.**
- [ ] **Paso 4: Correr y ver que pasa.** Esperado: PASS; `node --test` en verde.
- [ ] **Paso 5: Commit.** `feat(jump): API de cuentas y cambio de clave`.

### Task 7 (Tarea 7): Zoom (OAuth, reuniones, desautorización)

**Archivos:**
- Crear: `api/_jump/zoom.js`, `api/jump-zoom-callback.js`, `api/jump-zoom-deauth.js`, `tests/jump/api-zoom.test.mjs`.
- Modificar: `api/jump-admin.js` (enrutar las acciones `zoom-*`).

**Interfaces:**
- **Cliente** en `zoom.js`:
  - `urlAutorizacion(state) -> string` (`https://zoom.us/oauth/authorize?response_type=code&client_id=…&redirect_uri=<JUMP_PUBLIC_URL>/api/jump-zoom-callback&state=…`);
  - `canjear(code) -> Promise<Tokens>` (`POST https://zoom.us/oauth/token`, Basic auth);
  - `refrescar(refresh) -> Promise<Tokens>`;
  - `revocar(token) -> Promise<void>` (`POST https://zoom.us/oauth/revoke`);
  - `yoZoom(access) -> Promise<{id,email,nombre}>`;
  - `crearReunion(access, {tema, iniciaEn: ISO, duracionMin}) -> Promise<{meetingId, joinUrl, passcode}>`. Envía `type: 2`, `timezone: "America/Guayaquil"`, `start_time` en hora local sin `Z`, y `settings: { waiting_room: true, join_before_host: false }`;
  - `accesoVigente() -> Promise<string|null>`: lee `jump_zoom`; si vence en menos de 60 s, refresca y guarda los tokens nuevos cifrados.
- **Acciones**:
  - `"zoom-estado"` → `{ok, configurada: boolean, conectada: boolean, email?, nombre?, conectadaEn?}`;
  - `"zoom-iniciar"` → `{ok, url}`, con un `state` firmado por 600 s con `{adminId, nonce}`. Si faltan las variables de Zoom → 503 `{error:"Zoom todavía no está configurado en el servidor."}`;
  - `"zoom-desconectar"` → revoca (sin fallar si Zoom da error), borra la fila y escribe la bitácora;
  - `"zoom-reunion"`: `{claseId}`. Lee la clase con `service_role`, crea la reunión y hace upsert de `jump_clases_zoom`. Si no hay cuenta conectada → 409 `{error:"Conecta una cuenta de Zoom en Ajustes o pega el enlace a mano."}`.
- **`jump-zoom-callback.js`** (`GET ?code&state`):
  - verifica el `state` y que el admin siga activo;
  - canjea el código, pide `yoZoom` y hace upsert de `jump_zoom` con los tokens cifrados;
  - si ya había una cuenta conectada con otro `zoom_user_id`, revoca los tokens viejos;
  - escribe la bitácora y redirige con 302 a `<JUMP_PUBLIC_URL>/jump/comunidad/#a/ajustes?zoom=ok`.
  - Si cualquier paso falla redirige a `…?zoom=error`, y si el usuario canceló en Zoom (`?error=access_denied`), a `…?zoom=cancelado`.
- **`jump-zoom-deauth.js`** (`POST`):
  - si `event === "endpoint.url_validation"`, responde `{plainToken, encryptedToken: hex(HMAC-SHA256(ZOOM_WEBHOOK_SECRET, plainToken))}`;
  - en los demás casos verifica `x-zm-signature === "v0=" + hex(HMAC(secret, "v0:" + x-zm-request-timestamp + ":" + cuerpo))` y que la marca de tiempo no tenga más de 300 s; si no cumple, 401;
  - con `app_deauthorized` para el `user_id` conectado, borra la fila de `jump_zoom` y responde 200.

- [ ] **Paso 1: Escribir las pruebas que fallan en `api-zoom.test.mjs`.**
  - `zoom-iniciar` como E → 403; como A → la URL lleva el `redirect_uri` correcto y un `state` que se puede verificar;
  - callback con un `state` alterado → 302 a `?zoom=error`, sin fila en `jump_zoom`;
  - callback válido → 302 a `?zoom=ok`. La fila guarda `refresh_token_cifrado` distinto del token en claro y `descifrar` devuelve el original;
  - `zoom-estado` → `{conectada:true, email}`;
  - conectar otra cuenta → el Zoom falso registra que se revocó la anterior;
  - `zoom-reunion` con el token vencido → se refresca (Zoom falso), se guarda el refresh rotado y se crea `jump_clases_zoom` con `join_url`. El cuerpo enviado a Zoom lleva `timezone: "America/Guayaquil"` y el `start_time` coincide con la hora de Guayaquil de la clase;
  - deauth con firma mala → 401; con firma buena y `app_deauthorized` → la fila desaparece; la validación de URL devuelve el HMAC esperado;
  - sin `ZOOM_CLIENT_ID` → `zoom-iniciar` responde 503.
- [ ] **Paso 2: Correr y ver que falla.** Esperado: FAIL.
- [ ] **Paso 3: Implementar.**
- [ ] **Paso 4: Correr y ver que pasa.** Esperado: PASS; `node --test` en verde.
- [ ] **Paso 5: Commit.** `feat(jump): Zoom por OAuth (conectar, cambiar, reuniones, desautorización)`.

### Task 8 (Tarea 8): Datos de ejemplo

**Archivos:**
- Crear: `api/_jump/ejemplos.js`, `tests/jump/api-ejemplos.test.mjs`.
- Modificar: `api/jump-admin.js`.

**Interfaces:**
- **Contenido**: el de `mockups/jump/plataforma.html:691-757`.
  - Las 6 mentorías (`factura` en borrador), con sus módulos, descripciones y materiales. Los archivos de ejemplo pasan a ser enlaces `tipo:'enlace'` con `url` a páginas oficiales (SRI `https://www.sri.gob.ec`, SENADI `https://www.derechosintelectuales.gob.ec`, Municipio de Daule `https://www.daule.gob.ec`). No se suben archivos.
  - Portadas `assets/<archivo>.webp`.
  - 12 emprendedores con los nombres y negocios del mockup y cédulas generadas `30` + 7 dígitos + verificador válido, de modo que `cedulaValida` dé true. Miguel y Ronald quedan suspendidos.
  - 3 clases futuras a +3, +10 y +19 días a las 19:00 de Guayaquil, y 2 pasadas a −4 y −11 días, ambas con `grabacion_url` null (no se inventan enlaces).
  - 3 avisos.
  - Progreso y asistencia aproximando los números del mockup.
  - 4 publicaciones y 6 comentarios del muro con texto de ejemplo marcado "(ejemplo)". El texto es neutro, no son testimonios: preguntas y avisos de avance genéricos.
  - Todo con `es_ejemplo = true`. Los videos van sin `video_url` (la vista muestra "Video pendiente").
- **Acciones**:
  - `"ejemplos-contar"` → `{ok, cargados: boolean, reales: { comentarios: n, publicaciones: n, progreso: n } }`, con lo real que cuelga de filas de ejemplo y se borraría;
  - `"ejemplos-cargar"`: si ya hay ejemplos → 409 `{error:"Los datos de ejemplo ya están cargados."}`. Si no, crea usuarios de Auth con claves temporales aleatorias que no se devuelven, y luego las filas;
  - `"ejemplos-borrar"`: si `{confirmacion}` no es `"BORRAR"` → 400. Si lo es, borra en orden seguro las filas `es_ejemplo` y los usuarios de Auth de los miembros de ejemplo, escribe la bitácora y responde `{ok, borrados:{…}}`.

- [ ] **Paso 1: Escribir las pruebas que fallan.**
  - cargar → 6 mentorías (5 publicadas), 12 miembros de ejemplo, 5 clases, 3 avisos y 4 publicaciones; cargar otra vez → 409;
  - E (real) ve las 5 publicadas y el muro de ejemplo;
  - E comenta en una publicación de ejemplo → `ejemplos-contar.reales.comentarios === 1`;
  - borrar sin `"BORRAR"` → 400; con `"BORRAR"` → no queda ninguna fila `es_ejemplo`, no quedan usuarios `@cuentas` de ejemplo en `auth.users`, y A, E y la mentoría real P siguen ahí;
  - todas las cédulas de ejemplo pasan `cedulaValida` y empiezan con `30`.
- [ ] **Paso 2: Correr y ver que falla.** Esperado: FAIL.
- [ ] **Paso 3: Implementar.**
- [ ] **Paso 4: Correr y ver que pasa.** Esperado: PASS.
- [ ] **Paso 5: Commit.** `feat(jump): cargar y borrar datos de ejemplo`.

### Task 9 (Tarea 9): Frontend, base e ingreso

**Archivos:**
- Crear:
  - `jump/comunidad/index.html`, `privacidad.html`, `app.css`, `assets/` (las 8 webp del mockup);
  - `js/fechas.js`, `js/medios.js`, `js/ui.js`, `js/datos.js`, `js/vistas-ingreso.js`, `js/app.js`;
  - `tests/jump/fechas.test.mjs`, `tests/jump/medios.test.mjs`, `tests/jump/ui/cdp.mjs`.
- Modificar: `scripts/csp.mjs`, `vercel.json`, `.env.example`.

**Interfaces:**
- `fechas.js` (puro, sin DOM):
  - `ZONA = "America/Guayaquil"`;
  - `aISO(fecha "YYYY-MM-DD", hora "HH:MM") -> string` (`…T19:00:00-05:00`);
  - `partes(iso) -> {dow:"JUE", d:"22", mon:"OCT", hora:"19:00"}`;
  - `rango(iso, min) -> "19:00 – 20:00"`;
  - `fechaCorta(iso) -> "Jue 22 oct"`;
  - `haceCuanto(iso, ahora) -> "hace 2 h" | "ayer" | "lun 12 oct"`;
  - `estadoClase(clase, ahora) -> "programada" | "abre-pronto" | "en-vivo" | "terminada"`. `abre-pronto` y `en-vivo` son la ventana de Zoom (de −15 min a fin + 30 min); `en-vivo` va del inicio al fin.
- `medios.js`:
  - `embedVideo(url) -> string|null`: `https://www.youtube-nocookie.com/embed/<id>` para `watch?v=`, `youtu.be/`, `shorts/` y `embed/`; `https://player.vimeo.com/video/<id>` para Vimeo;
  - `icsDeClase({titulo, iniciaEn, duracionMin}) -> string` (VCALENDAR con `DTSTART` en UTC);
  - `reducirFoto(file, max = 1600) -> Promise<Blob>`: webp a calidad 0.82; lanza `Error("foto_ilegible")` si `createImageBitmap` falla.
- `datos.js` (todas las funciones son `async`, lanzan `ErrorJump {codigo, mensaje, campo?}` y nunca devuelven errores crudos):
  - `iniciar()`: lee `/api/config` y crea el cliente con `{ auth: { storageKey: "jump-auth", persistSession: true } }`;
  - `entrar({ tipo: "cedula"|"usuario", id, clave })`. Códigos: `"credenciales"`, `"suspendida"`, `"sin_acceso"`, `"red"`;
  - `salir()`, `sesion()`;
  - `yo() -> Miembro|null`;
  - `cambiarClave({ nueva, actual?, aceptaPrivacidad?, versionPrivacidad? })`, que llama a `/api/jump-clave` con el Bearer.
  - Si una respuesta trae 401 o "JWT expired", se lanza `ErrorJump("sesion")`, que `app.js` convierte en volver a `#ingreso`.
  - Tipos de dominio que se producen (camelCase, fechas ISO): `Miembro`, `Mentoria`, `Modulo`, `Material`, `Clase`, `Aviso`, `Post` y `Comentario`. Los campos son los de la spec §8 traducidos a camelCase, más `visto`/`asistire`/`mio`/`autor` según la vista.
- `ui.js`: `$ $$ esc ic fig logo toast(msg, accion?) copiar(texto, msg) fieldErr(input, msg) hop(desde, hasta, listo)` y `ocupado(boton, promesa) -> promesa` (deshabilita el botón, pone `.is-loading` y lo devuelve a su estado al terminar).
- `app.js`:
  - `registrar(acciones: Record<string, (boton, evento) => void>)`, `ir(hash)`;
  - `shell(rol, activo, html)`, que copia la estructura de `plataforma.html:825-849` y agrega "Comunidad" (muro) para los dos roles y "Ajustes" para el admin;
  - rutas `#ingreso`, `#e/…`, `#a/…`, `#e/muro`, `#a/muro`, `#a/ajustes`;
  - un emprendedor que abre `#a/…` va a `#e/inicio`.
- **CSP**:
  - `csp.mjs` agrega `JUMP_PAGES = ["jump/comunidad/index.html", "jump/comunidad/privacidad.html"]` y `jumpCsp = [...common, "script-src 'self' <hashes JUMP_PAGES> SUPABASE_JS", "img-src 'self' data: blob: SUPABASE_HOST", "connect-src 'self' SUPABASE_HOST", "frame-src https://www.youtube-nocookie.com https://player.vimeo.com", "media-src 'none'"]`;
  - la selección queda: `/admin` → admin, `/jump` → jump, el resto → pública;
  - en `vercel.json` la regla pública pasa a `"/((?!admin(?:/|$)|jump(?:/|$)).*)"` y se agrega `{"source":"/jump/(.*)", CSP jump}`;
  - el UA-block exime `api/jump-zoom-deauth`.
- **`.env.example`**: las 5 variables nuevas, explicadas.
- **Ingreso**: la vista de `plataforma.html:853-903` con cédula/usuario y clave reales.
  - Mensajes: "Cédula o clave incorrecta" / "Usuario o clave incorrecta"; "Tu cuenta está suspendida. Escríbele al equipo de JUMP."; "Esta cuenta no tiene acceso a la Comunidad JUMP."; "No se pudo conectar. Revisa tu internet e intenta de nuevo.".
  - Primer ingreso: el formulario `newPassForm` del mockup más una casilla obligatoria "Leí y acepto el aviso de privacidad" (enlace a `privacidad.html`, que se abre en otra pestaña) y la versión `"2026-10-19"`.
- **`privacidad.html`**: estructura de `politica-datos.html`, con responsable CONSALVA LAW S.A.S. y los mismos datos de contacto. Finalidades: gestionar la participación en JUMP, comunicar clases y avisos, y mostrar el nombre corto y el negocio a los demás inscritos. Datos: cédula, nombres, negocio, WhatsApp, avance y publicaciones del muro. Lleva los derechos LOPDP y conservación durante el programa + 1 año. Al inicio, el aviso "Borrador pendiente de revisión legal".

- [ ] **Paso 1: Escribir las pruebas que fallan, primera parte.** En `fechas.test.mjs`, correr la suite dos veces vía `child_process` con `TZ=UTC` y con `TZ=Asia/Tokyo`:
  - `aISO("2026-10-22","19:00") === "2026-10-22T19:00:00-05:00"`;
  - `partes("2026-10-23T00:00:00Z")` da `{dow:"JUE", d:"22", hora:"19:00"}`;
  - `estadoClase` en los cuatro tramos, con un `ahora` fijo.

  En `medios.test.mjs`: los 5 formatos de video y una URL ajena que da null; el `.ics` contiene `DTSTART:20261023T000000Z`.
- [ ] **Paso 2: Correr y ver que falla.** Esperado: FAIL.
- [ ] **Paso 3: Implementar `fechas.js` y `medios.js`.** Correr: PASS.
- [ ] **Paso 4: Escribir la prueba de interfaz que falla.** `tests/jump/ui/cdp.mjs` (a partir del `cdp_plat.mjs` del scratchpad): levanta `iniciarSim` en el puerto 8899 con la raíz del repo, siembra con A, E (clave conocida), S y N, y corre escenarios con nombre, imprimiendo un JSON con `{escenario: ok|detalle}` y los errores de consola. Escenarios de esta tarea:
  - `ingreso-vacio` → 2 errores de campo;
  - `ingreso-malo` → banner "Cédula o clave incorrecta";
  - `ingreso-suspendida` → banner de suspendida;
  - `primer-ingreso` → sin casilla da error; con casilla y clave válida lleva a `#e/inicio`;
  - `admin-entra` → `#a/resumen`;
  - `sesion-separada` → `localStorage` tiene `jump-auth` y ninguna clave `sb-*-auth-token`;
  - `csp` → 0 errores de CSP en consola.
- [ ] **Paso 5: Correr y ver que falla.** `node tests/jump/ui/cdp.mjs ingreso`. Esperado: FAIL (no existe la página).
- [ ] **Paso 6: Implementar.** `index.html`, `app.css` (CSS del mockup sin `.demo`), `ui.js`, `datos.js` (parte de sesión), `vistas-ingreso.js`, `app.js`, `privacidad.html`, CSP, `node scripts/csp.mjs`.
- [ ] **Paso 7: Correr y ver que pasa.** `node tests/jump/ui/cdp.mjs ingreso` en verde y `node scripts/csp.mjs --check` → "CSP al día.".
- [ ] **Paso 8: Commit.** `feat(jump): página de la comunidad, ingreso y primer ingreso`.

### Task 10 (Tarea 10): Vistas del emprendedor con datos reales

**Archivos:**
- Crear: `jump/comunidad/js/vistas-emprendedor.js`.
- Modificar: `js/datos.js`, `js/app.js`, `app.css`, `tests/jump/ui/cdp.mjs`.

**Interfaces:**
- `datos.js`:
  - `cargarEmprendedor() -> { yo, mentorias: Mentoria[] (con modulos[] ordenados y materiales[]), clases: Clase[], avisos: Aviso[] }`, con una consulta por tabla en paralelo y el armado en el cliente;
  - `marcarVisto(moduloId)`;
  - `confirmarAsistencia(claseId, si)`;
  - `entrarClase(claseId) -> joinUrl`. Códigos `"fuera_de_ventana"` y `"sin_enlace"`;
  - `marcarAvisosVistos(ids)`;
  - `actualizarPerfil({negocio, whatsapp})`;
  - `enlaceMaterial(material) -> url` (firmada por 120 s si es archivo).
- Vistas (de `plataforma.html:905-1010`): inicio, mentorías, aula, clases, avisos y perfil, con estas diferencias respecto del mockup:
  - **Aula**: el video carga en un `iframe` con `embedVideo()` al tocar reproducir; sin URL muestra "Video pendiente: el equipo lo sube pronto". El botón "Marcar como visto" llama a `marcarVisto` y luego a `hop()`.
  - **Clases**: "Agregar a mi calendario" descarga el `.ics`. "Entrar a Zoom" llama a `entrarClase` y abre la URL en una pestaña nueva con `rel="noopener"`. La píldora "En vivo ahora" sale de `estadoClase`.
  - **Avisos**: al abrir la vista se marcan como vistos y el contador del menú se actualiza.
  - **Perfil**: muestra la cédula enmascarada como en el mockup (`mask`). Tiene "Guardar" y "Cambiar clave" (actual + nueva).
- La recarga de datos ocurre al entrar y cuando la pestaña vuelve a estar visible después de más de 5 min.
- Si `yo().estado === "suspendida"` en cualquier recarga, cierra la sesión y muestra el mensaje en `#ingreso`.

- [ ] **Paso 1: Escribir los escenarios que fallan**, sembrados con `ejemplos-cargar` + E real:
  - `inicio` → "Hola, <nombre>" y 5 tarjetas de mentoría;
  - `aula-visto` → completar un módulo deja una fila en `jump_progreso` (se consulta `db`) y aparece `.hopper`;
  - `aula-video` → con una `video_url` de YouTube se crea un iframe a `youtube-nocookie.com`;
  - `material` → abre una URL firmada (la acción devuelve una URL `/supa/storage/v1/object/sign/…`);
  - `clase-ventana` → se pone C1 a +5 min por SQL: aparece "Entrar a Zoom" y al tocarlo se abre la URL de Zoom (se intercepta `window.open`);
  - `asistire` → cambia `aria-pressed` y crea la fila;
  - `avisos-vistos` → el contador baja a 0;
  - `perfil` → WhatsApp `+593 99 123 4567` se guarda normalizado;
  - `suspendida-en-uso` → A suspende a E por la API mientras E navega; la siguiente navegación de E muestra el banner de suspendida en `#ingreso`;
  - `movil-sin-desborde` → en 390 px, `scrollWidth - innerWidth === 0` en todas las rutas del emprendedor.
- [ ] **Paso 2: Correr y ver que falla.** `node tests/jump/ui/cdp.mjs emprendedor`. Esperado: FAIL.
- [ ] **Paso 3: Implementar.**
- [ ] **Paso 4: Correr y ver que pasa.** Esperado: PASS. Correr también `ingreso`.
- [ ] **Paso 5: Commit.** `feat(jump): inicio, mentorías, aula, clases, avisos y perfil del emprendedor`.

### Task 11 (Tarea 11): Panel del equipo (resumen, editor, clases, emprendedores y avisos)

**Archivos:**
- Crear: `jump/comunidad/js/vistas-admin.js`, `js/vistas-editor.js`.
- Modificar: `js/datos.js`, `app.css`, `tests/jump/ui/cdp.mjs`.

**Interfaces:**
- `datos.js`:
  - `cargarAdmin()`: lo de `cargarEmprendedor` sin filtrar por estado, más `miembros`, conteos de progreso por usuario, conteos de asistencia por clase, conteos de vistos por aviso y `joinUrl` desde `jump_clases_zoom`;
  - `guardarMentoria(editor) -> id`: inserta o actualiza la mentoría y reemplaza sus módulos (actualiza los que tienen id, inserta los nuevos y borra los que se quitaron). Para cada módulo `vivo` con fecha y hora, hace upsert de su `jump_clases` y enlaza `clase_id`;
  - `publicarMentoria(id, { avisar })`: `estado='publicada'`, `publicada_en`. Si `avisar`, inserta un aviso `mentoria` y uno `invitacion` por cada clase futura de esa mentoría que todavía no tenga invitación;
  - `pasarABorrador(id)`, `borrarMentoria(id)`;
  - `subirPortada(file) -> ruta`, `subirMaterial(mentoriaId, moduloId|null, file) -> Material`. La ruta es `<mentoriaId>/<uuid>-<nombre saneado a [a-z0-9._-]>`; el nombre original va en `nombre`;
  - `programarClase({titulo, mentoriaId?, fecha, hora, duracionMin, mensaje, zoom: "crear"|"manual"|"despues", enlace?}) -> Clase`: inserta la clase y el aviso `invitacion`, y crea la reunión o guarda el enlace manual;
  - `crearReunionZoom(claseId)`, `guardarZoomManual(claseId, url)`, `guardarGrabacion(claseId, url)`, `reenviarInvitacion(claseId)`, `publicarAviso(texto)`;
  - `adminApi(accion, cuerpo)`, que hace `POST /api/jump-admin` con el Bearer.
- **Vistas**: las de `plataforma.html:1013-1233` con datos reales.
  - **Emprendedores**:
    - "Agregar" llama a `crear-cuenta` y muestra la clave devuelta, con los botones "Copiar" y "Enviar por WhatsApp" (`https://wa.me/593<whatsapp sin 0>?text=` + mensaje con enlace a la comunidad, cédula y clave temporal; solo se abre al tocarlo). La clave ya no se genera en el navegador: el botón "Generar otra" del mockup se quita.
    - "Clave nueva" usa la misma ventana con la clave devuelta. "Suspender" y "Reactivar" llaman a la API; "Deshacer" de reactivar vuelve a suspender.
  - **Editor**:
    - el "Crear reunión" de cada módulo en vivo llama a `zoom-reunion` (primero guarda);
    - "Subir archivo" usa `subirMaterial`;
    - validaciones del mockup al publicar;
    - "Pasar a borrador" en las mentorías publicadas;
    - "Borrar mentoría" con confirmación ("Se borran sus módulos, materiales y el avance de los emprendedores.").
  - **Clases**:
    - el formulario de programar tiene tres opciones de Zoom: "Crear la reunión en Zoom" (desactivada con su explicación si no hay cuenta conectada), "Pegar enlace" y "Agregar después";
    - en las pasadas, "Agregar grabación" (URL https).

- [ ] **Paso 1: Escribir los escenarios que fallan.**
  - `crear-emprendedor`: un doble clic en "Crear cuenta" deja 1 cuenta (conteo en `jump_miembros`); la ventana muestra una clave `JUMP-####-####`; el enlace de WhatsApp empieza con `https://wa.me/5939`;
  - `cedula-repetida` → error en el campo cédula;
  - `suspender-reactivar` → los contadores cambian y la fila cambia en `db`;
  - `editor-nueva-publicar`: crea una mentoría con 1 video y 1 en vivo con fecha; al publicar quedan una fila `jump_clases` enlazada y 2 avisos (`mentoria` + `invitacion`), y E la ve;
  - `editor-errores` → las validaciones del mockup (`publishErr`);
  - `subir-material` → un PDF de 1 KB queda en el Storage del simulador y en `jump_materiales`;
  - `programar-clase-manual` → con un enlace `https://zoom.us/j/123` se crea la fila en `jump_clases_zoom`; con un enlace no Zoom aparece un error en el campo;
  - `programar-clase-zoom` (con cuenta conectada en el Zoom falso) → `join_url` del falso;
  - `aviso` → E lo ve;
  - `doble-publicar` → un doble clic en "Publicar" crea 1 aviso;
  - `tabla-sin-desborde` y `movil-sin-desborde` en las rutas admin.
- [ ] **Paso 2: Correr y ver que falla.** `node tests/jump/ui/cdp.mjs admin`. Esperado: FAIL.
- [ ] **Paso 3: Implementar.**
- [ ] **Paso 4: Correr y ver que pasa.** Esperado: PASS, y las suites anteriores siguen en verde.
- [ ] **Paso 5: Commit.** `feat(jump): panel del equipo con mentorías, clases, emprendedores y avisos`.

### Task 12 (Tarea 12): Muro de la comunidad

**Archivos:**
- Crear: `jump/comunidad/js/vistas-muro.js`.
- Modificar: `js/datos.js`, `js/app.js`, `app.css`, `tests/jump/ui/cdp.mjs`.

**Interfaces:**
- `datos.js`:
  - `listarPosts({ antesDe?: ISO, limite = 20 }) -> Post[]` (con `autor` desde `jump_directorio()`, los comentarios de esos posts y `fotoUrl` firmada por 600 s);
  - `publicarPost({ texto, foto?: File })`: reduce la foto, la sube a `jump-muro/<uid>/<uuid>.webp` y luego inserta; si el insert falla, borra la foto;
  - `borrarPost(id)` (también su foto), `comentar(postId, texto)`, `borrarComentario(id)`;
  - `ocultar("post"|"comentario", id, si)` (admin).
  - Códigos de error: `"limite_publicaciones"` → "Llegaste al límite de 10 publicaciones por día."; `"limite_comentarios"`; `"foto_ilegible"` → "Esa foto no se pudo leer. Prueba con otra o toma una captura de pantalla.".
- **Diseño** (mundo del mockup, DESIGN.md):
  - Columna de lectura de 680 px como máximo.
  - Arriba, el panel "Comparte con la comunidad": `textarea` con el placeholder "Cuenta un avance o haz una pregunta…", contador visible desde 800 caracteres, botón "Agregar foto" (`input[type=file][accept=image/*]`) con vista previa quitable y "Publicar" en tinta.
  - Cada publicación: avatar de iniciales, "Nombre C. · Negocio" (o "Equipo JUMP" para el admin), tiempo relativo, texto con saltos de línea (siempre escapado, sin HTML ni enlaces activos), foto con `aspect-ratio` limitado a 4/5 como máximo, "N comentarios", los últimos 2 comentarios, "Ver todos" y el campo "Escribe un comentario".
  - El autor tiene "Borrar" en su publicación, con confirmación.
  - El admin tiene "Ocultar"/"Mostrar". Lo oculto se ve atenuado con la etiqueta "Oculto por el equipo".
  - El autor ve su publicación oculta con "El equipo ocultó esta publicación".
  - Estado vacío con la figura: "Todavía no hay publicaciones. Cuenta tu primer avance."
  - "Ver más" al final pagina por `antesDe`.
  - Nada de amarillo, salvo la marca del menú actual.

- [ ] **Paso 1: Escribir los escenarios que fallan.**
  - `muro-publicar`: texto + foto PNG generada en el navegador (canvas a Blob) da 1 fila con `foto` `.webp` y la imagen visible; un doble clic en "Publicar" deja 1 fila;
  - `muro-comentar` → E2 comenta y E lo ve;
  - `muro-xss`: el texto `<img src=x onerror=alert(1)>` se ve literal y no hay ningún `img[src=x]` en el DOM;
  - `muro-foto-ilegible` → un archivo `.jpg` con bytes de texto muestra el mensaje y no sube nada;
  - `muro-ocultar`: A oculta, E2 no lo ve y E (autor) ve la etiqueta;
  - `muro-limite` → se siembran 10 publicaciones por SQL y la 11.ª muestra el mensaje del límite;
  - `muro-borrar` → la fila y el objeto de Storage desaparecen;
  - `muro-movil` → sin desborde en 390 px.
- [ ] **Paso 2: Correr y ver que falla.** `node tests/jump/ui/cdp.mjs muro`. Esperado: FAIL.
- [ ] **Paso 3: Implementar.**
- [ ] **Paso 4: Correr y ver que pasa.** Esperado: PASS.
- [ ] **Paso 5: Commit.** `feat(jump): muro de la comunidad con moderación del equipo`.

### Task 13 (Tarea 13): Ajustes (Zoom, equipo JUMP y datos de ejemplo)

**Archivos:**
- Crear: `jump/comunidad/js/vistas-ajustes.js`.
- Modificar: `js/datos.js`, `js/app.js`, `app.css`, `js/vistas-admin.js` (franja "Hay datos de ejemplo cargados · Borrar ejemplos" en el resumen), `tests/jump/ui/cdp.mjs`.

**Interfaces:**
- Vista `#a/ajustes` con tres secciones apiladas:
  1. **Cuenta de Zoom**:
     - "No configurada en el servidor" (mensaje para el dueño);
     - desconectada → "Conectar Zoom", que llama a `zoom-iniciar` y hace `location.assign(url)`;
     - conectada → "Conectada como <email>", más "Cambiar cuenta" (abre Zoom; el servidor revoca la anterior al volver) y "Desconectar" (con confirmación).
     - Al volver con `?zoom=ok|error|cancelado` muestra un toast y limpia el hash.
     - Un texto breve explica que la cuenta debe ser la de JUMP donde se creó la app.
  2. **Equipo JUMP**: lista de admins (nombre, usuario, estado y último ingreso) y "Agregar persona del equipo" (usuario + nombres). Usa `crear-cuenta` con `rol:"admin"` y muestra la clave temporal igual que con los emprendedores. "Clave nueva", "Suspender" y "Reactivar" funcionan como en emprendedores (el servidor aplica las reglas de último admin y de uno mismo).
  3. **Datos de ejemplo**:
     - estado "Cargados" / "No hay";
     - "Cargar datos de ejemplo";
     - "Borrar datos de ejemplo": abre un diálogo con el conteo de `ejemplos-contar` ("También se borrarán N comentarios reales hechos sobre publicaciones de ejemplo"), un campo donde hay que escribir `BORRAR` y el botón rojo activo solo con el texto exacto.

- [ ] **Paso 1: Escribir los escenarios que fallan.**
  - `zoom-conectar` (Zoom falso): "Conectar" lleva a una URL de autorización. El escenario llama al callback con ese `state` y un `code`, vuelve a `#a/ajustes?zoom=ok` y muestra "Conectada como" con el correo falso;
  - `zoom-desconectar` → el estado vuelve a desconectada;
  - `equipo-agregar` → nuevo admin con clave; el último admin no se puede suspender (mensaje del servidor visible);
  - `ejemplos-borrar`: el botón está deshabilitado hasta escribir `BORRAR`; después no queda ninguna fila `es_ejemplo` y la franja del resumen desaparece;
  - `ejemplos-cargar` → aparece la franja.
- [ ] **Paso 2: Correr y ver que falla.** `node tests/jump/ui/cdp.mjs ajustes`. Esperado: FAIL.
- [ ] **Paso 3: Implementar.**
- [ ] **Paso 4: Correr y ver que pasa.** Esperado: PASS. `node --test` y todas las suites de interfaz en verde.
- [ ] **Paso 5: Commit.** `feat(jump): ajustes de Zoom, equipo y datos de ejemplo`.

### Task 14 (Tarea 14): Revisión de seguridad, revisión visual, guía y entrega

**Archivos:**
- Crear: `docs/jump/PUESTA-EN-MARCHA.md`.
- Modificar: `docs/loanix/SECURITY.md`, `README.md` (una sección corta "Comunidad JUMP" que enlaza la guía).

**Interfaces:** ninguna nueva.

- [ ] **Paso 1: Revisión de seguridad del diff completo.** Revisar `git diff origin/main...` buscando:
  - cada uso de `service_role` precedido por `exigirAdmin` o por la verificación del token;
  - ningún secreto en el cliente;
  - `esc()` en toda interpolación;
  - las URLs de video, Zoom, material y grabación validadas en el cliente y en un `check` de la base;
  - el `state` de OAuth firmado y vencible;
  - los errores genéricos.

  Corregir lo que aparezca, con su prueba.
- [ ] **Paso 2: Evidencia.** Agregar a `docs/loanix/SECURITY.md` la sección "Comunidad JUMP (2026-10-19)" con la tabla caso de abuso → prueba → resultado, a partir de la salida de `node --test` y de `cdp.mjs`.
- [ ] **Paso 3: Revisión visual.** Capturas a 1440 y 390 px de todas las rutas, comparadas con las capturas del mockup (`mockups/jump/.impeccable/review/`). Se corrige en una sola tanda todo lo que se aleje del contrato (amarillo solo para lo actual, avance en tinta, `dvh`) y se confirma con una segunda ronda.
- [ ] **Paso 4: `docs/jump/PUESTA-EN-MARCHA.md`.** En español llano, en este orden:
  1. crear el proyecto de Supabase de JUMP (en la misma organización que el de La Aurora), apagar en Authentication → Sign In / Providers el registro público ("Allow new users to sign up") y dejar "Confirm email" encendido; copiar de Settings → API el Project URL, la anon key y la service_role key;
  2. pegar `supabase/jump/0001_comunidad_jump.sql` en el SQL Editor **del proyecto de JUMP** y correrlo;
  3. crear el primer admin (Add user con `usuario@equipo.laauroraescucha.com` y *Auto Confirm*, luego el `insert` de la plantilla);
  4. poner en Vercel `JUMP_SUPABASE_URL`, `JUMP_SUPABASE_ANON_KEY`, `JUMP_SUPABASE_SERVICE_ROLE_KEY`, `JUMP_SECRET` y `JUMP_PUBLIC_URL`; escribir el Project URL en `JUMP_SUPABASE_HOST` de `scripts/csp.mjs`, correr `node scripts/csp.mjs`, subir y hacer Redeploy (sin ese paso el navegador bloquea la conexión);
  5. entrar a `/jump/comunidad/`, ir a Ajustes y "Cargar datos de ejemplo";
  6. crear la app de Zoom dentro de la cuenta de JUMP (General App, *user-managed*, el *redirect* exacto, los permisos de reunión y de usuario, el evento `app_deauthorized` con su URL) y poner `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` y `ZOOM_WEBHOOK_SECRET`;
  7. Ajustes → Conectar Zoom;
  8. antes de cargar datos reales: que Josué revise `privacidad.html` y borrar los ejemplos;
  9. el aviso de los 40 minutos de Zoom gratis.
- [ ] **Paso 5: Verificación final.**
  - `cd tests/jump && node --test` → todo pasa;
  - `node tests/jump/ui/cdp.mjs todo` → todo en verde y 0 errores de consola;
  - `node scripts/csp.mjs --check` → "CSP al día.";
  - `vercel.json` ya no contiene `jump-supabase-pendiente.invalid` (si lo contiene, falta el Project URL de JUMP: se entrega así y la guía lo marca como paso obligatorio).
- [ ] **Paso 6: Copiar a la carpeta del dueño.** Copiar `jump/`, `api/_jump/`, `api/jump-*.js`, `supabase/jump/0001_comunidad_jump.sql`, `scripts/csp.mjs`, `vercel.json`, `.vercelignore`, `.env.example`, `.gitignore`, `README.md`, `docs/jump/`, `docs/loanix/SECURITY.md` y `docs/superpowers/` a `C:/Users/Luisma/Downloads/somos aurora`.
- [ ] **Paso 7: Commit y entrega.** Commit: `docs(jump): guía de puesta en marcha y evidencia de seguridad`. Preguntar al usuario antes de subir la rama al fork o abrir el PR.
