// /informe.js + informe-demo.html: la página del informe dibuja lo que da /api/informe: el informe publicado
// (cada 5 días o el manual del equipo) o, mientras no haya ninguno, el conteo en vivo de los últimos 30 días.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const RAIZ = new URL("../../", import.meta.url);
const leer = (f) => readFileSync(new URL(f, RAIZ), "utf8");
const CODIGO = leer("informe.js");
const PAGINA = leer("informe-demo.html");

const DATOS = {
  ok: true, modo: "en-curso", ventana_dias: 30, desde: "2026-09-21T13:14:00.000Z", actualizado: "2026-10-21T13:14:00.000Z", total: 57,
  temas: [
    { tema: "Tráfico y movilidad", total: 32, porcentaje: 56 },
    { tema: "Basura y aseo", total: 14, porcentaje: 25 },
    { tema: "Alumbrado público", total: 11, porcentaje: 19 },
    { tema: "Agua potable y cortes", total: 0, porcentaje: 0 },
    { tema: "Calles y baches", total: 0, porcentaje: 0 },
  ],
};
const CITAS = { ok: true, items: [
  { texto: "Falta alumbrado en la calle principal.", autor_display: "Residente", tema: "Alumbrado público", sector: "Villa Club" },
  { texto: "La basura no pasa los domingos.", autor_display: "Vecino de La Aurora" },
  { texto: "Tercera cita", autor_display: "Residente" },
  { texto: "Cuarta cita", autor_display: "Residente" },
] };

const respuesta = (cuerpo, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(cuerpo) });
const esperar = () => new Promise((r) => setImmediate(r));

// Corre informe.js en una "página" falsa. `api` y `citas` son lo que responden /api/informe y /api/featured.
async function correr({ api = () => respuesta(DATOS), citas = () => respuesta(CITAS), sinCaja = false } = {}) {
  const pedidos = [];
  const caja = { innerHTML: "", hidden: false }, zonaCitas = { innerHTML: "", hidden: true };
  const ctx = {
    document: { getElementById: (id) => (sinCaja ? null : id === "informe-datos" ? caja : id === "informe-citas" ? zonaCitas : null) },
    fetch: (url, init) => { pedidos.push(url); return url === "/api/informe" ? api() : citas(); },
  };
  vm.runInNewContext(CODIGO, ctx);
  await esperar(); await esperar();
  return { caja, zonaCitas, pedidos };
}

test("pide /api/informe y dibuja una tarjeta por tema con opiniones: porcentaje, cantidad y barra", async () => {
  const { caja, pedidos } = await correr();
  assert.ok(pedidos.includes("/api/informe"));
  const h = caja.innerHTML;
  assert.match(h, /56%[\s\S]*Tráfico y movilidad[\s\S]*32 opiniones/);
  assert.match(h, /25%[\s\S]*Basura y aseo[\s\S]*14 opiniones/);
  assert.match(h, /19%[\s\S]*Alumbrado público[\s\S]*11 opiniones/);
  assert.match(h, /style="width:56%"/);
  assert.ok(h.indexOf("Tráfico y movilidad") < h.indexOf("Basura y aseo"), "mantiene el orden de mayor a menor");
});

test("los temas sin opiniones no llevan tarjeta: se nombran aparte", async () => {
  const { caja } = await correr();
  assert.equal((caja.innerHTML.match(/class="card"/g) || []).length, 3);
  assert.match(caja.innerHTML, /Sin opiniones por ahora:[^<]*Agua potable y cortes[^<]*Calles y baches/);
});

test("dice cuántas opiniones son, de qué días y cuándo se actualizó (hora de Ecuador)", async () => {
  const { caja } = await correr();
  assert.match(caja.innerHTML, /57 opiniones/);
  assert.match(caja.innerHTML, /del 21 sep al 21 oct/);
  assert.match(caja.innerHTML, /actualizado el 21 oct a las 08:14/);
});

test("con pocas opiniones avisa que los porcentajes se irán afinando; con 20 o más no", async () => {
  const pocas = { ...DATOS, total: 4, temas: [{ tema: "Basura y aseo", total: 4, porcentaje: 100 }] };
  assert.match((await correr({ api: () => respuesta(pocas) })).caja.innerHTML, /pocas opiniones/i);
  assert.doesNotMatch((await correr()).caja.innerHTML, /pocas opiniones/i);
});

test("una sola opinión se lee en singular", async () => {
  const una = { ...DATOS, total: 1, temas: [{ tema: "Basura y aseo", total: 1, porcentaje: 100 }] };
  const h = (await correr({ api: () => respuesta(una) })).caja.innerHTML;
  assert.match(h, /1 opinión(?!es)/);
  assert.doesNotMatch(h, /1 opiniones/);
});

test("sin opiniones: explica que aún no hay y no dibuja tarjetas", async () => {
  const vacio = { ...DATOS, total: 0, temas: DATOS.temas.map((t) => ({ ...t, total: 0, porcentaje: 0 })) };
  const h = (await correr({ api: () => respuesta(vacio) })).caja.innerHTML;
  assert.match(h, /todavía no hay opiniones/i);
  assert.doesNotMatch(h, /class="card"/);
});

test("si el informe no carga (corte, error o respuesta rara) muestra un aviso amable y no rompe", async () => {
  const casos = [
    () => Promise.reject(new Error("sin red")),
    () => respuesta({ ok: false }, false),
    () => respuesta({ ok: false, error: "No se pudo calcular el informe." }),
    () => respuesta({ ok: true, temas: "raro" }),
  ];
  for (const api of casos) {
    const { caja } = await correr({ api });
    assert.match(caja.innerHTML, /No pudimos cargar los porcentajes/);
    assert.doesNotMatch(caja.innerHTML, /sin red|undefined|NaN/);
  }
});

test("escapa lo que viene del servidor (un tema o una cita con HTML no se ejecuta)", async () => {
  const malo = { ...DATOS, temas: [{ tema: '<img src=x onerror="alert(1)">', total: 5, porcentaje: 100 }], total: 5 };
  const citas = { ok: true, items: [{ texto: '<script>alert(2)</script> "hola"', autor_display: "<b>yo</b>" }] };
  const { caja, zonaCitas } = await correr({ api: () => respuesta(malo), citas: () => respuesta(citas) });
  assert.doesNotMatch(caja.innerHTML, /<img|onerror="/);
  assert.doesNotMatch(zonaCitas.innerHTML, /<script|<b>/);
  assert.match(caja.innerHTML, /&lt;img/);
  assert.match(zonaCitas.innerHTML, /&lt;script&gt;/);
});

test("comentarios destacados: muestra hasta 3 de /api/featured y revela la sección", async () => {
  const { zonaCitas, pedidos } = await correr();
  assert.ok(pedidos.includes("/api/featured"));
  assert.equal(zonaCitas.hidden, false);
  assert.match(zonaCitas.innerHTML, /Falta alumbrado en la calle principal\./);
  assert.match(zonaCitas.innerHTML, /Tercera cita/);
  assert.doesNotMatch(zonaCitas.innerHTML, /Cuarta cita/);
});

test("sin comentarios destacados (o si fallan) la sección queda oculta: no se inventan citas", async () => {
  for (const citas of [() => respuesta({ ok: true, items: [] }), () => Promise.reject(new Error("x")), () => respuesta({ ok: false }, false)]) {
    const { zonaCitas } = await correr({ citas });
    assert.equal(zonaCitas.hidden, true);
    assert.equal(zonaCitas.innerHTML, "");
  }
});

test("en una página sin la caja del informe no hace nada (ni pide datos)", async () => {
  const { pedidos } = await correr({ sinCaja: true });
  assert.deepEqual(pedidos, []);
});

test("la página: carga informe.js y el contador, ya no trae porcentajes ni citas escritos a mano", () => {
  assert.match(PAGINA, /<script src="\/informe\.js" defer><\/script>/);
  assert.match(PAGINA, /<script src="\/visitas\.js" defer><\/script>/);
  assert.match(PAGINA, /id="informe-datos"/);
  assert.match(PAGINA, /id="informe-citas"/);
  assert.doesNotMatch(PAGINA, /\b(28|22|18|14)%/);
  assert.doesNotMatch(PAGINA, /demostración|muestra visual|Hace falta más iluminación/i);
  assert.match(PAGINA, /<noscript>/);
});

// ---- Modo "informe": ya hay uno publicado ----
const DIA = 864e5;
const TEMAS_INFORME = [
  { tema: "Agua potable y cortes", total: 8, porcentaje: 62 },
  { tema: "Calles y baches", total: 5, porcentaje: 38 },
  { tema: "Basura y aseo", total: 0, porcentaje: 0 },
];
const INFORME = () => ({
  ok: true, modo: "informe", origen: "automatico", publicado: "2026-10-21T13:00:00.000Z",
  desde: "2026-10-16T13:00:00.000Z", hasta: "2026-10-21T13:00:00.000Z", total: 13, temas: TEMAS_INFORME,
  nuevas: 7, proximo: new Date(Date.now() + 2 * DIA).toISOString(), minimo: 10,
});
const mostrar = async (d) => (await correr({ api: () => respuesta(d) })).caja.innerHTML;

test("informe publicado: dibuja sus porcentajes y dice de qué días es, cuándo se publicó y que fue automático", async () => {
  const h = await mostrar(INFORME());
  assert.match(h, /62%[\s\S]*Agua potable y cortes[\s\S]*8 opiniones/);
  assert.match(h, /38%[\s\S]*Calles y baches[\s\S]*5 opiniones/);
  assert.match(h, /13 opiniones/);
  assert.match(h, /del 16 oct al 21 oct/);
  assert.match(h, /publicado el 21 oct/);
  assert.match(h, /informe automático/i);
  assert.match(h, /Sin opiniones por ahora:[^<]*Basura y aseo/);
});

test("informe manual: el último día incluido es el día anterior al corte (el corte es la medianoche de Ecuador) y dice que lo preparó el equipo", async () => {
  const h = await mostrar({ ...INFORME(), origen: "manual", desde: "2026-10-10T05:00:00.000Z", hasta: "2026-10-12T05:00:00.000Z" });
  assert.match(h, /del 10 oct al 11 oct/);
  assert.doesNotMatch(h, /al 12 oct/);
  assert.match(h, /preparado por el equipo/i);
  assert.doesNotMatch(h, /informe automático/i);
});

test("un informe de un solo día se lee 'el 26 oct', no 'del 26 oct al 26 oct'", async () => {
  const h = await mostrar({ ...INFORME(), desde: "2026-10-26T05:00:00.000Z", hasta: "2026-10-27T05:00:00.000Z" });
  assert.match(h, /el 26 oct/);
  assert.doesNotMatch(h, /al 26 oct/);
});

test("cuenta las opiniones nuevas desde el informe y cuándo sale el próximo (si llegan pocas, este se mantiene)", async () => {
  const d = INFORME();
  const h = await mostrar(d);
  assert.match(h, /han llegado 7 opiniones nuevas/);
  const dia = new Date(Date.parse(d.proximo) - 5 * 3600e3);
  assert.match(h, new RegExp("a partir del " + dia.getUTCDate() + " "));
  assert.match(h, /al menos 10 opiniones nuevas/);
  assert.match(h, /este se mantiene/);
});

test("opiniones nuevas: 0, 1 y sin dato se leen bien", async () => {
  assert.match(await mostrar({ ...INFORME(), nuevas: 0 }), /Todavía no han llegado opiniones nuevas/);
  const una = await mostrar({ ...INFORME(), nuevas: 1 });
  assert.match(una, /ha llegado 1 opinión nueva/);
  assert.doesNotMatch(una, /1 opiniones/);
  const sin = { ...INFORME() }; delete sin.nuevas;
  const h = await mostrar(sin);
  assert.doesNotMatch(h, /han llegado|ha llegado|undefined|NaN/);
  assert.match(h, /próximo informe/i);
});

test("si ya pasó la fecha del próximo y faltan opiniones, dice que sale en cuanto lleguen suficientes", async () => {
  const h = await mostrar({ ...INFORME(), proximo: new Date(Date.now() - DIA).toISOString(), nuevas: 3 });
  assert.match(h, /en cuanto lleguen al menos 10 opiniones nuevas/);
  assert.doesNotMatch(h, /a partir del/);
});

test("un informe con pocas opiniones (manual) avisa que es solo una referencia; no promete que se vaya a mover", async () => {
  const pocas = await mostrar({ ...INFORME(), total: 4, temas: [{ tema: "Basura y aseo", total: 4, porcentaje: 100 }] });
  assert.match(pocas, /pocas opiniones[^<]*referencia/i);
  assert.doesNotMatch(pocas, /afinando|moverse/i);
  assert.doesNotMatch(await mostrar(INFORME()), /pocas opiniones/i);
});

test("conteo en vivo (todavía no hay informe): lo explica y dice que el oficial sale cada 5 días", async () => {
  const h = await mostrar(DATOS);
  assert.match(h, /todavía no se ha publicado/i);
  assert.match(h, /cada 5 días/);
  assert.match(h, /57 opiniones/);
  assert.doesNotMatch(h, /próximo informe|preparado por el equipo/i);
});

test("un informe publicado con datos raros no rompe la página", async () => {
  for (const d of [{ ...INFORME(), temas: "raro" }, { ...INFORME(), desde: "basura", hasta: null }, { ...INFORME(), proximo: "nunca", nuevas: "x" }]) {
    const h = await mostrar(d);
    assert.doesNotMatch(h, /undefined|NaN|Invalid/);
  }
});

test("la página ya no promete 'día a día con cada opinión': explica el informe cada 5 días", () => {
  assert.doesNotMatch(PAGINA, /día a día|con cada opinión nueva/i);
  assert.match(PAGINA, /cada 5 días/i);
  assert.doesNotMatch(PAGINA, /en vivo/i);
});
