# JC en el sitio + encuestas reales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** JC (chibi 2D aprobado) vive en `/jump/` y `/jump/comunidad/` anunciando datos reales, y las encuestas pasan
a ser reales: el panel las maneja, votan los inscritos (comunidad) y cualquier visitante (landing).

**Architecture:**
- **Lógica pura** en `jump/jc/cerebro.js`: elige qué decir, recuerda qué ya dijo y calcula cuánto dura el globo.
  Se prueba en node. `jump/jc/frases.js` trae las frases fijas.
- **Personaje** en `jump/jc/jc.js` + `jump/jc/jc.css`: el DOM y las animaciones de la demo, en un escenario fijo
  sobre la página.
- **Puentes** que alimentan al personaje: `jump/landing-jc.js` (secciones de la landing) y
  `jump/comunidad/js/jc-comunidad.js` (pantallas y datos de la app).
- **Encuestas:**
  - base: migración `0003`, con escrituras de los emprendedores por RPC;
  - público: `api/jump-publico.js` (GET clase + encuesta, POST votar) con service_role;
  - pantallas: `vistas-encuestas.js` (panel y tarjeta).

**Tech Stack:** HTML/CSS/JS sin librerías (módulos ES), Vercel Edge Functions, Supabase (Postgres + RLS),
`node --test` + PGlite + simulador HTTP + Chrome CDP.

**Spec:** `docs/superpowers/specs/2026-10-25-jc-y-encuestas-design.md`

## Global Constraints

- Sin dependencias nuevas en el sitio. Todo de mismo origen. Las CSP de `vercel.json` siguen pasando
  (`node scripts/csp.mjs --check`).
- La migración va en `supabase/jump/0003_encuestas.sql`: proyecto de Supabase de JUMP, se puede correr dos veces y
  la aplica el dueño en el SQL Editor. **No usar el MCP de Supabase.**
- `anon` no recibe ningún permiso sobre tablas ni funciones `jump_*`. Toda función `security definer` fija
  `search_path` (lo exige `tests/jump/superficie.test.mjs`).
- Del voto público se guardan solo huellas HMAC (`huellaIp` y una huella del aparato), nunca la IP. Nada con
  `es_ejemplo = true` sale en la landing.
- Globo: mínimo **10 s**, máximo **15 s**. No se cierra mientras tiene el mouse encima, el foco o un toque.
- Copy: español tuteando. «comunidad», nunca «barrio». Las frases van **exactamente** como en spec §6.
- Con `prefers-reduced-motion`, JC no camina ni salta entre la portada y la esquina, pero sigue hablando.
- Commits como `Somosaurora <342539203+Somosaurora@users.noreply.github.com>`, con la línea
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No tocar `main`.
- Sin la 0003 aplicada, el panel explica que falta y la landing muestra la sección sin encuesta. Nada se rompe.
- Pruebas desde `tests/jump`: `node --test` (unitarias y de base) y `node ui/todo.mjs` (Chrome).

## Review Focus

1. **Sin la migración 0003 aplicada (así estará al desplegar):** la landing, la comunidad y el panel cargan sin
   errores en consola. La landing no muestra encuesta y el panel explica qué falta. → Prueba en Task 4
   (`api-publico`: tabla ausente → `encuesta: null`) y escenario UI `sin-0003` en Task 9.
2. **El mismo aparato vota dos veces o cambia de opción:** queda un solo voto y cuenta el último. → Prueba en Task 4.
3. **JC tapa algo:** su caja no atrapa clics fuera del cuerpo y del globo, y no hay desborde horizontal en 390 px.
   → Escenarios UI `jc-no-tapa` y `desborde` en Task 9.
4. **Ideas duplicadas o vacías:** la misma idea con otras mayúsculas o espacios se rechaza con «Esa idea ya está en
   la lista: vota por ella.» → Prueba en Task 1 y Task 6.
5. **`localStorage` bloqueado (modo privado o error):** JC funciona sin recordar y el voto público usa un id de
   aparato por sesión. → Prueba en Task 2 (`Memoria` con almacenamiento que lanza).

---

### Task 1: Migración 0003 — encuestas, RLS y RPC

**Files:**
- Create: `supabase/jump/0003_encuestas.sql`
- Test: `tests/jump/rls-encuestas.test.mjs`

**Interfaces:**
- Produces:
  - **Tablas:**
    - `jump_encuestas(id uuid pk, pregunta text 5..160, estado text 'borrador'|'abierta'|'cerrada' default 'borrador', abierta_en timestamptz, cerrada_en timestamptz, creada_por uuid default auth.uid(), creada_en timestamptz default now(), es_ejemplo bool default false)`.
      Índice único parcial `jump_encuestas_una_abierta on ((true)) where estado = 'abierta'`.
    - `jump_encuesta_opciones(id uuid pk, encuesta_id uuid fk cascade, texto text 2..80 sin espacios en los extremos, orden int default 0, propuesta_por uuid null, creada_en, es_ejemplo bool default false)`.
      Índice único `(encuesta_id, lower(btrim(texto)))`.
    - `jump_encuesta_votos(id uuid pk, encuesta_id uuid fk cascade, opcion_id uuid fk cascade, origen text 'inscrito'|'publico', user_id uuid null, dispositivo_hash text null, ip_hash text null, creado_en, actualizado_en)`.
      Con `unique (encuesta_id, user_id)`, `unique (encuesta_id, dispositivo_hash)` y
      `check ((origen = 'inscrito') = (user_id is not null))`.
  - **RPC** (security definer, `search_path = public`; `execute` solo para `authenticated` y `service_role`):
    - `jump_votar(p_opcion uuid) returns void`: miembro activo, encuesta abierta, hace upsert de su voto.
    - `jump_proponer(p_encuesta uuid, p_texto text) returns uuid`: miembro activo, encuesta abierta, como mucho una
      propuesta suya por encuesta. Crea la opción y vota por ella.
    - `jump_encuesta_resultados(p_encuesta uuid) returns table(opcion_id uuid, porcentaje int)`: miembro, admin o
      service_role. Usa `round(100.0 * n / total)` y da 0 si no hay votos.
    - `jump_encuesta_conteos(p_encuesta uuid) returns table(opcion_id uuid, publico int, inscritos int)`: solo admin.
    - `jump_abrir_encuesta(p uuid) returns void`: solo admin. Cierra la que esté abierta y abre `p`.
  - **Errores** (`raise exception` con código):
    - `'jump_idea_repetida'` (errcode `23505`, el índice único)
    - `'jump_ya_propuso'` (`P0001`)
    - `'jump_encuesta_cerrada'` (`P0001`)
- **RLS:**
  - Miembro activo: `select` de encuestas en estado ≠ `borrador` y de sus opciones.
  - Admin: todo sobre encuestas y opciones.
  - Votos:
    - `select` solo de columnas `id, encuesta_id, opcion_id, origen, user_id, creado_en`, con política
      `user_id = auth.uid()`;
    - sin `insert/update/delete` para `authenticated`;
    - `dispositivo_hash` e `ip_hash` no se pueden leer con una sesión.

- [ ] **Step 1: Write the failing test** `tests/jump/rls-encuestas.test.mjs`. Usa `crearBase`, `como` y
  `crearEscenario` (A admin, E y E2 emprendedores, S suspendida). Antes de cada caso, siembra una encuesta abierta
  con service_role, con 2 opciones del equipo. Casos (nombres exactos):
  - `"anon no lee ni ejecuta nada de encuestas"`: `select` de las 3 tablas y las 5 RPC → `/permission denied/`.
  - `"el emprendedor ve la abierta y las cerradas, no los borradores"`.
  - `"el emprendedor vota, cambia su voto y queda uno solo"`: `jump_votar(o1)`, después `jump_votar(o2)`. Hay 1
    fila con `user_id = E.id`, `opcion_id = o2` y `origen = 'inscrito'`.
  - `"nadie inserta votos directo ni lee las huellas"`: un `insert` en votos como E rechaza. Un `select ip_hash`
    como A rechaza `/permission denied/`.
  - `"suspendida no vota"`: `jump_votar` como S rechaza.
  - `"en una encuesta cerrada no se vota ni se propone"`: rechaza con `/jump_encuesta_cerrada/`.
  - `"proponer crea la opción, vota por ella y solo una vez"`:
    - la segunda propuesta de E → `/jump_ya_propuso/`;
    - E2 con `"  feria de NAVIDAD "` cuando ya existe «Feria de Navidad» → error 23505.
  - `"resultados: porcentajes sin conteos para el emprendedor; conteos por origen solo para el equipo"`:
    - con 1 voto inscrito a o1 y 1 público a o2 (insertado con service_role), resultados = 50/50;
    - `jump_encuesta_conteos` como E rechaza;
    - como A devuelve `{publico:1, inscritos:0}` y `{publico:0, inscritos:1}`.
  - `"solo una abierta: abrir otra cierra la anterior"`: `jump_abrir_encuesta(b)` como A deja `a` en `cerrada` con
    `cerrada_en` puesto.
  - `"borrar una opción borra sus votos"`.
  - `"la migración se puede correr dos veces"`: `aplicarMigracion(db, "0003")` otra vez no lanza.

- [ ] **Step 2: Run to verify it fails**
  Run: `cd tests/jump && node --test rls-encuestas.test.mjs`
  Expected: FAIL. `crearBase` todavía no crea las tablas (`relation "jump_encuestas" does not exist`).

- [ ] **Step 3: Write `supabase/jump/0003_encuestas.sql`**
  - Cabecera igual a la de la 0002: qué es, cómo aplicarla y quién hace qué.
  - Al principio, `revoke all ... from anon, authenticated`. Después, `grant` justos, como en la 0001/0002.
  - `jump_votar` hace el upsert con `on conflict (encuesta_id, user_id) do update set opcion_id, actualizado_en = now()`.

- [ ] **Step 4: Run tests**
  Run: `cd tests/jump && node --test rls-encuestas.test.mjs superficie.test.mjs base.test.mjs`
  Expected: PASS (también la superficie, sin cambios).

- [ ] **Step 5: Commit** — `feat(jump): migración 0003 de encuestas con RLS y votos por RPC`

### Task 2: Cerebro de JC y frases

**Files:**
- Create: `jump/jc/frases.js`, `jump/jc/cerebro.js`
- Test: `tests/jump/jc.test.mjs`

**Interfaces:**
- Produces:
  - **Tipos y datos de `frases.js`:**
    - `Frase = { texto: string, animo: "reposo"|"feliz"|"triste"|"enojado"|"bromista", clave: string }`
    - `FRASES = { landing: { [seccion]: Frase[] }, comunidad: { [pantalla]: Frase[] } }`
    - secciones de la landing: `portada, salto, incluye, momentos, modulos, encuestas, josue, padrinos, proceso, postula, preguntas`;
    - pantallas de la comunidad: `inicio, mentorias, clases, muro, avisos, perfil`.
    - `ESPECIALES`: funciones que devuelven `Frase`:
      - `saludo(lugar)`
      - `claseFutura(c, lugar)`, `claseHoy(c, lugar)`, `claseEmpezo(lugar)`
      - `encuestaSinVotar()`, `mentoriaNueva(m)`, `avisoNuevo(a)`, `moduloPendiente(n, titulo)`, `regreso()`
    - Textos copiados de spec §6.1–6.3. `c` trae `{ id, titulo, iniciaEn }`.
  - **`cerebro.js`:**
    - `duracionGlobo(texto: string): number`. Da ms, con `clamp(10000, 10000 + max(0, palabras - 14) * 450, 15000)`.
    - `class Memoria { constructor(almacen = globalThis.localStorage, ahora = () => Date.now()) }`:
      - métodos `get(k)`, `set(k, v)`;
      - `dicho(clave, { porDia })`, `marcar(clave)`;
      - `diasDesdeUltimaVisita(): number|null`, `registrarVisita()`.
      - Va con try/catch: si el almacén lanza, todo sigue en memoria.
      - Prefijo de claves `jc.`.
    - `anunciosComunidad({ yo, clases, avisos, mentorias, encuesta, ahora }): Frase[]`:
      - devuelve en el orden de spec §3 (empezó/hoy, futura ≤7 días, encuesta sin votar, mentoría/aviso no visto,
        módulo pendiente);
      - claves: `clase:{id}:{estado}`, `encuesta:{id}` (porDia), `aviso:{id}`, `modulo:{id}` (porDia).
    - `anunciosLanding({ clase, ahora }): Frase[]`: solo la clase.
    - `elegir({ lugar, seccion, anuncios, memoria, alLlegar: boolean }): Frase|null`:
      - al llegar, el primer anuncio no dicho (o «regreso» si corresponde y aún no se dijo hoy); si no hay, una frase
        suelta de esa sección no dicha en esta visita;
      - al tocar, recorre `anuncios` en orden y luego las sueltas, sin filtrar por memoria.
    - `ordenarPorPantalla(anuncios, pantalla): Frase[]`: sube lo de la pantalla (clases → `clase:*`,
      mentorias → `modulo:*`, muro → `encuesta:*`).

- [ ] **Step 1: Write the failing tests** `tests/jump/jc.test.mjs` (importa desde `../../jump/jc/*.js`):
  - `"hay 5 frases por ánimo en cada página y todas calzan con su lugar"`: cuenta por `animo` en landing y en
    comunidad = 5; cada sección existe.
  - `"ninguna frase dice barrio ni pasa de 120 caracteres"`.
  - `"el globo dura entre 10 y 15 segundos"`:
    - `duracionGlobo("¡Hola!") === 10000`;
    - para un texto de 60 palabras da `15000`;
    - uno de 20 palabras queda entre los dos.
  - `"orden en la comunidad"`: con una clase en vivo, una encuesta sin votar, un aviso no visto y un módulo pendiente,
    las claves salen en ese orden. Con una clase a 3 días, la clase futura va antes que la encuesta. Con una a 9
    días, no aparece.
  - `"los avisos de invitación no se repiten como aviso"`.
  - `"una clase se anuncia una vez por estado"`: después de `marcar("clase:c1:futura")`, la misma clase en «hoy» sí
    sale al llegar.
  - `"encuesta y módulo: una vez al día al llegar, pero al tocar se repiten"`: con `ahora` +25 h vuelve a salir.
  - `"sin nada nuevo dice una suelta de la pantalla y no repite en la visita"`: 5 llamadas en `perfil` sin anuncios
    dan 5 claves distintas.
  - `"Memoria sigue funcionando si localStorage lanza"`: almacén cuyos métodos lanzan. `marcar` + `dicho` funcionan
    en memoria.
  - `"regreso tras 7 días"`: `set("jc.ultimaVisita", hace8dias)`. Al llegar da la frase `regreso`.

- [ ] **Step 2: Run** `cd tests/jump && node --test jc.test.mjs`. Expected: FAIL (`Cannot find module .../jump/jc/frases.js`).

- [ ] **Step 3: Implement** `frases.js` (texto exacto de spec §6) y `cerebro.js` con las firmas de arriba. No tocan
  el DOM; las fechas se arman con `partes`/`fechaCorta` de `/jump/comunidad/js/fechas.js` (importación relativa
  `../comunidad/js/fechas.js`).

- [ ] **Step 4: Run** `cd tests/jump && node --test jc.test.mjs`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat(jump): frases de JC y lógica de qué dice y cuándo`

### Task 3: Personaje JC (DOM + animaciones) y recursos

**Files:**
- Create: `jump/jc/jc.js`, `jump/jc/jc.css`
- Create (copiar de `C:/Users/Luisma/Downloads/somos aurora/mockups/jump/jc-2d/`): `jump/jc/jc-reposo.webp`,
  `jc-feliz.webp`, `jc-triste.webp`, `jc-enojado.webp`, `jc-bromista.webp`, `jc-salto.webp`, `jc-caminar.webp`
- Test: `tests/jump/jc.test.mjs` (unitaria de recursos) + escenarios UI en Task 9

**Interfaces:**
- Consumes: `duracionGlobo` (Task 2).
- Produces: `crearJC({ alTocar: () => void }) => JC`, que monta `<div class="jc-escena">` en `document.body`.
  `JC` tiene:
  - `decir(frase: Frase): void`: pone la cara del ánimo con el «boing» y abre el globo `duracionGlobo` ms, que se
    pausa con hover, foco o toque.
  - `ubicar(modo: "grande"|"esquina", ancla?: Element): void`: «grande» se alinea al rectángulo del ancla
    (abajo-centro) y «esquina» queda fija abajo a la derecha. El cambio salta con WAAPI (fade con reduced-motion).
  - `esconder(): void` / `mostrar(): void`: deja o quita la burbuja `button.jc-volver` y emite el evento
    `jc:escondido` / `jc:visible`.
  - `estaEscondido(): boolean`, `ocultarDelTodo(si: boolean)` (para pantallas donde no va).
  - `destruir(): void`.
- **DOM:**
  - JC es `button.jc-toque` con `aria-label` «JC, la mascota de JUMP, {cómo está}. Tócalo para que salte».
  - Globo `p.jc-globo[role=status][aria-live=polite]`.
  - `button.jc-esconder` con `aria-label="Esconder a JC"` y `button.jc-volver` con `aria-label="Mostrar a JC"`.
  - `.jc-escena{pointer-events:none}`; solo cuerpo, globo y botones tienen `pointer-events:auto`.
- **Tamaños:** `--alto-jc` de grande `clamp(200px, 36vh, 300px)` (escritorio) / `150px` (≤ 560 px). En esquina,
  `120px` / `84px`.
- **Esquina:**
  - `right: 16px; bottom: 16px`;
  - con `body.jc-sobre-barra` (comunidad en celular), `bottom: calc(72px + env(safe-area-inset-bottom))`.
- **Caminata:**
  - la tira se carga con `requestIdleCallback` (o `setTimeout` 1500 si no existe) después de `load`;
  - en reposo camina unos pasos cada 25–45 s dentro de ±1 ancho de JC;
  - nunca camina con reduced-motion ni si la tira no cargó.
- **Teclado del celular:** se esconde mientras un `input`/`textarea` tiene el foco y su rectángulo se cruza con el
  de JC (evento `focusin`/`focusout`).

- [ ] **Step 1: Write the failing test** en `tests/jump/jc.test.mjs`:
  - `"los dibujos de JC están en jump/jc y pesan lo esperado"`: existen los 7 webp; `jc-caminar.webp` < 600 KB;
    cada dibujo < 80 KB.
  - `"jc.css usa las posiciones de la demo"`: contiene `steps(14)` y las 9 reglas de párpados por cara de la demo.
- [ ] **Step 2: Run** `node --test jc.test.mjs` → FAIL (no existen).
- [ ] **Step 3: Copiar los webp e implementar** `jc.js`/`jc.css`. Se portan de la demo: las capas, `ponerCara`,
  `aplastar`, `saltar` con chispas, `colocarGlobo` (contra el viewport en vez de la escena), el parpadeo, la
  caminata lineal a 1 ancho/s y los estilos de ánimo. El selector de ánimo pasa de `.escena[data-animo]` a
  `.jc-escena[data-animo]`.
- [ ] **Step 4: Run** `node --test jc.test.mjs` → PASS.
- [ ] **Step 5: Commit** — `feat(jump): personaje JC reutilizable con los dibujos aprobados`

### Task 4: API pública `/api/jump-publico`

**Files:**
- Create: `api/jump-publico.js`, `api/_jump/publico.js`
- Modify: `api/_jump/secretos.js` (agregar `huellaDispositivo(id: string): Promise<string>`, HMAC con
  `derivar("dispositivo")`)
- Test: `tests/jump/api-publico.test.mjs`

**Interfaces:**
- Consumes: tablas y `jump_encuesta_resultados` (Task 1), `rest` y `huellaIp`.
- Produces:
  - **`GET /api/jump-publico`** → `200 { clase: {titulo, iniciaEn, duracionMin} | null, encuesta: EncuestaPublica | null }`,
    con `Cache-Control: public, max-age=30`.
    - `EncuestaPublica = { id, pregunta, estado: "abierta"|"cerrada", opciones: [{ id, texto, porcentaje }] }`.
    - La clase sale en vivo (`inicia_en + duracion + 30 min > now`), la más próxima, `es_ejemplo = false`, suelta o
      de una mentoría `publicada`. Nunca devuelve `mensaje`, `grabacion_url` ni Zoom.
    - La encuesta: la abierta (`es_ejemplo = false`); si no hay, la última cerrada; si no, `null`. Si la tabla no
      existe (falta la 0003): `encuesta: null`, status 200.
  - **`POST /api/jump-publico`** con `{ opcion: uuid, dispositivo: string(16..64) }`. Es de mismo origen y el cuerpo
    llega como mucho a 1024.
    - Si sale bien → `200 { ok: true, encuesta: EncuestaPublica }`.
    - Errores:
      - 400 `{campo}` si el dato es inválido;
      - 409 si la encuesta está cerrada o la opción no es de la abierta;
      - 429 con `TOPE_POR_CONEXION = 30` aparatos distintos por conexión y encuesta (cambiar el voto de un aparato
        que ya votó no cuenta);
      - 403 si viene de otro origen, 405 si es otro método, 503 sin configuración.
    - Upsert por `(encuesta_id, dispositivo_hash)` con `on_conflict` +
      `Prefer: resolution=merge-duplicates,return=minimal`, con `origen = 'publico'`.

- [ ] **Step 1: Write the failing test** `tests/jump/api-publico.test.mjs`, contra `iniciarSim()` + `crearEscenario`:
  - `"GET da la próxima clase sin datos privados y sin ejemplos ni borradores"`: con el escenario es «Dudas del
    RUC». Las llaves del objeto son exactamente `titulo, iniciaEn, duracionMin`. Marcando C1 `es_ejemplo = true`
    pasa a «Ventas por WhatsApp» (C2 es de un borrador).
  - `"GET sin encuesta abierta muestra la última cerrada; sin ninguna, null"`.
  - `"GET nunca devuelve encuestas de ejemplo"`.
  - `"votar: un voto por aparato, cambiarlo no duplica"`: votar o1 y luego o2 con el mismo `dispositivo` deja 1 fila
    `origen = 'publico'`, opción o2, sin el id crudo ni la IP en `dispositivo_hash`/`ip_hash`.
  - `"votar valida origen, método, cuerpo y opción"`: 403 / 405 / 400 `campo: "opcion"` / 400
    `campo: "dispositivo"` / 409 con una opción de otra encuesta.
  - `"tope por conexión: el aparato 31 desde la misma IP → 429, otra IP sí"`.
  - `"sin la tabla de encuestas (falta la 0003) GET responde 200 con encuesta null"`: base con solo 0001+0002
    (`crearBase` acepta `{ hasta: "0002" }`. Agregarlo a `sim/db.mjs` y a `iniciarSim({ db })`).
- [ ] **Step 2: Run** `node --test api-publico.test.mjs` → FAIL (404 «no existe»).
- [ ] **Step 3: Implement** `api/_jump/publico.js` (`proximaClase()`, `encuestaPublica()`,
  `votarPublico(body, ip)`) y `api/jump-publico.js` con el patrón de `jump-postular.js`. Para los porcentajes
  llama a `rpc/jump_encuesta_resultados` con service_role.
- [ ] **Step 4: Run** `node --test api-publico.test.mjs` + toda la suite `node --test` → PASS.
- [ ] **Step 5: Commit** — `feat(jump): /api/jump-publico con la próxima clase, la encuesta y el voto público`

### Task 5: Landing — encuesta real, textos nuevos y JC

**Files:**
- Modify: `jump/index.html`:
  - sección `#encuestas`: etiqueta, párrafo, pasos, tarjeta (sin «Vista de ejemplo» ni nota de demo; la invitación
    reemplaza el `form#propose`);
  - pregunta frecuente «¿Cómo propongo un curso?»;
  - `<link rel="stylesheet" href="/jump/jc/jc.css">`.
- Modify: `jump/landing.js` (quitar la encuesta de demostración)
- Create: `jump/publico.js` (`cargarPublico(): Promise<{clase, encuesta}>`, memorizada; ante un error resuelve
  `{clase:null, encuesta:null}`), `jump/landing-encuesta.js`, `jump/landing-jc.js`
- Test: escenarios UI en Task 9

**Interfaces:**
- Consumes: `GET/POST /api/jump-publico` (Task 4), `crearJC` (Task 3), `FRASES`/`ESPECIALES`/`elegir`/
  `anunciosLanding`/`Memoria` (Task 2).
- **`landing-encuesta.js`:**
  - Pinta las barras con las clases `.opt/.fill/.pct/.mine` ya existentes; si hay más de 8 opciones, muestra las 8
    con más votos y un botón «Ver todas».
  - Texto de `#votes`: «Toca una opción para votar» / «Ya votaste · puedes cambiar tu voto» / «Encuesta cerrada».
  - El voto del aparato se guarda en `localStorage["jump.voto.{encuestaId}"]` y el id en `jump.dispositivo`
    (`crypto.randomUUID()`).
  - Si no hay encuesta: «Pronto abriremos la primera encuesta». Si el voto falla: mensaje en `#pollMsg` (429 →
    «Ya llegaron muchos votos desde esta conexión. Intenta más tarde.»).
- **`landing-jc.js`:**
  - En la portada, JC grande anclado en `.hero` (ancla `.hero-copy .ctas` en escritorio). Cuando un
    IntersectionObserver ve que `.hero` sale de la vista, pasa a esquina; cuando vuelve, regresa a la portada.
  - Cada sección (`.salto, #incluye, #momentos, #modulos, #encuestas, .josue, #padrinos, #proceso, #postula, #preguntas`),
    al cruzar el 50 % del viewport, llama a `elegir({lugar:"landing", seccion, alLlegar:true})`.
  - Primera visita: `saludo("landing")`. Después, la clase si la hay.
  - Al tocar: salta + `elegir({alLlegar:false})`.
- **Textos exactos:** los de spec §5.4.

- [ ] **Step 1:** Escenarios UI de la landing en `cdp.mjs`, grupo `jc` (Task 9 los define; aquí se escriben los de
  la landing primero): `landing-encuesta-real`, `landing-voto-cambia`, `landing-sin-encuesta`,
  `landing-jc-saluda`, `landing-jc-esquina`, `landing-textos`.
- [ ] **Step 2: Run** `node ui/cdp.mjs jc` → FAIL (grupo y elementos inexistentes).
- [ ] **Step 3: Implement** el HTML, `publico.js`, `landing-encuesta.js` y `landing-jc.js`, y quitar el bloque de
  demo de `landing.js` (las líneas «encuesta de demostración»).
- [ ] **Step 4: Run** `node ui/cdp.mjs jc` y `node ui/cdp.mjs jc --movil` (escenarios de landing) +
  `node ui/cdp.mjs postulaciones` → PASS. Correr `node ../../scripts/csp.mjs --check` → OK.
- [ ] **Step 5: Commit** — `feat(jump): la landing usa la encuesta real y JC la recorre`

### Task 6: Comunidad — datos y tarjeta de encuesta (Inicio y muro)

**Files:**
- Modify: `jump/comunidad/js/datos.js` (sección «encuestas»)
- Create: `jump/comunidad/js/vistas-encuestas.js` (tarjeta del emprendedor + panel del equipo de Task 7)
- Modify: `jump/comunidad/js/vistas-emprendedor.js` (tarjeta en `vInicio`), `jump/comunidad/js/vistas-muro.js`
  (tarjeta fijada arriba en `vMuro` para el emprendedor), `jump/comunidad/js/app.js` (módulo en `MODULOS`),
  `jump/comunidad/app.css` (estilos de la tarjeta, reutilizando los de `.poll` de la landing)

**Interfaces:**
- Consumes: RPC y tablas (Task 1).
- Produces (en `datos.js`):
  - `cargarEncuesta(): Promise<EncuestaMiembro|null>`. Es `null` si no hay encuesta o falta la 0003 (códigos
    `PGRST205`/`42P01`/`PGRST202`).
    - `EncuestaMiembro = { id, pregunta, estado, opciones: [{id, texto, porcentaje, propuestaPor}], miVoto: uuid|null, yaPropuse: boolean }`.
  - `votarEncuesta(opcionId): Promise<void>` (rpc `jump_votar`).
  - `proponerCurso(encuestaId, texto): Promise<uuid>` (rpc `jump_proponer`). Los errores se traducen a `ErrorJump`:
    - `"idea_repetida"`: «Esa idea ya está en la lista: vota por ella.»
    - `"ya_propuso"`: «Ya propusiste un curso en esta encuesta.»
    - `"encuesta_cerrada"`: «Esta encuesta ya se cerró.»
- Produces (en `vistas-encuestas.js`):
  - `tarjetaEncuesta(e: EncuestaMiembro): string`
  - acciones `data-act="votar-encuesta"` (data-id) y envío `form#proponerForm`.
  - Después de votar o proponer, vuelve a pedir la encuesta y redibuja solo la tarjeta (`[data-encuesta]`).
- `vistas-emprendedor.js` exporta `datosJC(): {yo, clases, avisos, mentorias, encuesta}|null`. El `cargar()` del
  Inicio también pide `cargarEncuesta()` en paralelo y la guarda en `D.encuesta`.

- [ ] **Step 1:** Escenarios UI (grupo `jc`): `comunidad-encuesta-inicio`, `comunidad-votar-cambiar`,
  `comunidad-proponer-una-vez`, `comunidad-idea-repetida`, `comunidad-muro-fijada`.
- [ ] **Step 2: Run** `node ui/cdp.mjs jc` → FAIL en esos.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node ui/cdp.mjs jc`, `node ui/cdp.mjs emprendedor`, `node ui/cdp.mjs muro` → PASS.
- [ ] **Step 5: Commit** — `feat(jump): encuesta del mes en el Inicio y en el muro de la comunidad`

### Task 7: Panel del equipo — sección Encuestas y ejemplos

**Files:**
- Modify: `jump/comunidad/js/vistas-encuestas.js` (ruta `a/encuestas`), `jump/comunidad/js/app.js` (en
  `MENU.a`, después de Postulaciones: `["a/encuestas", "chart", "Encuestas", null]`; si no existe el ícono
  `#i-chart` en `index.html`, agregar el símbolo al sprite), `jump/comunidad/js/datos.js`, `api/_jump/ejemplos.js`
  (cargar una encuesta abierta de ejemplo con las 4 opciones de la demo de la landing; borrarla con las demás. Si
  falta la tabla, se omite sin fallar)
- Test: `tests/jump/api-ejemplos.test.mjs` (caso nuevo) + escenarios UI

**Interfaces:**
- Produces (en `datos.js`):
  - `listarEncuestas(): Promise<EncuestaAdmin[]|"sin_tabla">`
    - `EncuestaAdmin = { id, pregunta, estado, abiertaEn, cerradaEn, esEjemplo, opciones: [{id, texto, orden, propuestaPor, publico, inscritos}] }`
  - `guardarEncuesta({ id?, pregunta, opciones: [{id?, texto}] }): Promise<uuid>`: crea o actualiza; inserta,
    actualiza y borra las opciones según la lista.
  - `abrirEncuesta(id)` (rpc `jump_abrir_encuesta`), `cerrarEncuesta(id)`, `borrarEncuesta(id)`,
    `borrarOpcion(id)`.
- **Pantalla `a/encuestas`:**
  - Lista con la abierta arriba y después borradores y cerradas. Una tarjeta por encuesta con barras de conteo
    «público N · inscritos N» y «Propuesta por {nombre}» (de `jump_miembros`).
  - Editor en línea de pregunta y opciones (agregar, quitar, subir/bajar, corregir).
  - Botones «Abrir» (si hay otra abierta: confirmación «Se cerrará “{pregunta}”.»), «Cerrar» y «Borrar».
  - Quitar una opción con votos pide confirmación: «Se perderán {n} votos.».
  - Sin la 0003, muestra un panel vacío: «Falta aplicar la migración 0003 en Supabase para usar las encuestas.»

- [ ] **Step 1:** Test `"ejemplos: carga una encuesta abierta de ejemplo y la borra con lo demás"` en
  `api-ejemplos.test.mjs` + escenarios UI `panel-crear-abrir`, `panel-abrir-cierra-otra`,
  `panel-quitar-opcion-confirma`, `panel-sin-0003`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test api-ejemplos.test.mjs`, `node ui/cdp.mjs jc`, `node ui/cdp.mjs admin`,
  `node ui/cdp.mjs ajustes` → PASS.
- [ ] **Step 5: Commit** — `feat(jump): el equipo crea, edita, abre y cierra encuestas desde el panel`

### Task 8: JC en la comunidad

**Files:**
- Create: `jump/comunidad/js/jc-comunidad.js`
- Modify: `jump/comunidad/js/app.js` (en `pintar`, después de `despues?.()`, llamar `jcPantalla(path, estado.yo)`;
  en `cerrarSesion`, `jcPantalla("ingreso", null)`), `jump/comunidad/index.html` (`<link>` a `/jump/jc/jc.css`)

**Interfaces:**
- Consumes: `crearJC` (Task 3), `anunciosComunidad`/`elegir`/`ordenarPorPantalla`/`Memoria`/`ESPECIALES` (Task 2),
  `datosJC()` (Task 6).
- Produces: `jcPantalla(path: string, yo: object|null): void`.
  - Para `ingreso`, rol admin, `debeCambiarClave` o `path` que empieza con `e/m/`: JC se oculta del todo.
  - En `e/inicio`: grande, anclado a `.page-head`.
  - En el resto de `e/*`: esquina.
  - Al llegar dice `elegir(...)`. Si es la primera visita, `saludo("comunidad")`. Si no venía hace 7+ días,
    `regreso()`. `body.jc-sobre-barra` se pone cuando `matchMedia("(max-width: 900px)")`.

- [ ] **Step 1:** Escenarios UI (grupo `jc`): `comunidad-jc-inicio-grande`, `comunidad-jc-esquina`,
  `comunidad-jc-no-en-panel`, `comunidad-jc-no-en-video`, `comunidad-jc-anuncia-clase`, `comunidad-jc-esconder`
  (lo recuerda al recargar).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node ui/todo.mjs` (todos los grupos, incluido `jc`) → «Todo en verde».
- [ ] **Step 5: Commit** — `feat(jump): JC acompaña a los emprendedores en la comunidad`

### Task 9: Grupo UI `jc`, privacidad, guía y cierre

**Files:**
- Modify: `tests/jump/ui/cdp.mjs` (grupo `jc` y su `PREPARAR`), `tests/jump/ui/todo.mjs` (agregar `"jc"` a
  `GRUPOS`), `jump/comunidad/privacidad.html` (sección «Encuestas» dentro de «2. Datos que usamos» y «6. Cuánto
  tiempo los guardamos»), `docs/jump/PUESTA-EN-MARCHA.md` (paso «Aplicar la 0003»)

**Interfaces:**
- Escenarios transversales:
  - `jc-no-tapa`: `document.elementFromPoint` en el centro del botón «Enviar postulación» y de una opción de la
    encuesta devuelve ese elemento, no algo de `.jc-escena`.
  - `desborde`: `desborde() === 0` en la landing y la comunidad, en escritorio y celular.
  - `sin-0003`: simulador con base `{ hasta: "0002" }`; la landing, el Inicio y `a/encuestas` cargan sin errores en
    consola.
  - `jc-reduced-motion`: `Emulation.setEmulatedMedia` `prefers-reduced-motion: reduce`; al bajar, JC pasa a la
    esquina sin animación de salto (`getAnimations().length === 0` en `.jc`).
- Privacidad: texto corto. Explica que al votar sin cuenta se guarda una huella de la conexión y del aparato (no la
  IP), solo para contar un voto por aparato, y que se borra con la encuesta. `VERSION_PRIVACIDAD` no cambia (no
  pide volver a aceptar).

- [ ] **Step 1–4:** escribir los escenarios y correr `node ui/todo.mjs` + `node --test` → todo verde.
  `node scripts/csp.mjs --check` → OK.
- [ ] **Step 5: Commit** — `test(jump): escenarios de JC y encuestas; aviso de privacidad y guía con la 0003`
