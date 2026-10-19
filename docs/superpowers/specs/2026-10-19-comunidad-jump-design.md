# Comunidad JUMP — diseño técnico (implementación real)

Fecha: 2026-10-19 · Estado: borrador para aprobación · Riesgo: **ALTO** (loanix-security-core: autenticación, roles, panel admin, subida de archivos, datos personales —cédulas—, integración OAuth con secretos)

## 1. Intención

Convertir el mockup aprobado `mockups/jump/plataforma.html` ("El aula") en la plataforma real de la Comunidad JUMP: el programa gratuito de Somos Aurora y Josué Constante que acompaña a emprendedores de La Aurora de la informalidad a la formalidad. El equipo JUMP publica mentorías y clases en vivo; los emprendedores inscritos entran con su cédula, siguen las mentorías, entran a las clases por Zoom, descargan material y conversan en un muro propio. **Todo pasa dentro de la Comunidad JUMP** (palabras del usuario: "hazlo todo comunidad jump").

El diseño visual ya está decidido y no se rediseña: es el del mockup (contrato en `mockups/jump/.impeccable/surfaces/plataforma-html.md`, sistema en `mockups/jump/DESIGN.md`). Este documento cubre lo que falta: datos, permisos, servidor, Zoom y despliegue.

## 2. Objetivos

1. **Ingreso**: emprendedor con cédula + clave; equipo JUMP con usuario + clave. Sin registro público: las cuentas las crea el equipo. Clave temporal que se cambia obligatoriamente en el primer ingreso. Cuenta suspendida no entra.
2. **Emprendedor**: inicio ("Sigue donde quedaste", próxima clase, mentorías, avisos), mentorías publicadas (todas, para todos los activos), aula con módulos de video o en vivo, marcar visto (con el salto de la figura), material por módulo y por mentoría, clases en vivo con "Asistiré", avisos, muro, perfil (negocio, WhatsApp, cambiar clave).
3. **Equipo JUMP (admin)**: resumen, mentorías (crear/editar/publicar con N módulos video o en vivo + material), clases en vivo (programar, crear reunión de Zoom, invitación automática a todos los activos dentro de la comunidad, subir enlace de grabación), emprendedores (agregar, suspender, reactivar, clave nueva), avisos, moderación del muro, ajustes (cuenta de Zoom, datos de ejemplo).
4. **Zoom**: el admin conecta, **cambia** o desconecta la cuenta de Zoom desde su panel con OAuth. Al programar una clase, el sistema crea la reunión en esa cuenta.
5. **Muro de la comunidad**: los emprendedores publican texto y foto y comentan. Se ve al instante; el equipo puede ocultar publicaciones o comentarios y suspender a quien abuse.
6. **Datos de ejemplo**: el sistema arranca con ejemplos marcados como tales; el admin los borra todos con un botón cuando empiece lo real.

## 3. No-objetivos (esta entrega)

- Envío automático por WhatsApp o correo (requiere proveedores pagados). En su lugar: botón que abre WhatsApp con el mensaje listo (enlace `wa.me`) para mandar la cédula y la clave temporal a un emprendedor nuevo. Todas las invitaciones y avisos llegan dentro de la comunidad.
- Notificaciones push al celular.
- Subir archivos de video (el plan gratis de Supabase tiene 1 GB). Los videos van como enlaces de YouTube o Vimeo (pueden ser "no listados"). Las grabaciones de Zoom también se publican como enlace.
- La landing (`mockups/jump/index.html`) y sus formularios "Postula" y encuestas: siguen como mockup; no se publican en esta entrega.
- "Me gusta"/reacciones en el muro, mensajes privados, varias ediciones simultáneas (hay un campo `edicion`, pero una sola activa: "Primera edición").
- App instalable (PWA) de la comunidad: se puede sumar después.

## 4. Anti-objetivos (sería un fracaso aunque funcione)

- Que un emprendedor pueda ver datos de La Aurora Escucha (opiniones, fotos de evidencias) o que un admin de La Aurora Escucha quede afectado.
- Que un emprendedor vea la cédula o el WhatsApp de otro, o contenido en borrador.
- Que un emprendedor suspendido siga viendo contenido con su sesión abierta.
- Que el enlace de Zoom quede expuesto antes de la clase o fuera de la comunidad sin necesidad.
- Que los tokens de Zoom o la clave `service_role` lleguen al navegador.
- Que se borren datos reales al "borrar ejemplos".
- Que el diseño se aleje del mockup aprobado.

## 5. Restricciones

- **Supabase**: el mismo proyecto de La Aurora Escucha (`jdterctcniotbipgwcdv`), decisión del usuario. El dueño aplica las migraciones en el SQL Editor; yo las escribo. El MCP de Supabase de esta sesión apunta a otra cuenta (inmoai) y **no se toca**.
- **Convivencia con La Aurora Escucha**: sus políticas (migración 0002) exigen `public.is_admin()` (correo en la tabla `admins`); los usuarios de JUMP no están en `admins`, así que no ven nada de La Aurora. Las tablas de JUMP llevan prefijo `jump_` en el esquema `public` (no hace falta exponer esquemas nuevos). Hasta hoy el proyecto no tenía usuarios autenticados que no fueran admins; JUMP los introduce, así que la migración:
  1. **Se niega a correr** (lanza un error claro) si alguna política de `submissions`, `weekly_reports`, `featured_opinions` o del bucket `evidencias` para `authenticated` sigue con `using (true)` de la 0001, es decir, si la 0002 no se aplicó.
  2. Endurece `public.is_admin()` con una sola condición extra: `and not exists (select 1 from public.jump_miembros where user_id = auth.uid())`. Una cuenta de JUMP nunca puede ser admin de La Aurora, aunque llegara a tener un correo de `admins`. Es el único cambio a algo existente.
  3. Los roles salen solo de `jump_miembros`; nunca de `user_metadata` (el usuario puede editar su propio metadata).
- **Vercel**: el mismo proyecto de Vercel (despliega desde el fork `Loan-ix0522/somosaurora:main`). Funciones en `/api` con runtime Edge, como las actuales. Variables existentes con nombres no estándar (`ProjectURL`, `anonpublic`, `service_role`): el código nuevo usa los mismos *fallbacks*.
- **CSP**: cada página nueva entra en `scripts/csp.mjs` y `vercel.json`. Se recalcula con `node scripts/csp.mjs` tras editar cualquier script en línea.
- **Copia**: español de Ecuador; "comunidad"/"sector", nunca "barrio". Sin testimonios, cifras ni patrocinadores inventados. Lenguaje que no presupone género ("Cuenta activa", "emprendedor(a)").
- **Logo**: vectores exactos `#jump-letters` y `#fig-glyph`; no se alteran.
- **Fotos**: nunca `assets/josue.webp` (fotograma del video). Solo `josue-hero.webp` y `josue-charla.webp` de Josué.
- **Móvil**: `dvh`, nunca `vh`, para paneles de altura completa.
- **El dueño no usa git**: los cambios se entregan por el fork + PR como hasta ahora.

## 6. Arquitectura

```
Navegador (jump/comunidad/index.html + app.js, supabase-js 2.45.4 con SRI)
   │  sesión de Supabase Auth (JWT)            │  acciones privilegiadas (JWT del admin)
   ▼                                            ▼
Supabase (Postgres + RLS + Storage)  ◄──── Vercel Edge /api/jump-*.js (service_role, verifica rol)
                                                │
                                                └──► Zoom API (OAuth, tokens cifrados en BD)
```

- **Lecturas y escrituras normales** (mentorías, módulos, progreso, clases, avisos, muro, moderación): directo desde el navegador con supabase-js; **RLS** decide quién puede qué.
- **Acciones que tocan `auth.users` o secretos** (crear cuenta, clave nueva, suspender/reactivar, cargar/borrar ejemplos, Zoom): funciones Edge con `service_role`, que primero verifican el JWT del llamador contra `/auth/v1/user` y que su fila en `jump_miembros` sea `rol='admin'` y `estado='activa'`.
- **Rutas**: la comunidad vive en `/jump/comunidad/` dentro del sitio actual. Al publicar se apunta un subdominio (p. ej. `jump.laauroraescucha.com`) con una *rewrite* por host de `/` → `/jump/comunidad/`. La dirección final la decide el usuario al publicar; el código no la fija (`JUMP_PUBLIC_URL` en Vercel).
- **Frontend**: se parte del HTML/CSS del mockup. El JS se mueve a `jump/comunidad/app.js` (archivo externo → CSP `script-src 'self'` sin hashes) y los datos de ejemplo en memoria se reemplazan por llamadas a Supabase. Rutas por hash como en el mockup.

## 7. Identidad y cuentas

- Supabase Auth exige correo. Cada cuenta usa un **correo interno que nunca recibe mensajes**, en un subdominio que controla el cliente y que no tiene MX: emprendedor `c<cedula>@cuentas.laauroraescucha.com`; equipo `<usuario>@equipo.laauroraescucha.com`. El usuario nunca ve ese correo; escribe su cédula o su usuario y el cliente arma el correo. (Elegido para que un "olvidé mi clave" nativo de Supabase jamás llegue a un dominio ajeno.)
- **Cédula**: 10 dígitos, provincia 01–24 o 30, tercer dígito < 6, dígito verificador módulo 10. Se valida en el navegador y otra vez en el servidor.
- **Crear cuenta** (`/api/jump-cuentas`, admin): crea el usuario con `email_confirm: true` y una clave temporal `JUMP-####-####` (8 dígitos aleatorios criptográficos; la cédula no es secreta, así que 4 dígitos serían adivinables), inserta `jump_miembros` con `debe_cambiar_clave=true` y `clave_temporal_vence = ahora + 7 días`. Devuelve la clave una sola vez para mostrarla al admin (copiar o abrir WhatsApp con el mensaje). La clave no se guarda en ninguna tabla.
- **Primer ingreso**: si `debe_cambiar_clave`, la app muestra "Crea tu clave nueva" (≥ 8 caracteres y un número) y el aviso de privacidad (§7a). El cambio va por `/api/jump-clave`, que verifica el JWT, rechaza si la temporal venció ("Tu clave temporal venció. Pídele una nueva al equipo de JUMP."), cambia la clave con la API de admin, registra la aceptación del aviso y pone la marca en `false`, todo en un paso. Mientras la marca esté en `true`, RLS no deja leer contenido.
- **Clave nueva** (admin): nueva temporal (7 días) + `debe_cambiar_clave=true`. Las sesiones abiertas de esa persona quedan sin contenido por la marca.
- **Suspender**: `estado='suspendida'` (RLS lo bloquea de inmediato) + `ban_duration` largo en Auth (no puede volver a entrar ni refrescar sesión). **Reactivar** revierte ambas. Un admin no puede suspenderse a sí mismo, y el último admin activo no se puede suspender.
- **Su propia fila** de `jump_miembros` siempre es legible para cada quien (aunque esté suspendida o deba cambiar la clave), para que la app muestre la pantalla correcta.
- **Primer admin**: el dueño lo crea a mano una sola vez (Authentication → Add user con el correo interno del usuario elegido, *Auto Confirm*) y corre un `insert` de una línea que viene al final de la migración, con el usuario que elija. Después, los admins agregan a otras personas del equipo desde **Ajustes → Equipo JUMP** (usuario + nombre; misma clave temporal).

### 7a. Aviso de privacidad

La cédula y el WhatsApp son datos personales (LOPDP). En el primer ingreso, junto a la clave nueva, el emprendedor ve un aviso corto con enlace a `jump/comunidad/privacidad.html` y marca "Acepto"; se guarda `privacidad_aceptada_en` y la versión del aviso. Como responsable del tratamiento figura **CONSALVA LAW S.A.S.**, igual que en la política de La Aurora Escucha. El texto lo redacto yo como borrador y debe revisarlo Josué antes de cargar datos reales.
- El registro público de Supabase sigue **deshabilitado** (ya lo está).
- Un usuario de JUMP que intente entrar al `/admin/` de La Aurora Escucha ve el panel vacío (no está en `admins`). Un admin de La Aurora que intente entrar a JUMP ve "Esta cuenta no tiene acceso a la Comunidad JUMP".

## 8. Modelo de datos (migración `0005_comunidad_jump.sql`)

Todas con `es_ejemplo boolean not null default false` donde aplique (para el borrado de ejemplos).

| Tabla | Campos clave |
|---|---|
| `jump_miembros` | `user_id` PK→auth.users, `rol` (`admin`/`emprendedor`), `cedula` única (emprendedor), `usuario` único (admin), `nombres`, `negocio`, `whatsapp`, `correo` opcional, `edicion`, `estado` (`activa`/`suspendida`), `motivo_suspension`, `debe_cambiar_clave`, `clave_temporal_vence`, `privacidad_aceptada_en`, `privacidad_version`, `ultimo_ingreso`, `creado_por`, `creado_en`, `es_ejemplo` |
| `jump_mentorias` | `id`, `titulo`, `descripcion`, `mentor`, `portada` (ruta en Storage o ruta estática), `estado` (`borrador`/`publicada`), `publicada_en`, `actualizada_en`, `es_ejemplo` |
| `jump_clases` | `id`, `titulo`, `mentoria_id` null, `inicia_en` timestamptz, `duracion_min`, `mensaje`, `grabacion_url`, `es_ejemplo` |
| `jump_clases_zoom` | `clase_id` PK, `meeting_id`, `join_url`, `passcode` — **solo admin** |
| `jump_modulos` | `id`, `mentoria_id`, `orden`, `titulo`, `tipo` (`video`/`vivo`), `video_url`, `duracion_min`, `descripcion`, `clase_id` (si es en vivo), `es_ejemplo` |
| `jump_materiales` | `id`, `mentoria_id`, `modulo_id` null, `nombre`, `tipo` (`archivo`/`enlace`), `ruta` (Storage) o `url`, `bytes`, `mime`, `orden` |
| `jump_progreso` | (`user_id`, `modulo_id`) PK, `visto_en` |
| `jump_asistencia` | (`clase_id`, `user_id`) PK, `confirmado_en`, `entro_en` |
| `jump_avisos` | `id`, `tipo` (`aviso`/`invitacion`/`mentoria`), `texto`, `clase_id`, `mentoria_id`, `creado_por`, `creado_en`, `es_ejemplo` |
| `jump_avisos_vistos` | (`aviso_id`, `user_id`) PK, `visto_en` |
| `jump_posts` | `id`, `autor_id`, `texto` (≤ 1000), `foto` (ruta), `creado_en`, `oculto_en`, `oculto_por`, `es_ejemplo` |
| `jump_comentarios` | `id`, `post_id`, `autor_id`, `texto` (≤ 500), `creado_en`, `oculto_en`, `oculto_por`, `es_ejemplo` |
| `jump_zoom` | fila única: `zoom_user_id`, `email`, `nombre`, `refresh_token_cifrado`, `access_token_cifrado`, `expira_en`, `conectada_por`, `conectada_en` — **sin políticas: solo service_role** |
| `jump_bitacora` | `id`, `actor_id`, `accion`, `objetivo`, `detalle` jsonb, `creado_en` — registro de acciones de admin (crear cuenta, clave nueva, suspender, reactivar, Zoom, borrar ejemplos) |

**Storage**: `jump-portadas` (público, solo imágenes, ≤ 5 MB; portadas no sensibles), `jump-material` (privado, PDF/Word/Excel/PowerPoint/imágenes, ≤ 20 MB; lectura para miembros activos, escritura admin; descarga por URL firmada), `jump-muro` (privado, imágenes ≤ 5 MB redimensionadas en el navegador y sin EXIF; lectura miembros activos, escritura solo en la carpeta propia `<user_id>/`).

**Directorio**: función `jump_directorio()` (`security definer`, devuelve vacío si no es `jump_es_miembro()`): `user_id`, nombre corto (primer nombre + inicial del apellido), `negocio`, `rol`. Es lo único que un emprendedor ve de los demás (autores del muro). Se usa una función y no una vista para no dejar una vista que salte RLS.

**Editar una mentoría publicada**: los cambios se ven al guardar; "Pasar a borrador" la oculta de nuevo. Borrar una mentoría borra sus módulos, materiales y avances (con confirmación).

## 9. Permisos (RLS)

Funciones `security definer` con `search_path` fijo:
- `jump_es_miembro()`: fila propia con `estado='activa'` y `debe_cambiar_clave=false`.
- `jump_es_admin()`: lo anterior + `rol='admin'`.

| Recurso | Emprendedor activo | Admin activo |
|---|---|---|
| `jump_miembros` | solo su fila (lectura); cambia `negocio`/`whatsapp` solo vía RPC `jump_actualizar_perfil` | lectura de todos; altas/bajas/estado solo vía API |
| mentorías, módulos, materiales | solo publicadas (y lo que cuelga de ellas) | todo |
| `jump_clases` | lectura | todo |
| `jump_clases_zoom` | **nada**; entra con RPC `jump_entrar_clase(clase_id)` que devuelve `join_url` solo desde 15 min antes del inicio hasta 30 min después del fin, y registra `entro_en` | todo |
| progreso, asistencia, avisos vistos | lo propio | lectura de todo (para conteos) |
| avisos | lectura | todo |
| muro (posts/comentarios) | lee lo no oculto; crea lo propio; borra lo propio | lee todo; oculta/restaura |
| `jump_zoom`, `jump_bitacora` | nada | bitácora: lectura; Zoom: solo vía API (estado: email y nombre de la cuenta conectada) |

Las tablas y políticas de La Aurora Escucha no cambian.

## 10. Zoom

- **App**: quien tenga la cuenta de Zoom crea una *General App* (OAuth, *user-managed*) en marketplace.zoom.us con el *redirect* `https://<dominio>/api/jump-zoom-callback` y los permisos para crear reuniones y leer su usuario (`meeting:write:meeting`, `user:read:user`, o sus equivalentes vigentes). Pone `ZOOM_CLIENT_ID` y `ZOOM_CLIENT_SECRET` en Vercel.
- **Conectar / cambiar cuenta**: botón en Ajustes → `POST /api/jump-zoom?accion=iniciar` (admin) devuelve la URL de autorización con un `state` firmado (HMAC con `JUMP_SECRET`, incluye id del admin y vence en 10 min) → Zoom → `/api/jump-zoom-callback` valida el `state`, canjea el código, lee `/users/me`, guarda los tokens **cifrados con AES-GCM** (`JUMP_SECRET` derivado) y vuelve a Ajustes. "Cambiar cuenta" revoca los tokens actuales y repite el flujo; "Desconectar" revoca y borra.
- **Crear reunión**: al programar una clase o un módulo en vivo, `POST /api/jump-zoom?accion=reunion` (admin) refresca el token si venció (Zoom rota el *refresh token*: se guarda el nuevo), crea la reunión (`type 2`, zona `America/Guayaquil`, sala de espera activa) y guarda `meeting_id` y `join_url` en `jump_clases_zoom`. El `start_url` (enlace de anfitrión) no se guarda.
- **Respaldo**: el admin siempre puede pegar el enlace de Zoom a mano (si Zoom no está conectado o falla).
- **Desautorización**: si alguien quita la app desde su cuenta de Zoom, Zoom avisa a `/api/jump-zoom-deauth` (firma verificada con `ZOOM_WEBHOOK_SECRET`) y se borran los tokens; Ajustes muestra "Zoom desconectado".
- **Plan de Zoom**: en una cuenta gratis, las reuniones de 3 o más personas se cortan a los 40 minutos. Las clases de 60–90 min necesitan una cuenta de pago.
- **Cuenta prevista (respuesta del usuario)**: una sola cuenta de Zoom para JUMP, probablemente una cuenta personal que Josué abre para el programa, manejada por la persona encargada de las clases. La app de Zoom se crea **dentro de esa cuenta**. No hace falta el modo de "pegar credenciales".
- **Límite de Zoom (verificado en su documentación y foro)**: una app **no publicada** solo la pueden autorizar usuarios **de la misma cuenta de Zoom** donde se creó la app. "Cambiar de cuenta" funciona entre usuarios de esa organización de Zoom. Para pasar a una cuenta de Zoom de otra organización hay que crear la app en esa cuenta (nuevas claves en Vercel) o publicarla en el Marketplace (revisión de Zoom).

## 11. Invitaciones y avisos

- Programar una clase (o publicar una mentoría con módulos en vivo) crea automáticamente un aviso `invitacion` para todos los activos. Publicar una mentoría nueva crea un aviso `mentoria` (casilla "Avisar en la Comunidad JUMP", marcada por defecto).
- El emprendedor ve un contador de avisos sin leer en el menú; abrir Avisos los marca vistos. El admin ve "Lo vieron X de N" y "N confirmaron" por clase.
- "Reenviar recordatorio" crea un aviso nuevo de tipo `invitacion` para la misma clase.
- Estado de la clase como en el mockup corregido: antes de la ventana → "Agregar a mi calendario" (archivo .ics generado en el navegador) + "El enlace de Zoom se abre 15 min antes"; en la ventana → "En vivo ahora" + "Entrar a Zoom" (único uso del amarillo).

## 12. Datos de ejemplo

- `/api/jump-ejemplos` (admin): `accion=cargar` crea las mentorías, módulos, clases, avisos y publicaciones del mockup, y 12 cuentas de emprendedores de ejemplo con cédulas válidas generadas y claves temporales aleatorias (no se muestran; para probar una, el admin usa "Clave nueva"). Todo con `es_ejemplo=true`. Portadas de ejemplo: fotos del programa ya existentes en `assets/`.
- `accion=borrar`: pide escribir `BORRAR`; elimina solo filas con `es_ejemplo=true`, sus archivos en Storage y las cuentas de Auth de los miembros de ejemplo. Lo real no se toca (incluye las acciones reales que cuelgan de ejemplos: p. ej. un comentario real en una publicación de ejemplo se borra con ella; el diálogo lo advierte con el conteo).
- Mientras haya ejemplos, una franja discreta en el panel del admin dice "Hay datos de ejemplo cargados · Borrar ejemplos".

## 13. Errores y estados

- Todas las pantallas del mockup conservan sus estados: vacíos, cargando, error de red ("No se pudo cargar. Revisa tu conexión y vuelve a intentar." + botón), validación por campo.
- Mensajes de ingreso genéricos: "Cédula o clave incorrecta" (no revela si la cédula existe); suspendida: "Tu cuenta está suspendida. Escríbele al equipo de JUMP."
- Las funciones Edge responden errores genéricos al navegador y detalle solo en logs de Vercel (sin datos personales).
- Límites: subida de archivos validada por tipo (magic bytes en el servidor no aplica porque sube directo a Storage: se confía en `allowed_mime_types` y tamaño del bucket + nombre saneado); texto del muro ≤ 1000 caracteres; comentarios ≤ 500.

## 14. Pruebas y verificación (riesgo ALTO)

- **Permisos**: suite automática que aplica la migración en un Postgres local (PGlite, Postgres en WebAssembly vía npm; **el usuario dio permiso** para instalarlo en una carpeta de pruebas fuera del sitio) con un esquema `auth`/`storage` mínimo simulado, y prueba cada caso de abuso: emprendedor leyendo borradores, cédulas ajenas, `jump_clases_zoom`, datos de La Aurora; suspendido con sesión abierta; marca `debe_cambiar_clave`; muro ajeno; admin suspendido.
- **API**: pruebas de las funciones Edge con `fetch` simulado (sin JWT, JWT de emprendedor, JWT de admin suspendido → 401/403; validación de cédula; `state` de Zoom vencido o alterado; cifrado de tokens ida y vuelta).
- **Interfaz**: Chrome sin cabeza (CDP) en 1440 y 390 px contra un Supabase simulado, con los mismos flujos que ya se probaron en el mockup + muro + ajustes.
- **Revisión de seguridad**: pasada dedicada sobre el diff (autorización, RLS, secretos, OAuth) antes de entregar; la evidencia de cada caso de abuso queda en `docs/loanix/SECURITY.md`.
- **Casos de abuso explícitos**: emprendedor que cambia su `user_metadata` para hacerse admin; que intenta cambiar su correo a uno de `admins`; que llama a `jump_entrar_clase` fuera de la ventana; que sube al bucket del muro en la carpeta de otro; admin de La Aurora entrando a JUMP y miembro de JUMP entrando al panel de La Aurora (`is_admin()` debe dar `false`).
- **En producción** (lo hace el dueño, guiado): revisar en Authentication → Settings que el registro siga apagado y "Confirm email" encendido; aplicar migración; crear primer admin; cargar ejemplos; probar ingreso de emprendedor con "Clave nueva"; conectar Zoom.

## 15. Entrega

1. `supabase/migrations/0005_comunidad_jump.sql` (+ instrucciones para el SQL Editor y el `insert` del primer admin).
2. `jump/comunidad/` (index.html, app.js, estilos), `api/jump-*.js`, cambios en `vercel.json` y `scripts/csp.mjs`.
3. Variables nuevas en Vercel: `JUMP_SECRET` (32+ caracteres aleatorios), `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_WEBHOOK_SECRET`, `JUMP_PUBLIC_URL`. Reusa `SUPABASE_URL`/`ProjectURL`, `SUPABASE_ANON_KEY`/`anonpublic`, `SUPABASE_SERVICE_ROLE_KEY`/`service_role`.
4. Guía corta en español para el dueño: migración, primer admin, variables, crear la app de Zoom, apuntar el subdominio.
5. PR al canónico + push al fork como siempre.

## 16. Decisiones tomadas por mí (el usuario puede revisarlas)

- Muro: publican directo, el equipo oculta (el usuario no eligió; es la opción recomendada).
- Mismo proyecto de Vercel y ruta `/jump/comunidad/` con subdominio por *rewrite*, en lugar de un proyecto nuevo (menos configuración para el dueño).
- Correos internos en subdominios de `laauroraescucha.com` sin MX.
- Videos como enlaces; sin envío automático por WhatsApp/correo.
- Ejemplos con botón en Ajustes (no por SQL), con confirmación escribiendo `BORRAR`.
- El enlace de Zoom solo se entrega dentro de la ventana de la clase.
- El directorio muestra a los demás emprendedores el nombre corto, no el completo.
- Clave temporal de 8 dígitos que vence en 7 días.
- `is_admin()` de La Aurora se endurece para excluir cuentas de JUMP, y la migración se niega a correr si falta la 0002.
- Aviso de privacidad en el primer ingreso, con CONSALVA LAW S.A.S. como responsable (texto en borrador para que lo revise Josué).
- Las personas del equipo se agregan en Ajustes → Equipo JUMP.

## 17. Lo que queda al constructor

Estructura interna de `app.js`, nombres de funciones, orden de las tareas, la forma exacta del Supabase simulado para las pruebas de interfaz, y el detalle de los permisos de Zoom vigentes en su Marketplace.
