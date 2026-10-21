// /informe.js + informe-demo.html: la página del informe dibuja los porcentajes reales que da /api/informe.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const RAIZ = new URL("../../", import.meta.url);
const leer = (f) => readFileSync(new URL(f, RAIZ), "utf8");
const CODIGO = leer("informe.js");
const PAGINA = leer("informe-demo.html");

const DATOS = {
  ok: true, ventana_dias: 30, desde: "2026-09-21T13:14:00.000Z", actualizado: "2026-10-21T13:14:00.000Z", total: 57,
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
