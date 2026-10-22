// /visitas.js: el aviso que cada página pública manda a /api/track.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const RAIZ = new URL("../../", import.meta.url);
const leer = (f) => readFileSync(new URL(f, RAIZ), "utf8");
const CODIGO = leer("visitas.js");

// Corre visitas.js en una "página" falsa y devuelve lo que envió.
async function correr({ ruta = "/", guardado = null, sinStorage = false, sinBeacon = false, referrer = "" } = {}) {
  const enviados = [], store = new Map(guardado ? [["aurora_vid", guardado]] : []);
  const ctx = {
    location: { pathname: ruta },
    document: { referrer },
    localStorage: sinStorage
      ? { getItem() { throw new Error("bloqueado"); }, setItem() { throw new Error("bloqueado"); } }
      : { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    navigator: sinBeacon ? {} : { sendBeacon: (url, blob) => { enviados.push({ url, blob }); return true; } },
    fetch: (url, init) => { enviados.push({ url, init }); return Promise.resolve(); },
    crypto: { randomUUID: () => "11111111-2222-4333-8444-555555555555" },
    Blob, JSON, Date, Math, Promise,
  };
  vm.runInNewContext(CODIGO, ctx);
  const cuerpos = await Promise.all(enviados.map(async (e) => ({ url: e.url, tipo: e.blob?.type, cuerpo: JSON.parse(e.blob ? await e.blob.text() : e.init.body), init: e.init })));
  return { cuerpos, store };
}

test("envía la página, un código anónimo nuevo y de dónde llegó", async () => {
  const { cuerpos, store } = await correr({ ruta: "/terminos.html", referrer: "https://www.facebook.com/" });
  assert.equal(cuerpos.length, 1);
  assert.equal(cuerpos[0].url, "/api/track");
  assert.equal(cuerpos[0].tipo, "application/json");
  assert.deepEqual(cuerpos[0].cuerpo, { path: "/terminos.html", vid: "11111111-2222-4333-8444-555555555555", ref: "https://www.facebook.com/" });
  assert.equal(store.get("aurora_vid"), "11111111-2222-4333-8444-555555555555");
});

test("reutiliza el código guardado; si está dañado, crea otro", async () => {
  assert.equal((await correr({ guardado: "mi-codigo_1" })).cuerpos[0].cuerpo.vid, "mi-codigo_1");
  assert.equal((await correr({ guardado: "<script>" })).cuerpos[0].cuerpo.vid, "11111111-2222-4333-8444-555555555555");
});

test("en incógnito (sin almacenamiento) cuenta igual, sin código", async () => {
  assert.equal((await correr({ sinStorage: true })).cuerpos[0].cuerpo.vid, "");
});

test("sin sendBeacon usa fetch keepalive", async () => {
  const { cuerpos } = await correr({ sinBeacon: true });
  assert.equal(cuerpos[0].url, "/api/track");
  assert.equal(cuerpos[0].init.keepalive, true);
  assert.equal(cuerpos[0].init.method, "POST");
});

test("el panel nunca se cuenta", async () => {
  assert.equal((await correr({ ruta: "/admin/" })).cuerpos.length, 0);
});

test("las páginas públicas cargan /visitas.js; el panel y la página sin conexión no", () => {
  for (const f of ["index.html", "terminos.html", "politica-datos.html", "informe-demo.html"]) {
    assert.match(leer(f), /<script src="\/visitas\.js" defer><\/script>/, f);
  }
  for (const f of ["offline.html"]) assert.doesNotMatch(leer(f), /visitas\.js/, f);
  assert.doesNotMatch(leer("admin/index.html"), /src="\/visitas\.js"/);
});
