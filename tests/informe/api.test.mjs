// /api/informe, modo "en-curso" (todavía no hay ningún informe publicado): los porcentajes salen de las
// opiniones reales de los últimos 30 días. Solo devuelve conteos (nada personal) y se arma con la service
// role porque la tabla no se puede leer en público. El modo con informe publicado está en informe-publicado.test.mjs.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import handler from "../../api/informe.js";
import { TEMAS, VENTANA_DIAS, repartir } from "../../api/_informe.js";

const SITIO = "https://www.laauroraescucha.com";
let llamadas, fetchOriginal, envOriginal, base;

// Un "Supabase" mínimo: responde el conteo de cada tema (o el total si no se filtra por tema).
// La lista de informes publicados viene vacía: es el caso "todavía no hay ninguno".
function supabaseFalso(porTema) {
  const total = Object.values(porTema).reduce((a, b) => a + b, 0);
  return async (url, init) => {
    llamadas.push({ url: String(url), init });
    const u = new URL(url);
    if (u.pathname.endsWith("/informe_publico")) return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
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

test("reparte las opiniones reales en porcentajes que suman 100, de mayor a menor; los temas sin opiniones van aparte", async () => {
  const r = await handler(pedir());
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.ventana_dias, 30);
  assert.deepEqual(d.temas.map((t) => [t.tema, t.porcentaje]), [["Tráfico y movilidad", 60], ["Basura y aseo", 30], ["Alumbrado público", 10]]);
  assert.deepEqual(d.sin_opiniones, ["Agua potable y cortes", "Alcantarillado e inundaciones", "Calles y baches", "Áreas verdes y parques", "Otro servicio"]);
  assert.equal(d.temas.reduce((a, t) => a + t.porcentaje, 0), 100);
});

test("pregunta a la base con la service role: un conteo por tema y uno del total, solo de los últimos 30 días", async () => {
  const antes = Date.now();
  await handler(pedir());
  const conteos = llamadas.filter((l) => new URL(l.url).pathname.endsWith("/submissions"));
  assert.equal(conteos.length, TEMAS.length + 1);
  for (const { url, init } of conteos) {
    assert.equal(init.method, "HEAD");
    assert.equal(init.headers.apikey, "clave-servicio");
    assert.equal(init.headers.Authorization, "Bearer clave-servicio");
    assert.equal(init.headers.Prefer, "count=exact");
    const u = new URL(url);
    assert.equal(u.origin + u.pathname, "https://ejemplo.supabase.co/rest/v1/submissions");
    const desde = new Date(u.searchParams.get("created_at").replace(/^gte\./, "")).getTime();
    assert.ok(Math.abs((antes - desde) - VENTANA_DIAS * 864e5) < 60_000, "la ventana es de 30 días");
  }
  const temas = conteos.map((l) => new URL(l.url).searchParams.get("tema")).filter(Boolean).map((t) => t.replace(/^eq\./, ""));
  assert.deepEqual(temas.sort(), [...TEMAS].sort());
});

test("lo que no es de ningún tema conocido va aparte, como 'Otros temas'", async () => {
  globalThis.fetch = async (url, init) => {
    llamadas.push({ url: String(url), init });
    if (new URL(url).pathname.endsWith("/informe_publico")) return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
    const tema = new URL(url).searchParams.get("tema");
    const n = tema === "eq.Basura y aseo" ? 2 : tema ? 0 : 5; // total 5, 3 sin tema conocido
    return new Response(null, { status: 200, headers: { "content-range": n ? `0-0/${n}` : "*/0" } });
  };
  const d = await (await handler(pedir())).json();
  assert.deepEqual(d.temas.map((t) => [t.tema, t.porcentaje]), [["Otros temas", 60], ["Basura y aseo", 40]]);
  assert.ok(!d.sin_opiniones.includes("Otros temas") && !d.sin_opiniones.includes("Basura y aseo"));
});

test("un tema con alguna opinión pero menos del 1 % no tiene tarjeta, y tampoco se dice que no tiene opiniones", async () => {
  globalThis.fetch = supabaseFalso({ "Basura y aseo": 299, "Calles y baches": 1 });
  const d = await (await handler(pedir())).json();
  assert.deepEqual(d.temas, [{ tema: "Basura y aseo", porcentaje: 100 }]);
  assert.ok(!d.sin_opiniones.includes("Calles y baches"));
  assert.ok(d.sin_opiniones.includes("Alumbrado público"));
});

test("sin opiniones: ningún tema con porcentaje, todos aparte y nada de errores", async () => {
  globalThis.fetch = supabaseFalso({});
  const d = await (await handler(pedir())).json();
  assert.equal(d.ok, true);
  assert.deepEqual(d.temas, []);
  assert.deepEqual([...d.sin_opiniones].sort(), [...TEMAS].sort());
});

test("la respuesta solo lleva porcentajes y fechas: ni cantidades ni nada personal", async () => {
  const d = await (await handler(pedir())).json();
  assert.equal(d.modo, "en-curso");
  assert.deepEqual(Object.keys(d).sort(), ["actualizado", "desde", "modo", "ok", "sin_opiniones", "temas", "ventana_dias"]);
  assert.deepEqual(Object.keys(d.temas[0]).sort(), ["porcentaje", "tema"]);
  assert.ok(!/"total"|"nuevas"|"minimo"/.test(JSON.stringify(d)), "ninguna cantidad de opiniones");
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
  assert.ok(llamadas.length > 0 && llamadas.every((l) => l.url.startsWith("https://otro.supabase.co/rest/v1/")));
  assert.ok(llamadas.every((l) => l.init.headers.apikey === "otra-clave"));
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
