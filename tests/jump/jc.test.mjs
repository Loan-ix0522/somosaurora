// JC: qué dice, cuándo y cuántas veces. Lógica pura (sin DOM): frases.js y cerebro.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FRASES, ESPECIALES } from "../../jump/jc/frases.js";
import { duracionGlobo, Memoria, anunciosComunidad, anunciosLanding, elegir, ordenarPorPantalla } from "../../jump/jc/cerebro.js";

const ANIMOS = ["reposo", "feliz", "triste", "enojado", "bromista"];
const SECCIONES = ["portada", "salto", "incluye", "momentos", "modulos", "encuestas", "josue", "padrinos", "proceso", "postula", "preguntas"];
const PANTALLAS = ["inicio", "mentorias", "clases", "muro", "avisos", "perfil"];
const H = 3600e3, DIA = 24 * H;
const AHORA = Date.parse("2026-10-27T15:00:00-05:00"); // martes 27, 3 p. m. en Guayaquil

// Almacén de mentira con la forma de localStorage.
const almacen = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const memoria = (ahora = () => AHORA) => new Memoria(almacen(), ahora);
const todas = (pagina) => Object.values(FRASES[pagina]).flat();

const mentoria = (vistos = 1) => ({ id: "m1", titulo: "Tu RUC paso a paso",
  modulos: [{ id: "x1" }, { id: "x2" }, { id: "x3" }].map((x, i) => ({ ...x, visto: i < vistos, vistoEn: i < vistos ? new Date(AHORA - DIA).toISOString() : null })) });
const clase = (enMs, id = "c1") => ({ id, titulo: "Dudas del RUC", iniciaEn: new Date(AHORA + enMs).toISOString(), duracionMin: 60 });
const ENCUESTA = { id: "e1", pregunta: "¿Qué curso?", estado: "abierta", opciones: [], miVoto: null, yaPropuse: false };
const AVISO = { id: "a1", tipo: "aviso", texto: "Mañana hay feria en el parque central de la comunidad", visto: false };

test("hay 5 frases por ánimo en cada página y todas calzan con su lugar", () => {
  assert.deepEqual(Object.keys(FRASES.landing).sort(), [...SECCIONES].sort());
  assert.deepEqual(Object.keys(FRASES.comunidad).sort(), [...PANTALLAS].sort());
  for (const pagina of ["landing", "comunidad"]) {
    const fs = todas(pagina);
    for (const a of ANIMOS) assert.equal(fs.filter((f) => f.animo === a).length, 5, `${pagina} ${a}`);
    assert.equal(new Set(fs.map((f) => f.clave)).size, 25, `${pagina}: claves únicas`);
  }
  // En la página pública no se habla de lo que solo existe adentro, y viceversa.
  for (const f of todas("landing")) assert.doesNotMatch(f.texto, /módulo \d|muro|Mi perfil|tu clave/i, f.texto);
  for (const f of todas("comunidad")) assert.doesNotMatch(f.texto, /postula|inscr[ií]bete/i, f.texto);
});

test("ninguna frase dice barrio ni pasa de 120 caracteres", () => {
  const especiales = [ESPECIALES.saludo("landing"), ESPECIALES.saludo("comunidad"), ESPECIALES.claseFutura(clase(3 * DIA), "landing"),
    ESPECIALES.claseHoy(clase(2 * H), "comunidad"), ESPECIALES.claseHoy(clase(2 * H), "landing"), ESPECIALES.claseEmpezo("landing"),
    ESPECIALES.claseEmpezo("comunidad"), ESPECIALES.encuestaSinVotar(), ESPECIALES.mentoriaNueva({ titulo: "Factura electrónica" }),
    ESPECIALES.avisoNuevo(AVISO), ESPECIALES.moduloPendiente(2, "Tu RUC paso a paso"), ESPECIALES.regreso()];
  for (const f of [...todas("landing"), ...todas("comunidad"), ...especiales]) {
    assert.doesNotMatch(f.texto, /barrio/i, f.texto);
    assert.ok(f.texto.length <= 120, `${f.texto.length}: ${f.texto}`);
    assert.ok(ANIMOS.includes(f.animo), f.texto);
  }
  // Los títulos largos se recortan para que el globo se pueda leer.
  const larga = ESPECIALES.claseFutura({ ...clase(3 * DIA), titulo: "Cómo sacar tus costos y ponerle precio a lo que vendes en ferias y en redes sociales" }, "landing");
  assert.ok(larga.texto.length <= 120, larga.texto);
});

test("las fechas se dicen como en la comunidad, en hora de Ecuador", () => {
  assert.equal(ESPECIALES.claseFutura({ id: "c", titulo: "Dudas del RUC", iniciaEn: "2026-10-29T19:00:00-05:00" }, "landing", AHORA).texto,
    "La próxima clase en vivo es «Dudas del RUC», el jueves 29 a las 7 p. m.");
  assert.equal(ESPECIALES.claseHoy({ id: "c", titulo: "Dudas del RUC", iniciaEn: "2026-10-27T19:30:00-05:00" }, "comunidad").texto,
    "¡Hoy hay clase en vivo! «Dudas del RUC» a las 7:30 p. m. ¡Te espero!");
  assert.match(ESPECIALES.claseFutura({ id: "c", titulo: "X y Z", iniciaEn: "2026-11-10T10:00:00-05:00" }, "landing", AHORA).texto,
    /el martes 10 de noviembre a las 10 a\. m\./);
});

test("el globo dura entre 10 y 15 segundos", () => {
  assert.equal(duracionGlobo("¡Hola!"), 10000);
  assert.equal(duracionGlobo(Array(60).fill("palabra").join(" ")), 15000);
  const d = duracionGlobo(Array(20).fill("palabra").join(" "));
  assert.ok(d > 10000 && d < 15000, String(d));
});

test("orden en la comunidad", () => {
  const base = { yo: { nombres: "María José Vera" }, avisos: [AVISO], mentorias: [mentoria(1)], encuesta: ENCUESTA, ahora: AHORA };
  assert.deepEqual(anunciosComunidad({ ...base, clases: [clase(-5 * 60e3)] }).map((f) => f.clave),
    ["clase:c1:empezo", "encuesta:e1", "aviso:a1", "modulo:x2"]);
  assert.deepEqual(anunciosComunidad({ ...base, clases: [clase(2 * H)] }).map((f) => f.clave)[0], "clase:c1:hoy");
  const tres = anunciosComunidad({ ...base, clases: [clase(3 * DIA)] }).map((f) => f.clave);
  assert.deepEqual(tres.slice(0, 2), ["clase:c1:futura", "encuesta:e1"]);
  assert.ok(!anunciosComunidad({ ...base, clases: [clase(9 * DIA)] }).some((f) => f.clave.startsWith("clase:")));
  // Ya votó, vio el aviso y terminó la mentoría: nada que anunciar.
  assert.deepEqual(anunciosComunidad({ ...base, clases: [], encuesta: { ...ENCUESTA, miVoto: "o1" }, avisos: [{ ...AVISO, visto: true }], mentorias: [mentoria(3)] }), []);
  assert.deepEqual(anunciosComunidad({ ...base, clases: [], encuesta: { ...ENCUESTA, estado: "cerrada" }, avisos: [], mentorias: [] }), []);
});

test("una mentoría nueva se anuncia con su título; los avisos de invitación no se repiten como aviso", () => {
  const avisos = [{ id: "a2", tipo: "invitacion", texto: "Te invitamos a la clase", claseId: "c1", visto: false },
    { id: "a3", tipo: "mentoria", texto: "Nueva mentoría", mentoriaId: "m1", visto: false }];
  const fs = anunciosComunidad({ yo: {}, clases: [], avisos, mentorias: [mentoria(3)], encuesta: null, ahora: AHORA });
  assert.deepEqual(fs.map((f) => f.clave), ["aviso:a3"]);
  assert.equal(fs[0].texto, "¡Hay una mentoría nueva: «Tu RUC paso a paso»!");
});

test("la landing solo anuncia la clase, y una de ejemplo nunca llega", () => {
  assert.deepEqual(anunciosLanding({ clase: null, ahora: AHORA }), []);
  const [f] = anunciosLanding({ clase: { titulo: "Dudas del RUC", iniciaEn: new Date(AHORA + 2 * H).toISOString(), duracionMin: 60 }, ahora: AHORA });
  assert.match(f.texto, /Así se aprende en JUMP\.$/);
  assert.match(f.clave, /^clase:.+:hoy$/);
  const [e] = anunciosLanding({ clase: { titulo: "Dudas del RUC", iniciaEn: new Date(AHORA - 10 * 60e3).toISOString(), duracionMin: 60 }, ahora: AHORA });
  assert.equal(e.texto, "¡La clase en vivo ya empezó! Los inscritos ya están en clase en vivo.");
});

test("primera visita: saluda una sola vez por página", () => {
  const m = memoria();
  assert.equal(elegir({ lugar: "landing", seccion: "portada", anuncios: [], memoria: m, alLlegar: true }).texto,
    "¡Hola, soy JC! Te acompaño mientras conoces JUMP.");
  assert.notEqual(elegir({ lugar: "landing", seccion: "portada", anuncios: [], memoria: m, alLlegar: true }).clave, "saludo:landing");
  assert.equal(elegir({ lugar: "comunidad", seccion: "inicio", anuncios: [], memoria: m, alLlegar: true }).clave, "saludo:comunidad");
});

test("una clase se anuncia una vez por estado", () => {
  const m = memoria();
  m.marcar("saludo:comunidad");
  m.marcar("clase:c1:futura");
  const futura = anunciosComunidad({ yo: {}, clases: [clase(3 * DIA)], avisos: [], mentorias: [], encuesta: null, ahora: AHORA });
  assert.ok(elegir({ lugar: "comunidad", seccion: "inicio", anuncios: futura, memoria: m, alLlegar: true }).clave.startsWith("suelta:"));
  const hoy = anunciosComunidad({ yo: {}, clases: [clase(2 * H)], avisos: [], mentorias: [], encuesta: null, ahora: AHORA });
  assert.equal(elegir({ lugar: "comunidad", seccion: "inicio", anuncios: hoy, memoria: m, alLlegar: true }).clave, "clase:c1:hoy");
});

test("encuesta y módulo: una vez al día al llegar, pero al tocar se repiten", () => {
  let t = AHORA;
  const m = memoria(() => t);
  m.marcar("saludo:comunidad");
  const fs = anunciosComunidad({ yo: {}, clases: [], avisos: [], mentorias: [mentoria(1)], encuesta: ENCUESTA, ahora: AHORA });
  const llegar = () => elegir({ lugar: "comunidad", seccion: "inicio", anuncios: fs, memoria: m, alLlegar: true }).clave;
  const tocar = () => elegir({ lugar: "comunidad", seccion: "inicio", anuncios: fs, memoria: m, alLlegar: false }).clave;
  assert.equal(llegar(), "encuesta:e1");
  assert.equal(llegar(), "modulo:x2");
  assert.ok(llegar().startsWith("suelta:"));
  assert.equal(tocar(), "encuesta:e1", "al tocar recorre los anuncios desde el primero");
  assert.equal(tocar(), "modulo:x2");
  assert.ok(tocar().startsWith("suelta:"), "y luego las sueltas");
  t = AHORA + 25 * H;
  assert.equal(llegar(), "encuesta:e1");
});

test("en cada pantalla va primero lo suyo", () => {
  const fs = anunciosComunidad({ yo: {}, clases: [clase(3 * DIA)], avisos: [AVISO], mentorias: [mentoria(1)], encuesta: ENCUESTA, ahora: AHORA });
  assert.equal(ordenarPorPantalla(fs, "clases")[0].clave, "clase:c1:futura");
  assert.equal(ordenarPorPantalla(fs, "mentorias")[0].clave, "modulo:x2");
  assert.equal(ordenarPorPantalla(fs, "muro")[0].clave, "encuesta:e1");
  assert.deepEqual(ordenarPorPantalla(fs, "perfil").map((f) => f.clave), fs.map((f) => f.clave));
});

test("sin nada nuevo dice una suelta de la pantalla y no repite en la visita", () => {
  const m = memoria();
  m.marcar("saludo:comunidad");
  const dichas = [];
  for (let i = 0; i < 5; i++) dichas.push(elegir({ lugar: "comunidad", seccion: "perfil", anuncios: [], memoria: m, alLlegar: true }));
  assert.equal(new Set(dichas.map((f) => f.clave)).size, 5);
  const propias = new Set(FRASES.comunidad.perfil.map((f) => f.clave));
  assert.ok(dichas.slice(0, propias.size).every((f) => propias.has(f.clave)), "primero las de esa pantalla");
  // En la landing no salta a otra sección: cuando se acaban, vuelve a empezar con las suyas.
  const l = memoria();
  l.marcar("saludo:landing");
  const josue = new Set(FRASES.landing.josue.map((f) => f.clave));
  for (let i = 0; i < 3; i++) assert.ok(josue.has(elegir({ lugar: "landing", seccion: "josue", anuncios: [], memoria: l, alLlegar: true }).clave));
});

test("Memoria sigue funcionando si localStorage lanza", () => {
  const roto = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceeded"); }, removeItem() { throw new Error("x"); } };
  const m = new Memoria(roto, () => AHORA);
  assert.equal(m.dicho("aviso:a1"), false);
  m.marcar("aviso:a1");
  assert.equal(m.dicho("aviso:a1"), true);
  m.set("escondido", true);
  assert.equal(m.get("escondido"), true);
  assert.equal(m.diasDesdeUltimaVisita(), null);
  // Y si ni siquiera se puede tocar localStorage (navegador que lo bloquea al leerlo).
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
  try { assert.doesNotThrow(() => new Memoria().marcar("x")); }
  finally { if (original) Object.defineProperty(globalThis, "localStorage", original); else delete globalThis.localStorage; }
});

test("regreso tras 7 días", () => {
  const m = memoria();
  m.set("jc.ultimaVisita", AHORA - 8 * DIA);
  assert.equal(m.diasDesdeUltimaVisita(), 8);
  m.registrarVisita(); // la página registra la visita al cargar; la de antes sigue contando para esta
  const f = elegir({ lugar: "comunidad", seccion: "inicio", anuncios: [], memoria: m, alLlegar: true });
  assert.equal(f.texto, "¡Hace días que no te veía! Te extrañé.");
  assert.equal(f.animo, "triste");
  assert.notEqual(elegir({ lugar: "comunidad", seccion: "inicio", anuncios: [], memoria: m, alLlegar: true }).clave, "regreso");
  assert.equal(new Memoria(m.almacen, () => AHORA + H).diasDesdeUltimaVisita(), 0, "la visita quedó guardada");
});
