// /api/informe: los porcentajes del informe ciudadano salen de las opiniones reales de los últimos 30 días.
// Solo devuelve conteos (nada personal) y se arma con la service role porque la tabla no se puede leer en público.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import handler from "../../api/informe.js";
import { TEMAS, VENTANA_DIAS, repartir } from "../../api/_informe.js";

const SITIO = "https://www.laauroraescucha.com";
let llamadas, fetchOriginal, envOriginal, base;

// Un "Supabase" mínimo: responde el conteo de cada tema (o el total si no se filtra por tema).
function supabaseFalso(porTema) {
  const total = Object.values(porTema).reduce((a, b) => a + b, 0);
  return async (url, init) => {
    llamadas.push({ url: String(url), init });
    const u = new URL(url);
    const tema = u.searchParams.get("tema");
    const n = tema ? (porTema[tema.replace(/^eq\./, "")] ?? 0) : total;
    return new Response(null, { status: 200, headers: { "content-range": n ? `0-0/${n}` : "*/0" } });
  };
}
const pedir = (ruta = "/api/informe", metodo = "GET") => new Request(SITIO + ruta, { method: metodo });

beforeEach(() => {
  llamadas = [];
  fetchOriginal = globalThis.fetch;
  envOriginal = { ...process.env };
  process.env.SUPABASE_URL = "https://ejemplo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-servicio";
  base = { "Tráfico y movilidad": 6, "Basura y aseo": 3, "Alumbrado público": 1 };
  globalThis.fetch = supabaseFalso(base);
});
afterEach(() => { globalThis.fetch = fetchOriginal; process.env = envOriginal; });

test("reparte las opiniones reales en porcentajes que suman 100, de mayor a menor", async () => {
  const r = await handler(pedir());
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.total, 10);
  assert.equal(d.ventana_dias, 30);
  assert.deepEqual(d.temas.map((t) => [t.tema, t.total, t.porcentaje]), [
    ["Tráfico y movilidad", 6, 60], ["Basura y aseo", 3, 30], ["Alumbrado público", 1, 10],
    ["Agua potable y cortes", 0, 0], ["Alcantarillado e inundaciones", 0, 0], ["Calles y baches", 0, 0],
    ["Áreas verdes y parques", 0, 0], ["Otro servicio", 0, 0],
  ]);
  assert.equal(d.temas.reduce((a, t) => a + t.porcentaje, 0), 100);
});

test("pregunta a la base con la service role: un conteo por tema y uno del total, solo de los últimos 30 días", async () => {
  const antes = Date.now();
  await handler(pedir());
  assert.equal(llamadas.length, TEMAS.length + 1);
  for (const { url, init } of llamadas) {
    assert.equal(init.method, "HEAD");
    assert.equal(init.headers.apikey, "clave-servicio");
    assert.equal(init.headers.Authorization, "Bearer clave-servicio");
    assert.equal(init.headers.Prefer, "count=exact");
    const u = new URL(url);
    assert.equal(u.origin + u.pathname, "https://ejemplo.supabase.co/rest/v1/submissions");
    const desde = new Date(u.searchParams.get("created_at").replace(/^gte\./, "")).getTime();
    assert.ok(Math.abs((antes - desde) - VENTANA_DIAS * 864e5) < 60_000, "la ventana es de 30 días");
  }
  const temas = llamadas.map((l) => new URL(l.url).searchParams.get("tema")).filter(Boolean).map((t) => t.replace(/^eq\./, ""));
  assert.deepEqual(temas.sort(), [...TEMAS].sort());
});

test("lo que no es de ningún tema conocido va aparte, como 'Otros temas'", async () => {
  globalThis.fetch = async (url, init) => {
    llamadas.push({ url: String(url), init });
    const tema = new URL(url).searchParams.get("tema");
    const n = tema === "eq.Basura y aseo" ? 2 : tema ? 0 : 5; // total 5, 3 sin tema conocido
    return new Response(null, { status: 200, headers: { "content-range": n ? `0-0/${n}` : "*/0" } });
  };
  const d = await (await handler(pedir())).json();
  assert.equal(d.total, 5);
  assert.deepEqual(d.temas.slice(0, 2).map((t) => [t.tema, t.total, t.porcentaje]), [["Otros temas", 3, 60], ["Basura y aseo", 2, 40]]);
});

test("sin opiniones: total 0, todos en 0 % y nada de errores", async () => {
  globalThis.fetch = supabaseFalso({});
  const d = await (await handler(pedir())).json();
  assert.equal(d.ok, true);
  assert.equal(d.total, 0);
  assert.ok(d.temas.every((t) => t.total === 0 && t.porcentaje === 0));
});

test("la respuesta solo lleva conteos y fechas: nada personal", async () => {
  const d = await (await handler(pedir())).json();
  assert.deepEqual(Object.keys(d).sort(), ["actualizado", "desde", "ok", "temas", "total", "ventana_dias"]);
  assert.deepEqual(Object.keys(d.temas[0]).sort(), ["porcentaje", "tema", "total"]);
});

test("se guarda en caché unos minutos y el navegador vuelve a pedir pronto (actualiza día a día)", async () => {
  const r = await handler(pedir());
  assert.match(r.headers.get("Cache-Control"), /s-maxage=300/);
  assert.match(r.headers.get("Cache-Control"), /max-age=60/);
  assert.equal(r.headers.get("Content-Type"), "application/json");
});

test("solo GET, y sin ?consulta (cada consulta distinta saltaría la caché y golpearía la base)", async () => {
  assert.equal((await handler(pedir("/api/informe", "POST"))).status, 405);
  assert.equal((await handler(pedir("/api/informe?x=1"))).status, 400);
  assert.equal(llamadas.length, 0);
});

test("sin configuración responde 503 sin tocar la red", async () => {
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await handler(pedir());
  assert.equal(r.status, 503);
  assert.equal(llamadas.length, 0);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
});

test("acepta los nombres de variables que quedaron puestos en Vercel", async () => {
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.ProjectURL = "https://otro.supabase.co"; process.env.service_role = "otra-clave";
  const r = await handler(pedir());
  assert.equal(r.status, 200);
  assert.ok(llamadas[0].url.startsWith("https://otro.supabase.co/rest/v1/submissions"));
  assert.equal(llamadas[0].init.headers.apikey, "otra-clave");
});

test("si la base falla (error, corte o respuesta rara) responde 502 genérico y no se guarda en caché", async () => {
  const fallos = [
    async () => new Response("boom con detalles internos", { status: 500 }),
    async () => { throw new Error("ECONNRESET en 10.0.0.5"); },
    async () => new Response(null, { status: 200 }), // sin content-range
    async () => new Response(null, { status: 200, headers: { "content-range": "basura" } }),
  ];
  for (const f of fallos) {
    globalThis.fetch = f;
    const r = await handler(pedir());
    assert.equal(r.status, 502);
    assert.equal(r.headers.get("Cache-Control"), "no-store");
    const txt = await r.text();
    assert.deepEqual(JSON.parse(txt), { ok: false, error: "No se pudo calcular el informe." });
    assert.ok(!/boom|ECONNRESET|10\.0\.0\.5/.test(txt));
  }
});

test("repartir: los restos van a quien más se acerca (1/3 cada uno → 34, 33, 33) y siempre suma 100", () => {
  const r = repartir({ "Basura y aseo": 1, "Calles y baches": 1, "Alumbrado público": 1 }, 3);
  assert.deepEqual(r.map((t) => t.porcentaje).slice(0, 3), [34, 33, 33]);
  for (const [a, b, c] of [[7, 2, 2], [1, 1, 5], [13, 29, 3], [1, 0, 0]]) {
    const total = a + b + c;
    const x = repartir({ "Basura y aseo": a, "Calles y baches": b, "Alumbrado público": c }, total);
    assert.equal(x.reduce((s, t) => s + t.porcentaje, 0), 100, `${a}/${b}/${c}`);
  }
});

test("la lista de temas es la misma que acepta el formulario (api/submit.js)", () => {
  const fuente = readFileSync(new URL("../../api/submit.js", import.meta.url), "utf8");
  const bloque = fuente.match(/const TEMAS = \[([\s\S]*?)\];/)[1];
  const delFormulario = [...bloque.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(delFormulario.length >= 8);
  assert.deepEqual([...TEMAS].sort(), delFormulario.sort());
});
