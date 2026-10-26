// Datos de ejemplo de la Comunidad JUMP (los del mockup aprobado), para mostrar la plataforma
// antes de cargar contenido real. Todo va con es_ejemplo = true y se borra con "ejemplos-borrar".
import { json } from "./http.js";
import { rest, authAdmin, bitacora } from "./supa.js";
import { cedulaValida, correoEmprendedor } from "../../jump/comunidad/js/cedula.js";

const SRI = "https://www.sri.gob.ec";
const SENADI = "https://www.derechosintelectuales.gob.ec";
const DAULE = "https://www.daule.gob.ec";

// Mentorías: [clave, título, portada, estado, días desde que se publicó, descripción, módulos, materiales]
// Módulo: [título, tipo, minutos, descripción, clase (clave) | null, materiales del módulo]
const MENTORIAS = [
  ["ruc", "Tu RUC y el RIMPE, paso a paso", "m-ruc", "publicada", 7,
    "Qué es el RUC, cómo te ayuda el RIMPE y cómo sacarlo tú mismo, sin intermediarios.", [
      ["¿Qué es el RUC y por qué te conviene?", "video", 8, "Lo básico: qué es, quién lo necesita y qué puertas te abre tenerlo."],
      ["RIMPE: el régimen para emprendedores", "video", 12, "Cómo funciona el régimen simplificado y qué te toca declarar."],
      ["Cómo sacar tu RUC en línea", "video", 15, "Te mostramos, pantalla por pantalla, cómo pedir tu RUC desde el celular o la computadora, qué datos tener a la mano y qué hacer si algo sale mal.",
        null, [["Requisitos para sacar el RUC", SRI], ["Paso a paso con capturas", SRI]]],
      ["Tus obligaciones cada mes", "video", 10, "Qué tienes que hacer cada mes para no tener problemas."],
      ["Preguntas y respuestas en vivo", "vivo", 60, "Trae tus dudas sobre el RUC y el RIMPE. La clase es por Zoom.", "c1"],
    ], [["Guía del RIMPE para emprendedores", SRI], ["Plantilla de ingresos y gastos", SRI], ["SRI en línea", "https://srienlinea.sri.gob.ec"]]],
  ["permisos", "Permisos para funcionar en Daule", "m-charla", "publicada", 14,
    "Qué pide el municipio, en qué orden hacer cada trámite y cuánto tiempo toma.", [
      ["El mapa de permisos", "video", 9], ["Permiso de funcionamiento", "video", 14], ["Bomberos y patente", "video", 11],
      ["Revisemos tus papeles en vivo", "vivo", 60],
    ], [["Lista de requisitos del municipio", DAULE]]],
  ["costos", "Costos, precios y ganancia", "g-city", "publicada", 21,
    "Calcula cuánto te cuesta lo que vendes y cuánto ganas de verdad.", [
      ["Lo que te cuesta producir", "video", 12], ["Cómo poner precio", "video", 13], ["Tu ganancia real", "video", 10],
      ["Cómo poner precio a lo que vendes (en vivo)", "vivo", 60, "", "c2"],
    ], [["Calculadora de costos", SRI]]],
  ["ventas", "Vende más en ferias y redes", "m-ventas", "publicada", 29,
    "Cómo armar tu puesto, atender bien y cerrar la venta.", [
      ["Tu puesto en la feria", "video", 10], ["Atender y cerrar la venta", "video", 12], ["Fotos que venden", "video", 9],
      ["Instagram sin complicarte", "video", 14], ["Ventas por WhatsApp", "video", 11], ["Feria de práctica", "vivo", 120],
    ], [["Checklist para tu puesto", DAULE]]],
  ["marca", "Tu marca, registrada a tu nombre", "m-marca", "publicada", 1,
    "Protege el nombre y el logo de tu emprendimiento.", [
      ["Por qué registrar tu marca", "video", 7], ["Cómo buscar si tu nombre está libre", "video", 11], ["La solicitud, paso a paso", "video", 13],
    ], [["Requisitos para registrar tu marca", SENADI]]],
  ["factura", "Factura electrónica sin miedo", "masterclass-a", "borrador", null,
    "Emite tu primera factura electrónica y entiende qué pasa después.", [
      ["Qué es la factura electrónica", "video", 8], ["Tu firma electrónica", "video", 12], ["Emite tu primera factura", "video", null],
      ["Dudas sobre facturación", "vivo", null],
    ], [["Guía de facturación electrónica", SRI]]],
];

// Clases: [clave, título, mentoría (clave) | null, días desde hoy (a las 19:00 de Guayaquil), minutos, mensaje]
const CLASES = [
  ["c1", "Preguntas y respuestas: RUC y RIMPE", "ruc", 3, 60, "Trae tus dudas sobre el RUC y el RIMPE."],
  ["c2", "Cómo poner precio a lo que vendes", "costos", 10, 60, null],
  ["c3", "Ventas por WhatsApp: mensajes que sí venden", null, 19, 90, null],
  ["p1", "Bienvenida a la Comunidad JUMP", null, -4, 60, null],
  ["p2", "Tu marca: lo que debes saber antes de registrarla", null, -11, 60, null],
];

// Emprendedores: [nombres, negocio, módulos vistos, horas desde su último ingreso | null, suspendido]
const PERSONAS = [
  ["María José Vera", "Dulces de la Abuela", 11, 2], ["Carlos Mendoza", "Huellitas Pet Shop", 14, 5],
  ["Rosa Elena Quinde", "Empanadas Doña Rosa", 8, 26], ["Kathy Morán", "Uñas by Kathy", 17, 30],
  ["Luis Alvarado", "Barbería El Corte", 5, 72], ["Jéssica Bajaña", "Costuras Jéssica", 12, 3],
  ["Fernando Plúas", "Jugos El Mango", 3, 144], ["Andrea Villón", "Tortas Dulce Hogar", 15, 28],
  ["Miguel Cedeño", "Parrilladas El Toro", 2, 500, true], ["Gabriela Franco", "Accesorios Brillo", 9, 4],
  ["Ronald Tomalá", "Panadería La Espiga", 0, 720, true], ["Patricia León", "Bisutería Pati", 0, null],
];

const AVISOS = [
  ["invitacion", "Te invitamos a la clase en vivo de preguntas y respuestas sobre el RUC y el RIMPE. Trae tus dudas.", "c1", null, 2, 7],
  ["mentoria", "Ya está disponible la mentoría “Tu marca, registrada a tu nombre”: tres módulos cortos y la lista de requisitos para registrar tu marca.", null, "marca", 24, 8],
  ["aviso", "Recuerda que puedes pedir tu turno en la isla semanal para exponer tu marca. Escríbenos por WhatsApp.", null, null, 168, 9],
];

// Muro: [autor (índice en PERSONAS), horas atrás, texto, comentarios [autor, texto]]
const MURO = [
  [3, 3, "(ejemplo) Ya terminé el módulo del RIMPE. ¿Alguien sabe si la declaración se hace cada mes o cada seis meses?", [
    [1, "(ejemplo) Yo también tengo esa duda. La llevo a la clase del jueves."],
    [7, "(ejemplo) Revisa el módulo de obligaciones de cada mes, ahí lo explican."]]],
  [1, 26, "(ejemplo) Estoy armando mi lista de costos con lo que vimos en la mentoría. ¿Ustedes cuentan el transporte como costo?", [
    [5, "(ejemplo) Yo sí lo cuento. Podemos preguntarlo en la clase de precios."]]],
  [7, 50, "(ejemplo) ¿Alguien ya sacó el permiso de funcionamiento en Daule? Quisiera saber qué papeles llevar.", [
    [4, "(ejemplo) En la mentoría de permisos está la lista de requisitos del municipio."],
    [9, "(ejemplo) Yo también estoy en eso, compartamos lo que vayamos aprendiendo."]]],
  [9, 98, "(ejemplo) Recordatorio: el jueves es la clase de preguntas sobre el RUC. Anoten sus dudas.", [
    [3, "(ejemplo) Gracias por el recordatorio."]]],
];

// Asistencia: clase → cuántas personas activas confirmaron (y, en las pasadas, entraron).
const ASISTENCIA = { c1: 7, c2: 3, c3: 2, p1: 8, p2: 5 };

// Encuesta de ejemplo: [texto, votos del público, votos de inscritos]; la 4.ª la «propuso» un inscrito de ejemplo.
const ENCUESTA = ["¿Qué taller te serviría más ahora?", [
  ["Fotos de producto con el celular", 17, 4], ["Cómo acceder a un crédito para tu negocio", 12, 3],
  ["Atención al cliente por WhatsApp Business", 10, 2], ["Empaques y etiquetas con tu marca", 7, 1],
]];

const ahora = () => Date.now();
const haceHoras = (h) => new Date(ahora() - h * 3600e3).toISOString();
const id = () => crypto.randomUUID();

// 19:00 en Guayaquil dentro de `dias` días. Ecuador está en UTC−5 todo el año (sin horario de verano).
function a19Guayaquil(dias) {
  const hoy = new Date(ahora() - 5 * 3600e3); // fecha de calendario en Guayaquil
  return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + dias, 19 + 5)).toISOString();
}

// "30" + 7 dígitos (el primero < 6) + dígito verificador.
function cedulaEjemplo(i) {
  const base = "30" + String(1000000 + (i + 1) * 104729).slice(-7).replace(/^[6-9]/, "1");
  for (let d = 0; d <= 9; d++) if (cedulaValida(base + d)) return base + d;
  throw new Error("cédula de ejemplo");
}

// Clave larga al azar que nadie conoce. Para probar el ingreso, el equipo usa "Clave nueva".
const claveInaccesible = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");

async function insertar(tabla, filas) {
  if (!filas.length) return;
  const r = await rest(tabla, { method: "POST", body: filas, prefer: "return=minimal" });
  if (!r.ok) throw new Error(`insertar ${tabla} ${r.status}`);
}
async function ids(ruta) {
  const r = await rest(ruta);
  if (!r.ok) throw new Error(`leer ${ruta.split("?")[0]} ${r.status}`);
  return (await r.json());
}
const lista = (xs) => `(${xs.join(",")})`;

async function hayEjemplos() {
  const [m, me] = await Promise.all([ids("jump_miembros?es_ejemplo=is.true&select=user_id&limit=1"), ids("jump_mentorias?es_ejemplo=is.true&select=id&limit=1")]);
  return m.length > 0 || me.length > 0;
}

async function contar() {
  const cargados = await hayEjemplos();
  const reales = { comentarios: 0, publicaciones: 0, progreso: 0 };
  if (cargados) {
    const personas = (await ids("jump_miembros?es_ejemplo=is.true&select=user_id")).map((x) => x.user_id);
    const posts = (await ids("jump_posts?es_ejemplo=is.true&select=id")).map((x) => x.id);
    const modulos = (await ids("jump_modulos?es_ejemplo=is.true&select=id")).map((x) => x.id);
    const comentarios = new Set();
    if (posts.length) for (const c of await ids(`jump_comentarios?es_ejemplo=is.false&post_id=in.${lista(posts)}&select=id`)) comentarios.add(c.id);
    if (personas.length) {
      for (const c of await ids(`jump_comentarios?es_ejemplo=is.false&autor_id=in.${lista(personas)}&select=id`)) comentarios.add(c.id);
      reales.publicaciones = (await ids(`jump_posts?es_ejemplo=is.false&autor_id=in.${lista(personas)}&select=id`)).length;
    }
    reales.comentarios = comentarios.size;
    if (modulos.length) {
      const deEjemplo = new Set(personas);
      reales.progreso = (await ids(`jump_progreso?modulo_id=in.${lista(modulos)}&select=user_id`)).filter((p) => !deEjemplo.has(p.user_id)).length;
    }
  }
  return json({ ok: true, cargados, reales });
}

// Sin la migración 0003 no hay tablas de encuestas: el resto de los ejemplos entra igual.
async function hayTablaEncuestas() {
  return (await rest("jump_encuestas?select=id&limit=1")).ok;
}

async function cargar(ctx) {
  if (await hayEjemplos()) return json({ ok: false, error: "Los datos de ejemplo ya están cargados." }, 409);
  const creados = [];
  try {
    // 1. Personas: usuario en Auth + fila en jump_miembros.
    const miembros = [];
    for (const [i, [nombres, negocio, , horas, suspendido]] of PERSONAS.entries()) {
      const cedula = cedulaEjemplo(i);
      const r = await authAdmin("users", { method: "POST", body: { email: correoEmprendedor(cedula), password: claveInaccesible(), email_confirm: true } });
      if (!r.ok) throw new Error(`crear usuario de ejemplo ${r.status}`);
      const userId = (await r.json()).id;
      creados.push(userId);
      if (suspendido) {
        const b = await authAdmin(`users/${userId}`, { method: "PUT", body: { ban_duration: "876000h" } });
        if (!b.ok) throw new Error(`suspender ejemplo ${b.status}`);
      }
      miembros.push({
        user_id: userId, rol: "emprendedor", cedula, nombres, negocio, estado: suspendido ? "suspendida" : "activa",
        motivo_suspension: suspendido ? "(ejemplo) Cuenta de ejemplo suspendida" : null,
        debe_cambiar_clave: false, ultimo_ingreso: horas === null ? null : haceHoras(horas), creado_por: ctx.userId, es_ejemplo: true,
      });
    }
    await insertar("jump_miembros", miembros);
    const activos = miembros.filter((m) => m.estado === "activa").map((m) => m.user_id);

    // 2. Mentorías, clases, módulos y materiales.
    const mId = Object.fromEntries(MENTORIAS.map(([k]) => [k, id()]));
    const cId = Object.fromEntries(CLASES.map(([k]) => [k, id()]));
    await insertar("jump_mentorias", MENTORIAS.map(([k, titulo, portada, estado, dias, descripcion]) => ({
      id: mId[k], titulo, descripcion, portada: `assets/${portada}.webp`, estado,
      publicada_en: estado === "publicada" ? haceHoras(dias * 24) : null, es_ejemplo: true,
    })));
    await insertar("jump_clases", CLASES.map(([k, titulo, m, dias, duracion_min, mensaje]) => ({
      id: cId[k], titulo, mentoria_id: m ? mId[m] : null, inicia_en: a19Guayaquil(dias), duracion_min, mensaje, es_ejemplo: true,
    })));
    const modulos = [], materiales = [], publicados = [];
    for (const [k, , , estado, , , mods, mats] of MENTORIAS) {
      mods.forEach(([titulo, tipo, minutos, descripcion = "", clase = null, archivos = []], orden) => {
        const modId = id();
        modulos.push({ id: modId, mentoria_id: mId[k], orden: orden + 1, titulo, tipo, duracion_min: minutos,
          descripcion, clase_id: clase ? cId[clase] : null, es_ejemplo: true });
        if (estado === "publicada") publicados.push(modId);
        archivos.forEach(([nombre, url], j) => materiales.push({ mentoria_id: mId[k], modulo_id: modId, nombre, tipo: "enlace", url, orden: j + 1, es_ejemplo: true }));
      });
      mats.forEach(([nombre, url], j) => materiales.push({ mentoria_id: mId[k], modulo_id: null, nombre, tipo: "enlace", url, orden: j + 1, es_ejemplo: true }));
    }
    await insertar("jump_modulos", modulos);
    await insertar("jump_materiales", materiales);

    // 3. Avisos (y quién los vio), progreso y asistencia aproximando los números del mockup.
    const aId = AVISOS.map(() => id());
    await insertar("jump_avisos", AVISOS.map(([tipo, texto, clase, mentoria, horas], i) => ({
      id: aId[i], tipo, texto, clase_id: clase ? cId[clase] : null, mentoria_id: mentoria ? mId[mentoria] : null,
      creado_por: ctx.userId, creado_en: haceHoras(horas), es_ejemplo: true,
    })));
    await insertar("jump_avisos_vistos", AVISOS.flatMap(([, , , , horas, vistos], i) =>
      activos.slice(0, vistos).map((user_id, j) => ({ aviso_id: aId[i], user_id, visto_en: haceHoras(Math.max(horas - j - 1, 0.5)) }))));
    await insertar("jump_progreso", PERSONAS.flatMap(([, , vistos], i) =>
      publicados.slice(0, vistos).map((modulo_id, j) => ({ user_id: miembros[i].user_id, modulo_id, visto_en: haceHoras(24 * (vistos - j)) }))));
    await insertar("jump_asistencia", CLASES.flatMap(([k, , , dias]) =>
      activos.slice(0, ASISTENCIA[k]).map((user_id) => ({
        clase_id: cId[k], user_id, confirmado_en: haceHoras(48 + 24 * Math.max(-dias, 0)),
        entro_en: dias < 0 ? new Date(new Date(a19Guayaquil(dias)).getTime() + 5 * 60e3).toISOString() : null,
      }))));

    // 4. Muro.
    const posts = [], comentarios = [];
    for (const [autor, horas, texto, coms] of MURO) {
      const postId = id();
      posts.push({ id: postId, autor_id: miembros[autor].user_id, texto, creado_en: haceHoras(horas), es_ejemplo: true });
      coms.forEach(([a, t], j) => comentarios.push({ post_id: postId, autor_id: miembros[a].user_id, texto: t,
        creado_en: haceHoras(Math.max(horas - j - 1, 0.25)), es_ejemplo: true }));
    }
    await insertar("jump_posts", posts);
    await insertar("jump_comentarios", comentarios);

    // 5. Encuesta del mes de ejemplo. Si ya hay una real abierta, entra como borrador para no cerrarla.
    let encuestas = 0;
    if (await hayTablaEncuestas()) {
      const hayAbierta = (await ids("jump_encuestas?estado=eq.abierta&select=id&limit=1")).length > 0;
      const eId = id();
      await insertar("jump_encuestas", [{ id: eId, pregunta: ENCUESTA[0], estado: hayAbierta ? "borrador" : "abierta", es_ejemplo: true }]);
      const oIds = ENCUESTA[1].map(() => id());
      await insertar("jump_encuesta_opciones", ENCUESTA[1].map(([texto], i) => ({
        id: oIds[i], encuesta_id: eId, texto, orden: i + 1, es_ejemplo: true, propuesta_por: i === 3 ? activos[0] : null })));
      const votos = [];
      let d = 0, u = 0;
      ENCUESTA[1].forEach(([, publico, inscritos], i) => {
        for (let k = 0; k < publico; k++) votos.push({ encuesta_id: eId, opcion_id: oIds[i], origen: "publico", dispositivo_hash: `ejemplo-${++d}`, ip_hash: "ejemplo" });
        for (let k = 0; k < inscritos; k++) votos.push({ encuesta_id: eId, opcion_id: oIds[i], origen: "inscrito", user_id: activos[u++] });
      });
      await insertar("jump_encuesta_votos", votos);
      encuestas = 1;
    }

    const cargados = { mentorias: MENTORIAS.length, miembros: miembros.length, clases: CLASES.length, avisos: AVISOS.length,
      publicaciones: posts.length, comentarios: comentarios.length, encuestas };
    await bitacora(ctx.userId, "ejemplos-cargar", null, cargados);
    return json({ ok: true, cargados });
  } catch (e) {
    // Deshace lo que alcanzó a crear para poder intentarlo otra vez.
    await borrarTodo(creados).catch(() => {});
    throw e;
  }
}

async function borrarFilas(tabla) {
  const r = await rest(`${tabla}?es_ejemplo=is.true&select=id`, { method: "DELETE", prefer: "return=representation" });
  if (!r.ok) throw new Error(`borrar ${tabla} ${r.status}`);
  return (await r.json()).length;
}

// Orden seguro: primero lo que cuelga, al final las personas (su usuario de Auth arrastra su progreso y su muro).
async function borrarTodo(extras = []) {
  const personas = [...new Set([...(await ids("jump_miembros?es_ejemplo=is.true&select=user_id")).map((x) => x.user_id), ...extras])];
  const borrados = {};
  borrados.comentarios = await borrarFilas("jump_comentarios");
  borrados.publicaciones = await borrarFilas("jump_posts");
  borrados.avisos = await borrarFilas("jump_avisos");
  // Sus opciones y votos se van con ella. Sin la 0003 no hay tabla y no hay nada que borrar.
  borrados.encuestas = (await hayTablaEncuestas()) ? await borrarFilas("jump_encuestas") : 0;
  borrados.materiales = await borrarFilas("jump_materiales");
  borrados.modulos = await borrarFilas("jump_modulos");
  borrados.clases = await borrarFilas("jump_clases");
  borrados.mentorias = await borrarFilas("jump_mentorias");
  for (const userId of personas) {
    const r = await authAdmin(`users/${userId}`, { method: "DELETE" });
    if (!r.ok && r.status !== 404) throw new Error(`borrar usuario de ejemplo ${r.status}`);
  }
  const r = await rest("jump_miembros?es_ejemplo=is.true", { method: "DELETE", prefer: "return=minimal" });
  if (!r.ok) throw new Error(`borrar miembros de ejemplo ${r.status}`);
  borrados.miembros = personas.length;
  return borrados;
}

async function borrar(ctx, b) {
  if (b.confirmacion !== "BORRAR") return json({ ok: false, campo: "confirmacion", error: "Escribe BORRAR para confirmar." }, 400);
  const borrados = await borrarTodo();
  await bitacora(ctx.userId, "ejemplos-borrar", null, borrados);
  return json({ ok: true, borrados });
}

export const ejemplos = { "ejemplos-contar": contar, "ejemplos-cargar": cargar, "ejemplos-borrar": borrar };
