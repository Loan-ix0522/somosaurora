# JC en el sitio de JUMP + encuestas de verdad — diseño

Fecha: 2026-10-25 · Repo: Somosaurora/somosaurora · Rama: `feat/jump-jc` (sale de `main` = `3cf7e0b`)

## 1. Qué es y por qué

JC es el personaje animado de JUMP: un chibi 2D parecido a Josué Constante, con un dibujo distinto por ánimo y
una caminata de verdad. La demo ya está aprobada por el usuario («ya quedó perfecto, así queda»). Ahora JC pasa a
vivir en las dos páginas reales de JUMP:

- **Landing pública** `/jump/` (`jump/index.html` + `jump/landing.js`).
- **Comunidad JUMP** `/jump/comunidad/`, el área de los emprendedores (`jump/comunidad/…`, supabase-js en el
  navegador con RLS).

Para qué sirve: que la página se sienta viva y que JC **cuente lo que pasa de verdad**, como la próxima clase en
vivo, la encuesta abierta o el módulo pendiente, sin que nadie del equipo escriba nada aparte. El cliente lo pidió
así desde el principio: JC debe «recorrer» la landing y el área de estudiantes, dar las noticias en globos de diálogo
y hacer algo divertido al tocarlo.

De paso nacen las **encuestas de verdad**. Hoy la landing muestra una encuesta de ejemplo («Vista de ejemplo»,
no guarda nada). La de verdad la maneja el equipo desde el panel y se vota en la landing y en la comunidad.

### Lo que dice JC tiene que calzar con el lugar

Lo que dice JC depende de dónde aparece:
- En la landing no da noticias de la comunidad.
- En la landing sí anuncia la próxima clase en vivo, con día y hora.
- En la comunidad avisa lo que ya está en los datos.

## 2. Metas, no metas y anti-metas

**Metas**
1. JC vive en la landing y en la comunidad (solo para los emprendedores), con la ubicación y el comportamiento de §3.
2. Anuncia datos reales: la próxima clase en ambas páginas; en la comunidad también la encuesta sin votar, las
   mentorías nuevas y avisos del equipo, y el módulo pendiente.
3. Tiene 50 frases fijas: 5 por ánimo para cada página (§6). Cada frase lleva la cara de su ánimo.
4. Las encuestas son reales: el equipo las crea y edita desde el panel. Votan los emprendedores en la comunidad (y
   pueden proponer cursos) y **cualquier visitante** en la landing.

**No metas** (fuera de este trabajo)
- Editar las frases de JC desde el panel. Van fijas en el código; se puede hacer después.
- JC dentro del panel del equipo.
- Ánimos con movimiento real (clips nuevos). Costaría ~27 créditos de Higgsfield y **no está autorizado**. Se usan
  los dibujos y la caminata que ya existen; no se gasta ningún crédito.
- Varias encuestas abiertas a la vez, preguntas de varias respuestas o de texto libre.
- Sonido.

**Anti-metas** (si pasa esto, está mal aunque «funcione»)
- Que JC tape algo que la persona necesita: el botón de enviar postulación, la encuesta en el celular, el video de un
  módulo, un campo con el teclado abierto. Su caja nunca debe atrapar clics fuera de su cuerpo y su globo.
- Que JC hostigue: que repita lo mismo, hable sin parar o vuelva a salir después de que lo escondieron.
- Que la landing muestre algo privado (enlace de Zoom, nombres, datos de ejemplo) o algo inventado.
- Que la landing o la comunidad se pongan lentas por JC.
- Que JC diga «barrio»: La Aurora es una **comunidad** (o un sector).

## 3. Lo que decidió el usuario

### Dónde vive (opción C en las dos páginas)

**Landing: grande en la portada, después en la esquina.**
- Al entrar, JC aparece grande en la portada (hero), parado entre el texto y la foto de Josué. Saluda y anuncia
  la próxima clase.
- Cuando la portada sale de la vista al bajar, JC **salta** a la esquina de abajo a la derecha en pequeño y sigue
  ahí comentando la sección que estás viendo. Si vuelves arriba, regresa a la portada.
- En el celular hace lo mismo, más pequeño.

**Comunidad: grande en el Inicio, después en la esquina.**
- En `#e/inicio`, JC aparece grande junto al saludo «Hola, {nombre}» y da las novedades.
- En las demás pantallas del emprendedor (Mentorías, Clases, Comunidad, Avisos, Mi perfil) está pequeño en la
  esquina de abajo a la derecha.
- En el celular, la esquina queda **encima de la barra de abajo** (`.tabbar`) y de los avisos emergentes (`.toast`).

Maquetas que vio y eligió el usuario:
`scratchpad/jc-montaje/.superpowers/brainstorm/201-1792965357/content/landing-lugar.html` y `comunidad-lugar-v2.html`.

### Cómo se porta

- **Cuándo habla:**
  - En la landing, una vez al llegar a una sección nueva.
  - En la comunidad, una vez al cambiar de pantalla.
  - Al tocarlo, salta y dice lo siguiente.
- **Cuánto dura el globo:** según lo largo de la frase, **mínimo 10 s y máximo 15 s**, para que se pueda leer
  bien. Mientras el mouse está encima, el globo tiene el foco o se está tocando, no se cierra.
- **Después de hablar:** queda en reposo. Respira y parpadea según su ánimo, y de vez en cuando da unos pasos con la
  caminata real. No repite una frase en la misma visita.
- **Saludo:** «¡Hola, soy JC!» solo la primera vez que alguien entra a cada página. Se recuerda en el navegador.
- **Al tocarlo:** salta como en la demo (dibujo de salto en el aire, aplastado al caer) y dice lo siguiente de su
  lista.
- **Esconderlo:** tiene un botón para esconderlo. En su lugar queda una burbuja pequeña con su cara, que lo trae
  de vuelta. Se recuerda en el navegador.
- **Ánimo:** cada frase trae su ánimo y JC pone esa cara. El cambio de dibujo se tapa con el «boing» de 260 ms de
  la demo.
- **Orden en la comunidad**, de más a menos importante:
  1. Clase en vivo que ya empezó, o que es hoy.
  2. Próxima clase en los próximos 7 días (frase «clase futura»).
  3. Encuesta abierta en la que no ha votado.
  4. Mentoría nueva o aviso nuevo del equipo que todavía no vio.
  5. Su siguiente módulo pendiente.
  6. Una frase suelta de la pantalla donde está.
- **En el Inicio dice una sola cosa al llegar:** la primera de la lista. Lo demás lo cuenta si lo tocan, una cosa
  por toque. En las otras pantallas va primero lo que tiene que ver con esa pantalla: en Clases, la clase; en
  Mentorías, el módulo pendiente; en Comunidad, la encuesta. Si no hay nada, dice una frase suelta de esa pantalla.
- **Cuántas veces dice cada anuncio** (se guarda en el navegador):
  - Clase: una vez por estado. «Futura», «hoy» y «empezó» son tres anuncios distintos de la misma clase.
  - Encuesta sin votar y módulo pendiente: como mucho una vez al día al llegar, hasta que vote o termine el módulo.
    Al tocarlo sí se pueden repetir.
  - Mentoría nueva y aviso nuevo: una sola vez.
  - Saludo «Hola, soy JC»: una sola vez por página.
  - Frases sueltas: no se repite ninguna en la misma visita mientras queden otras sin decir.
- **Saludo de regreso:** si la persona no entraba hace 7 días o más, al volver JC usa la frase triste de regreso
  (§6.3).

### Encuestas

- **Panel del equipo:** sección nueva **Encuestas**.
  - El equipo escribe la pregunta y las opciones. Puede corregir cualquier texto, agregar o quitar opciones, y abrir
    o cerrar la encuesta.
  - Hay **una sola encuesta abierta a la vez** (la «Encuesta del mes»). Las cerradas quedan en una lista con su
    resultado.
  - El equipo ve los votos de cada opción separados en **público** e **inscritos**, y quién propuso cada idea.
    Puede borrar ideas.
  - Si quita una opción que ya tiene votos, el panel avisa cuántos votos se pierden antes de borrarla.
- **Comunidad:**
  - No hay sección nueva en el menú (la barra de abajo del celular ya tiene 5). La encuesta sale como **tarjeta en el
    Inicio** y **fijada arriba en Comunidad** (el muro).
  - El emprendedor vota y puede cambiar su voto. Puede proponer **un curso por encuesta**; la idea entra a la lista
    al instante con un voto suyo, igual que en la demo de la landing.
- **Landing:**
  - La sección Encuestas que ya existe muestra la encuesta real.
  - **Vota cualquier visitante** sin cuenta: un voto por aparato, que puede cambiar desde ese mismo aparato. El voto
    pasa por el servidor, con límite por conexión.
  - En la landing no se proponen cursos; ese recuadro cambia por una invitación a inscribirse (§5.4).
  - Si no hay encuesta abierta, se muestra el resultado de la última con la marca «Encuesta cerrada».
- **Resultado público:** en la landing y en la comunidad sale **un solo resultado**, con los votos públicos e
  inscritos sumados.

## 4. Restricciones

- **Mismo stack:** HTML, CSS y JS sin librerías nuevas, módulos ES como el resto de `jump/`, y funciones Edge de
  Vercel en `api/` con el mismo estilo de `api/jump-postular.js` (mismo origen, `leerJson` con tope, `service_role`
  solo en el servidor).
  - Ya hay 15 funciones en `api/`. Conviene **una sola función nueva** para todo lo público de la landing (leer la
    encuesta, leer la próxima clase, votar).
- **Base de datos:**
  - Las tablas nuevas van en la migración `supabase/jump/0003_encuestas.sql`, dentro del **proyecto de Supabase de
    JUMP** (no el de La Aurora). Debe poder correrse dos veces sin romper nada, como la 0001 y la 0002.
  - **Yo no la aplico.** La aplica el dueño en el SQL Editor; el usuario pidió que le avisaran y ya está avisado.
  - Mientras no esté aplicada, el panel y la landing tienen que funcionar sin romperse: el panel explica qué falta
    (como hace Postulaciones) y la landing muestra la sección sin encuesta.
  - **No usar el MCP de Supabase de esta sesión** (es de otro cliente).
- **Secretos:** `service_role` y `JUMP_SECRET` viven solo en Vercel. Nada de llaves en el código ni en el chat.
- **Privacidad:**
  - De los visitantes que votan se guarda solo una huella de la conexión, igual que hoy en postulaciones (`huellaIp`),
    y una huella del identificador del aparato. Nunca la IP ni nada personal.
  - Los datos de ejemplo (`es_ejemplo`) **nunca** salen en la landing: ni la clase ni la encuesta.
- **Seguridad (riesgo ALTO según loanix-security-core):** es una escritura pública sin cuenta.
  - Hay que probar el límite de votos, la validación de que la opción pertenece a la encuesta abierta, y que con RLS
    nadie pueda votar por otro ni leer quién votó.
- **Peso:**
  - Los dibujos pesan ~40–50 KB cada uno y se cargan al aparecer JC.
  - La tira de caminata (`jc-caminar.webp`, 486 KB) se carga **después** de que la página está lista; hasta entonces
    JC no camina.
  - JC no puede retrasar el primer pintado de la landing.
- **Accesibilidad:**
  - JC es un botón con nombre accesible. Su estado se describe con el `aria-label` que ya arma la demo
    (`COMO_ESTA`).
  - Los globos se leen con `aria-live="polite"`. JC nunca roba el foco. El botón de esconder es alcanzable con el
    teclado.
  - Con `prefers-reduced-motion` no camina ni salta entre la portada y la esquina (aparece y desaparece suave), pero
    sigue hablando.
- **Copy:**
  - Español neutro tuteando, como el resto de JUMP. «Comunidad», nunca «barrio».
  - No repetir datos que siguen sin confirmar: «40 cupos» y la fecha de convocatoria están pendientes con Josué.
- **Commits y PR:** el autor de los commits es `Somosaurora <342539203+Somosaurora@users.noreply.github.com>`. Se
  hace push al fork `Loan-ix0522/somosaurora` y se abre un PR al repo del cliente. **No tocar `main`** sin preguntar.

## 5. Cómo funciona por dentro

### 5.1 Recursos de JC

- **Referencia aprobada:** `C:/Users/Luisma/Downloads/somos aurora/mockups/jump/jc-2d/index.html`. La animación
  se lleva tal cual; el builder la parte en módulo reutilizable. De ahí salen:
  - las capas `.jc` / `.jc-giro` / `.jc-salto` / `.jc-cambio` / `.jc-animo` / `.jc-cuerpo`;
  - las posiciones en % de cada dibujo y los párpados por cara;
  - la caminata con `steps(14)`, que avanza a 1 ancho de JC por segundo;
  - el salto con WAAPI y el «boing»;
  - `colocarGlobo()`.
- **Archivos a copiar al repo en `jump/jc/`:**
  - `jc-reposo.webp` 325×681
  - `jc-feliz.webp` 396×684
  - `jc-triste.webp` 322×683
  - `jc-enojado.webp` 325×676
  - `jc-bromista.webp` 331×683
  - `jc-salto.webp` 505×617
  - `jc-caminar.webp` 5222×703 (14 cuadros de 373×703, 1,1667 s)
- Los scripts de recorte (`recortar.py`, `exportar.py`, `caminata/extraer.py`) se quedan en `mockups/` y no van al
  sitio.
- **Ánimos y dibujos:** tranquilo = `reposo`, feliz, triste, enojado, bromista. `salto` se usa solo en el aire.

### 5.2 Un solo JC para las dos páginas

Va un módulo compartido en `jump/jc/` (JS + CSS). Cada página le pasa qué decir:
- la landing, sus secciones;
- la comunidad, la pantalla actual y los datos que ya cargó `datos.js`.

El módulo recibe frases con este formato: `{ texto, animo, clave }`. La `clave` sirve para no repetir una frase y
para recordar los anuncios ya dichos. El módulo se encarga de:
- la ubicación (grande o esquina) y el salto entre las dos;
- los turnos de habla: nunca interrumpe un globo abierto, deja una cola corta y descarta lo viejo;
- esconder y mostrar;
- lo que se guarda en el navegador: `localStorage` con try/catch, y si falla todo funciona igual, solo que sin
  recordar.

Las claves del navegador son estas:
- saludado (por página)
- escondido
- última visita
- anuncios ya dichos (por id)

Las CSP de `/jump` y `/jump/comunidad` deben seguir pasando. Todo es del mismo origen.

### 5.3 Datos que lee JC

- **Comunidad:** usa lo que ya carga la app. Nada de llamadas nuevas, salvo la encuesta.
  - **Clase:** `proximas()` / `estadoClase()`.
  - **Avisos:** `jump_avisos` con `jump_avisos_vistos`. Los de tipo `mentoria` son «hay una mentoría nueva». Los de
    tipo `invitacion` se saltan, porque la clase ya la anuncia por su cuenta.
  - **Módulo pendiente:** `retomar()` / `siguiente()`.
  - **Encuesta:** abierta y sin voto propio.
- **Landing:** la función pública nueva devuelve:
  - la **próxima clase**: la que está en vivo o la siguiente futura, sin `es_ejemplo`, suelta o de una mentoría
    publicada. Solo `titulo`, `inicia_en` y `duracion_min`, nunca `mensaje` ni Zoom. Si no hay, no hay anuncio.
  - la **encuesta** abierta o la última cerrada, con porcentajes.
  - Sale con un caché corto, porque la landing tiene tráfico público.
- Las fechas se muestran en hora de Ecuador con el formato de `fechas.js` de la comunidad, por ejemplo «el martes 28
  a las 7 p. m.».

### 5.4 Encuestas

**Modelo sugerido** (el builder puede ajustarlo si respeta las reglas):
- `jump_encuestas`: pregunta, estado (`borrador` / `abierta` / `cerrada`), fechas, `es_ejemplo`, creada_por.
  - Un índice único parcial garantiza una sola `abierta`.
- `jump_encuesta_opciones`: encuesta, texto, orden y `propuesta_por` (uuid del emprendedor o null si la puso el
  equipo).
  - Un trigger limita a una propuesta por persona en cada encuesta, al estilo de `jump_limite_posts`.
- `jump_encuesta_votos`: encuesta, opción, origen (`inscrito` / `publico`), `user_id` **o**
  `dispositivo_hash` + `ip_hash`.
  - Hay un único voto por (encuesta, user_id) y otro por (encuesta, dispositivo_hash). Cambiar el voto actualiza esa
    fila.
  - Al borrar una opción se borran sus votos.

**Reglas (RLS y funciones)**
- **El emprendedor activo** (`jump_es_miembro()`):
  - lee la encuesta abierta y la última cerrada, con sus opciones;
  - crea o cambia **su** voto en una encuesta abierta;
  - propone una opción;
  - ve porcentajes con una función `security definer` que devuelve solo totales por opción, nunca quién votó.
- **El equipo** (`jump_es_admin()`): lo hace todo y ve los conteos por origen y quién propuso.
- **Público:** nadie escribe desde el navegador sin sesión. El voto de la landing entra por la función nueva con
  `service_role`, que hace esto:
  1. revisa el mismo origen;
  2. revisa que la encuesta esté abierta y que la opción sea de esa encuesta;
  3. guarda o cambia el voto del aparato;
  4. aplica un tope de votos por conexión (pensado para que una casa o una feria con el mismo wifi pueda votar, pero
     no un script);
  5. devuelve los porcentajes nuevos.
- El aparato se identifica con un id al azar guardado en el navegador. El servidor guarda solo su huella HMAC.

**Pantallas**
- **Panel:**
  - Sección Encuestas en el menú del equipo, en la parte que no va a la barra de abajo, como Postulaciones.
  - Una lista con la abierta arriba y luego borradores y cerradas.
  - Un editor de pregunta y opciones (agregar, quitar, ordenar, corregir).
  - Botones Abrir y Cerrar. Abrir una cierra la que esté abierta, con confirmación.
  - Resultados con conteos público/inscritos y quién propuso cada idea.
  - Borrar idea con confirmación.
  - Las encuestas de ejemplo entran en «datos de ejemplo» de Ajustes, igual que lo demás.
- **Comunidad:**
  - La tarjeta «Encuesta del mes» en el Inicio y fijada arriba en el muro, con barras como la demo de la landing.
  - Se toca una opción para votar o cambiar el voto. Hay un campo «Propón otro curso» mientras no haya propuesto.
- **Landing**, sección `#encuestas`:
  - Se reemplaza la demo de `landing.js` por datos reales con la misma tarjeta y animación de barras.
  - El texto de la parte de abajo dice «Toca una opción para votar» o «Ya votaste · puedes cambiar tu voto».
  - Si no hay ninguna encuesta, la tarjeta dice «Pronto abriremos la primera encuesta».

**Textos de la landing que cambian** (propuesta, va con el documento para revisión):
- Etiqueta (sin candado): «Solo para emprendedores inscritos» → «Vota aunque no estés inscrito».
- Párrafo: «Cualquiera puede votar por el taller que le serviría más. Los inscritos, además, proponen cursos nuevos.
  Con eso, JUMP sabe qué talleres abrir.»
- Pasos:
  - «Propones — Los inscritos escriben, desde la Comunidad JUMP, el curso que les haría falta.»
  - «Todos votan — Cualquiera puede votar aquí mismo, un voto por persona.»
  - «Se abre el taller — Lo más pedido se convierte en el próximo taller de JUMP.»
- Se quitan «Vista de ejemplo» y la nota de demo. El formulario «Propón otro curso» se cambia por: «¿Tienes una idea
  de curso? Inscríbete y propónla en la Comunidad JUMP.», con enlace a `#postula`.
- Preguntas frecuentes, «¿Cómo propongo un curso?»: «Cuando estés inscrito, entras a la Comunidad JUMP y propones tu
  curso en la Encuesta del mes. Para votar no necesitas cuenta: hazlo aquí mismo, en Encuestas.»

## 6. Las frases de JC

Cada frase lleva su ánimo y la sección o pantalla donde se dice. Las que tienen `{…}` se llenan con datos reales.
Todas deben leerse en 10–15 s. **Las revisa el usuario; si cambia alguna, se cambia aquí antes de construir.**

### 6.1 Especiales (no cuentan en las 50)

| Dónde | Ánimo | Frase |
|---|---|---|
| Landing y comunidad, primera visita | feliz | ¡Hola, soy JC! Te acompaño mientras conoces JUMP. *(en la comunidad: «¡Hola, soy JC! Aquí te cuento lo nuevo de JUMP.»)* |
| Landing y comunidad, clase futura | tranquilo | La próxima clase en vivo es «{título}», el {día} a las {hora}. |
| Landing y comunidad, clase hoy | feliz | ¡Hoy hay clase en vivo! «{título}» a las {hora}. *(comunidad termina con* «¡Te espero!»*; landing con* «Así se aprende en JUMP.»*)* |
| Landing y comunidad, clase empezada | feliz | ¡La clase en vivo ya empezó! *(landing:* «Los inscritos ya están en clase en vivo.» *· comunidad:* «Entra desde Clases en vivo.»*)* |
| Comunidad, encuesta sin votar | bromista | Hay encuesta abierta y todavía no votas. ¡Tu voto cuenta! |
| Comunidad, mentoría nueva | feliz | ¡Hay una mentoría nueva: «{título}»! |
| Comunidad, aviso nuevo | tranquilo | El equipo publicó un aviso: «{primeras palabras}…» |
| Comunidad, módulo pendiente | bromista | Te falta el módulo {n} de «{mentoría}». ¡Tú puedes! |
| Comunidad, regreso tras 7+ días | triste | ¡Hace días que no te veía! Te extrañé. |

### 6.2 Landing — 5 por ánimo

**Tranquilo**
1. *(Ya vendes)* Ya vendes. Ahora toca hacerlo en regla, paso a paso y sin miedo.
2. *(Módulos)* Aquí ves lo que se enseña en JUMP. Toca un módulo para ver su temario.
3. *(Cómo postular)* Postular toma unos minutos: llenas el formulario y te escribimos por WhatsApp.
4. *(Preguntas)* ¿Te queda una duda? Seguro está aquí. Si no, escríbenos por Instagram.
5. *(Padrinos)* Estas marcas creen en los emprendedores de La Aurora y ponen de su parte.

**Feliz**
1. *(Portada, de regreso)* ¡Qué bueno verte de nuevo! ¿Hoy sí das el salto?
2. *(Qué incluye)* Clases, ferias, networking, una vitrina cada semana y marcas padrino. ¡Y todo gratis!
3. *(Así se vive)* ¡Así se vive el salto! Ferias con clientes de verdad y gente de la comunidad.
4. *(Postula)* ¡Postular es gratis y no necesitas tener RUC! Déjanos tus datos aquí abajo.
5. *(Encuestas)* ¡Aquí decides tú! Vota por el taller que más te serviría.

**Triste**
1. *(Ya vendes)* Me da pena ver buenos negocios que se quedan chiquitos por no estar en regla.
2. *(Postula)* Si te quedas con las ganas, me pongo triste. ¡Postular te toma unos minutos!
3. *(Preguntas)* Nadie debería quedarse con la duda. Pregunta lo que necesites por Instagram.
4. *(Módulos)* Yo también le tenía miedo a la factura electrónica… hasta que me la explicaron.
5. *(Encuestas)* Una encuesta sin votos es una encuesta triste. ¡Dale tu voto!

**Enojado** (de broma, nunca contra la persona)
1. *(Cómo postular)* ¡Ojo! Nadie te puede cobrar por postular. JUMP es totalmente gratis.
2. *(Ya vendes)* ¡Me enojan los trámites enredados! Por eso aquí te los explicamos en orden.
3. *(Módulos)* ¿Vender sin saber cuánto ganas de verdad? ¡Eso no! Aquí aprendes a sacar tus costos.
4. *(Encuestas)* ¡Que no decidan por ti! Vota por el taller que de verdad necesitas.
5. *(Qué incluye)* ¿Una vitrina gratis cada semana y todavía lo piensas? ¡Ay, no!

**Bromista**
1. *(Portada)* Toca el logo y mira cómo salta. Yo salto mejor, pero no se lo digas.
2. *(Así se vive)* Psst… en las ferias de noche hay buena comida. Digo, ¡buenos negocios!
3. *(Quién te acompaña)* Este es Josué. Se parece un poquito a mí, ¿no crees?
4. *(Padrinos)* ¿Tu marca quiere apadrinar? Hay espacio… y yo no cobro por saludar.
5. *(Postula)* Dato curioso: para dar el salto no necesitas zapatos especiales. Solo postular.

### 6.3 Comunidad — 5 por ánimo

**Tranquilo**
1. *(Inicio)* Aquí tienes tus mentorías, tus clases y los avisos del equipo. Vamos paso a paso.
2. *(Mentorías)* Cada mentoría tiene videos, clases en vivo y material para descargar.
3. *(Clases)* Las invitaciones a las clases en vivo llegan aquí. Todas son por Zoom.
4. *(Avisos)* Aquí queda todo lo que el equipo comparte con la comunidad.
5. *(Mi perfil)* Mantén tu WhatsApp al día para que el equipo te pueda escribir.

**Feliz**
1. *(Inicio)* ¡Qué bueno verte! Cada módulo que terminas es un escalón más.
2. *(Comunidad)* ¡Cuéntale a la comunidad cómo te va! Aquí todos se apoyan.
3. *(Mentorías)* ¡Terminar una mentoría se siente increíble! Ya verás.
4. *(Clases)* ¡En las clases en vivo puedes preguntar todo lo que quieras!
5. *(Comunidad)* ¡Me encanta ver los negocios de la comunidad creciendo!

**Triste**
1. *(Inicio)* Si un módulo se te hizo difícil, no te rindas. Vuelve a verlo con calma.
2. *(Clases)* ¿Te perdiste una clase? Si el equipo la grabó, la encuentras aquí.
3. *(Comunidad)* El muro está muy calladito… ¿alguien cuenta qué vendió hoy?
4. *(Mentorías)* Me pongo triste cuando un módulo queda a medias. ¡Termínalo!
5. *(Avisos)* Si te perdiste un aviso, aquí siguen todos. Nadie se queda sin enterarse.

**Enojado** (de broma)
1. *(Mi perfil)* ¡Tu clave es solo tuya! No se la pases a nadie, ni a mí.
2. *(Inicio)* ¿Vender sin factura? ¡No en mi guardia! Sigue con tus módulos.
3. *(Comunidad)* ¡Aquí no se vale ofender a nadie! La comunidad es para apoyarnos.
4. *(Clases)* ¡Llega puntual! Las clases en vivo empiezan a la hora.
5. *(Mentorías)* ¡No te saltes los módulos! Van en orden por algo.

**Bromista**
1. *(Inicio)* Yo ya me sé todos los módulos de memoria. Bueno, casi.
2. *(Mentorías)* Ver un módulo con un cafecito rinde el doble. No está comprobado, pero funciona.
3. *(Comunidad)* Si publicas una foto de tu producto, prometo no comérmelo.
4. *(Clases)* En la clase en vivo puedes prender la cámara. Yo siempre salgo guapo.
5. *(Avisos)* Leer los avisos te hace 10 % más formal. Es ciencia JC.

## 7. Decisiones que tomé yo (el usuario puede cambiarlas)

1. **Próxima clase en la landing:** se lee con `service_role` desde la función pública nueva, en vez de abrir la
   tabla de clases al público. Así **la 0003 solo trae encuestas**. Le había dicho al usuario que llevaría también
   «una pieza para la clase»; ya no hace falta.
2. **Resultados públicos solo en porcentajes**, en la landing y en la comunidad. Los conteos los ve solo el equipo.
   Es el mismo criterio del informe ciudadano de La Aurora.
3. **Las encuestas y clases de ejemplo** nunca salen en la landing.
4. En la comunidad, **los avisos de tipo «invitación» no los repite JC**, porque ya anuncia la clase. Los de
   «mentoría» los dice como «mentoría nueva».
5. **«Nuevo» = no visto:** se usa `jump_avisos_vistos`. JC además recuerda en el navegador qué ya anunció, para no
   repetirlo. JC no marca avisos como vistos.
6. **Un emprendedor que vota en la landing** cuenta como voto público. Puede votar en los dos lados; se acepta
   porque el equipo ve los votos separados por origen.
7. **Corregir el texto de una opción** que ya tiene votos está permitido, para arreglar errores.
8. **Ideas de los emprendedores en la landing:** salen al instante, como pidió el usuario. Son personas del programa
   con cuenta y el equipo puede borrarlas. Para que la tarjeta no crezca sin fin, si hay más de 8 opciones la landing
   muestra las 8 con más votos y un botón «Ver todas».
9. **Frases y textos:** el usuario pidió implementar sin esperar otra revisión. Las frases de §6 y los textos de §5.4
   se construyen tal cual. Están todas en un solo archivo para que cambiar una sea trivial cuando las lea en vivo.
10. JC **se esconde** en:
   - la pantalla de ingreso;
   - el cambio de clave de la primera vez;
   - el reproductor de un módulo (`#e/m/…`);
   - todo el panel del equipo;
   - cuando se abre el teclado del celular sobre un campo que él taparía.

## 8. Lo que queda en manos del builder

- Tamaños exactos de JC:
  - Como guía, grande ≈ 300 px en la portada de escritorio y ≈ 160 px en la del Inicio.
  - En la esquina, ≈ 120 px en escritorio y ≈ 84 px en celular.
  - Cuidar que en la portada no tape los botones ni la cara de Josué.
- La animación del salto entre la portada y la esquina, siguiendo la demo y la skill `animate`.
- Cada cuánto da unos pasos en reposo y hasta dónde camina.
- El cálculo exacto del tiempo del globo, dentro de 10–15 s.
- Los números del tope de votos por conexión y por cuánto tiempo se guarda la huella de los votos públicos.
- El nombre de la función nueva y el modelo de datos final, si cumplen §5.4.
- Las pruebas, con el mismo estilo del repo:
  - `tests/jump` con `node --test`, pglite para RLS y el simulador de pantallas.
  - Mínimo: RLS de encuestas, voto público con sus límites, que la landing nunca devuelva datos de ejemplo ni campos
    privados, y el comportamiento de JC (no repetir, esconder y recordar, orden de prioridad).
- Actualizar `docs/jump/PUESTA-EN-MARCHA.md` con el paso de aplicar la 0003.
- Agregar una sección «Encuestas» al aviso de privacidad de JUMP (`jump/comunidad/privacidad.html`, donde ya está la
  de postulaciones). Debe explicar qué se guarda del voto público (huellas, no la IP) y por cuánto tiempo. Va con la
  skill `loanix-web-legal`.
