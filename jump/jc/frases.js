// Todo lo que dice JC, en un solo archivo para que cambiar una frase sea trivial.
// Cada frase trae su ánimo (la cara que pone JC) y una clave para no repetirla.
// Ánimos: reposo (tranquilo), feliz, triste, enojado, bromista. Copy: tuteo, «comunidad», nunca «barrio».
import { partes } from "../comunidad/js/fechas.js";

const f = (clave, animo, texto) => ({ clave: "suelta:" + clave, animo, texto });

// Frases sueltas: 5 por ánimo en cada página, repartidas por la sección (landing) o la pantalla (comunidad) donde se dicen.
export const FRASES = {
  landing: {
    portada: [
      f("l-f1", "feliz", "¡Qué bueno verte de nuevo! ¿Hoy sí das el salto?"),
      f("l-b1", "bromista", "Toca el logo y mira cómo salta. Yo salto mejor, pero no se lo digas."),
    ],
    salto: [
      f("l-t1", "reposo", "Ya vendes. Ahora toca hacerlo en regla, paso a paso y sin miedo."),
      f("l-tr1", "triste", "Me da pena ver buenos negocios que se quedan chiquitos por no estar en regla."),
      f("l-e2", "enojado", "¡Me enojan los trámites enredados! Por eso aquí te los explicamos en orden."),
    ],
    incluye: [
      f("l-f2", "feliz", "Clases, ferias, networking, una vitrina cada semana y marcas padrino. ¡Y todo gratis!"),
      f("l-e5", "enojado", "¿Una vitrina gratis cada semana y todavía lo piensas? ¡Ay, no!"),
    ],
    momentos: [
      f("l-f3", "feliz", "¡Así se vive el salto! Ferias con clientes de verdad y gente de la comunidad."),
      f("l-b2", "bromista", "Psst… en las ferias de noche hay buena comida. Digo, ¡buenos negocios!"),
    ],
    modulos: [
      f("l-t2", "reposo", "Aquí ves lo que se enseña en JUMP. Toca un módulo para ver su temario."),
      f("l-tr4", "triste", "Yo también le tenía miedo a la factura electrónica… hasta que me la explicaron."),
      f("l-e3", "enojado", "¿Vender sin saber cuánto ganas de verdad? ¡Eso no! Aquí aprendes a sacar tus costos."),
    ],
    encuestas: [
      f("l-f5", "feliz", "¡Aquí decides tú! Vota por el taller que más te serviría."),
      f("l-tr5", "triste", "Una encuesta sin votos es una encuesta triste. ¡Dale tu voto!"),
      f("l-e4", "enojado", "¡Que no decidan por ti! Vota por el taller que de verdad necesitas."),
    ],
    josue: [
      f("l-b3", "bromista", "Este es Josué. Se parece un poquito a mí, ¿no crees?"),
    ],
    padrinos: [
      f("l-t5", "reposo", "Estas marcas creen en los emprendedores de La Aurora y ponen de su parte."),
      f("l-b4", "bromista", "¿Tu marca quiere apadrinar? Hay espacio… y yo no cobro por saludar."),
    ],
    proceso: [
      f("l-t3", "reposo", "Postular toma unos minutos: llenas el formulario y te escribimos por WhatsApp."),
      f("l-e1", "enojado", "¡Ojo! Nadie te puede cobrar por postular. JUMP es totalmente gratis."),
    ],
    postula: [
      f("l-f4", "feliz", "¡Postular es gratis y no necesitas tener RUC! Déjanos tus datos aquí abajo."),
      f("l-tr2", "triste", "Si te quedas con las ganas, me pongo triste. ¡Postular te toma unos minutos!"),
      f("l-b5", "bromista", "Dato curioso: para dar el salto no necesitas zapatos especiales. Solo postular."),
    ],
    preguntas: [
      f("l-t4", "reposo", "¿Te queda una duda? Seguro está aquí. Si no, escríbenos por Instagram."),
      f("l-tr3", "triste", "Nadie debería quedarse con la duda. Pregunta lo que necesites por Instagram."),
    ],
  },
  comunidad: {
    inicio: [
      f("c-t1", "reposo", "Aquí tienes tus mentorías, tus clases y los avisos del equipo. Vamos paso a paso."),
      f("c-f1", "feliz", "¡Qué bueno verte! Cada módulo que terminas es un escalón más."),
      f("c-tr1", "triste", "Si un módulo se te hizo difícil, no te rindas. Vuelve a verlo con calma."),
      f("c-e2", "enojado", "¿Vender sin factura? ¡No en mi guardia! Sigue con tus módulos."),
      f("c-b1", "bromista", "Yo ya me sé todos los módulos de memoria. Bueno, casi."),
    ],
    mentorias: [
      f("c-t2", "reposo", "Cada mentoría tiene videos, clases en vivo y material para descargar."),
      f("c-f3", "feliz", "¡Terminar una mentoría se siente increíble! Ya verás."),
      f("c-tr4", "triste", "Me pongo triste cuando un módulo queda a medias. ¡Termínalo!"),
      f("c-e5", "enojado", "¡No te saltes los módulos! Van en orden por algo."),
      f("c-b2", "bromista", "Ver un módulo con un cafecito rinde el doble. No está comprobado, pero funciona."),
    ],
    clases: [
      f("c-t3", "reposo", "Las invitaciones a las clases en vivo llegan aquí. Todas son por Zoom."),
      f("c-f4", "feliz", "¡En las clases en vivo puedes preguntar todo lo que quieras!"),
      f("c-tr2", "triste", "¿Te perdiste una clase? Si el equipo la grabó, la encuentras aquí."),
      f("c-e4", "enojado", "¡Llega puntual! Las clases en vivo empiezan a la hora."),
      f("c-b4", "bromista", "En la clase en vivo puedes prender la cámara. Yo siempre salgo guapo."),
    ],
    muro: [
      f("c-f2", "feliz", "¡Cuéntale a la comunidad cómo te va! Aquí todos se apoyan."),
      f("c-f5", "feliz", "¡Me encanta ver los negocios de la comunidad creciendo!"),
      f("c-tr3", "triste", "El muro está muy calladito… ¿alguien cuenta qué vendió hoy?"),
      f("c-e3", "enojado", "¡Aquí no se vale ofender a nadie! La comunidad es para apoyarnos."),
      f("c-b3", "bromista", "Si publicas una foto de tu producto, prometo no comérmelo."),
    ],
    avisos: [
      f("c-t4", "reposo", "Aquí queda todo lo que el equipo comparte con la comunidad."),
      f("c-tr5", "triste", "Si te perdiste un aviso, aquí siguen todos. Nadie se queda sin enterarse."),
      f("c-b5", "bromista", "Leer los avisos te hace 10 % más formal. Es ciencia JC."),
    ],
    perfil: [
      f("c-t5", "reposo", "Mantén tu WhatsApp al día para que el equipo te pueda escribir."),
      f("c-e1", "enojado", "¡Tu clave es solo tuya! No se la pases a nadie, ni a mí."),
    ],
  },
};

// ---------- fechas habladas: «el martes 28 a las 7 p. m.» (hora de Ecuador) ----------
const DIAS = { DOM: "domingo", LUN: "lunes", MAR: "martes", "MIÉ": "miércoles", JUE: "jueves", VIE: "viernes", "SÁB": "sábado" };
const MESES = { ENE: "enero", FEB: "febrero", MAR: "marzo", ABR: "abril", MAY: "mayo", JUN: "junio", JUL: "julio", AGO: "agosto",
  SEP: "septiembre", OCT: "octubre", NOV: "noviembre", DIC: "diciembre" };
const DESFASE = 5 * 3600e3;
const diaEc = (t) => Math.floor((t - DESFASE) / 864e5);

function horaHablada(iso) {
  const [h, m] = partes(iso).hora.split(":").map(Number);
  const h12 = h % 12 || 12;
  return `${h12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "a. m." : "p. m."}`;
}

// Con más de 6 días de distancia se dice el mes, para que «el martes 10» no se confunda con esta semana.
function diaHablado(iso, ahora) {
  const p = partes(iso);
  const lejos = diaEc(Date.parse(iso)) - diaEc(ahora) > 6;
  return `${DIAS[p.dow]} ${p.d}${lejos ? " de " + MESES[p.mon] : ""}`;
}

// Recorta títulos largos para que el globo se lea en 10–15 s.
function corto(t, max) {
  const s = String(t || "").trim().replace(/\s+/g, " ");
  if (s.length <= max) return s;
  const cortado = s.slice(0, max - 1);
  return cortado.slice(0, cortado.lastIndexOf(" ") > max / 2 ? cortado.lastIndexOf(" ") : cortado.length).replace(/[\s,.;:]+$/, "") + "…";
}

function primerasPalabras(texto) {
  const palabras = String(texto || "").trim().split(/\s+/).filter(Boolean);
  const pocas = corto(palabras.slice(0, 8).join(" "), 50);
  return pocas.endsWith("…") || palabras.length > 8 ? pocas.replace(/…$/, "").replace(/[\s,.;:]+$/, "") + "…" : pocas;
}

// Frases especiales: llevan datos reales y no cuentan en las 50.
export const ESPECIALES = {
  saludo: (lugar) => ({ clave: "saludo:" + lugar, animo: "feliz",
    texto: lugar === "comunidad" ? "¡Hola, soy JC! Aquí te cuento lo nuevo de JUMP." : "¡Hola, soy JC! Te acompaño mientras conoces JUMP." }),
  claseFutura: (c, lugar, ahora = Date.now()) => ({ clave: `clase:${c.id ?? c.iniciaEn}:futura`, animo: "reposo",
    texto: `La próxima clase en vivo es «${corto(c.titulo, 40)}», el ${diaHablado(c.iniciaEn, ahora)} a las ${horaHablada(c.iniciaEn)}` }), // la hora ya termina en «m.»
  claseHoy: (c, lugar) => ({ clave: `clase:${c.id ?? c.iniciaEn}:hoy`, animo: "feliz",
    texto: `¡Hoy hay clase en vivo! «${corto(c.titulo, 40)}» a las ${horaHablada(c.iniciaEn)} ${lugar === "comunidad" ? "¡Te espero!" : "Así se aprende en JUMP."}` }),
  claseEmpezo: (lugar, c = {}) => ({ clave: `clase:${c.id ?? c.iniciaEn}:empezo`, animo: "feliz",
    texto: `¡La clase en vivo ya empezó! ${lugar === "comunidad" ? "Entra desde Clases en vivo." : "Los inscritos ya están en clase en vivo."}` }),
  encuestaSinVotar: (e = {}) => ({ clave: `encuesta:${e.id}`, animo: "bromista",
    texto: "Hay encuesta abierta y todavía no votas. ¡Tu voto cuenta!" }),
  mentoriaNueva: (m) => ({ clave: `mentoria:${m.id}`, animo: "feliz", texto: `¡Hay una mentoría nueva: «${corto(m.titulo, 60)}»!` }),
  avisoNuevo: (a) => ({ clave: `aviso:${a.id}`, animo: "reposo", texto: `El equipo publicó un aviso: «${primerasPalabras(a.texto)}»` }),
  moduloPendiente: (n, titulo) => ({ clave: "modulo", animo: "bromista", texto: `Te falta el módulo ${n} de «${corto(titulo, 60)}». ¡Tú puedes!` }),
  regreso: () => ({ clave: "regreso", animo: "triste", texto: "¡Hace días que no te veía! Te extrañé." }),
};
