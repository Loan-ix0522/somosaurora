// /api/informe cuando ya hay un informe publicado (automático o manual): muestra ese, no el conteo en vivo.
// Si todavía no hay ninguno, o la tabla no existe (migración sin aplicar), cae al conteo en vivo de 30 días ("en-curso").
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import handler from "../../api/informe.js";
import { crearSupabase, opinion, URL_BASE } from "./supabase-falso.mjs";

const SITIO = "https://www.laauroraescucha.com";
const DIA = 864e5;
let fetchOriginal, envOriginal, sb;
const pedir = (ruta = "/api/informe", metodo = "GET") => new Request(SITIO + ruta, { method: metodo });

const POR_TEMA = [
  { tema: "Agua potable y cortes", total: 8, porcentaje: 80 }, { tema: "Calles y baches", total: 2, porcentaje: 20 },
  ...["Alcantarillado e inundaciones", "Tráfico y movilidad", "Basura y aseo", "Alumbrado público", "Áreas verdes y parques", "Otro servicio"]
    .map((tema) => ({ tema, total: 0, porcentaje: 0 })),
];
const informe = (extra = {}) => ({
  id: "inf-0", created_at: "2026-10-21T13:00:00+00:00", origen: "automatico",
  periodo_desde: "2026-10-16T13:00:00+00:00", periodo_hasta: "2026-10-21T13:00:00+00:00", total: 10, por_tema: POR_TEMA, ...extra,
});

function montar(datos) {
  sb = crearSupabase(datos);
  globalThis.fetch = sb.fetch;
}
beforeEach(() => {
  fetchOriginal = globalThis.fetch;
  envOriginal = { ...process.env };
  process.env.SUPABASE_URL = URL_BASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-servicio";
});
afterEach(() => { globalThis.fetch = fetchOriginal; process.env = envOriginal; });

test("con un informe publicado muestra ese: sus porcentajes, su periodo y los temas sin opiniones", async () => {
  montar({ informes: [informe()] });
  const r = await handler(pedir());
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.modo, "informe");
  assert.equal(d.origen, "automatico");
  assert.equal(d.desde, "2026-10-16T13:00:00.000Z");
  assert.equal(d.hasta, "2026-10-21T13:00:00.000Z");
  assert.equal(d.publicado, "2026-10-21T13:00:00.000Z");
  assert.deepEqual(d.temas, [{ tema: "Agua potable y cortes", porcentaje: 80 }, { tema: "Calles y baches", porcentaje: 20 }]);
  assert.deepEqual(d.sin_opiniones, ["Alcantarillado e inundaciones", "Tráfico y movilidad", "Basura y aseo", "Alumbrado público", "Áreas verdes y parques", "Otro servicio"]);
  assert.equal(d.temas.reduce((a, t) => a + t.porcentaje, 0), 100);
});

test("entre varios informes manda el publicado más recientemente (un manual puede reemplazar al automático)", async () => {
  montar({ informes: [
    informe({ id: "viejo", created_at: "2026-10-16T13:00:00+00:00", origen: "automatico", por_tema: [{ tema: "Basura y aseo", total: 14, porcentaje: 100 }] }),
    informe({ id: "nuevo", created_at: "2026-10-22T09:00:00+00:00", origen: "manual", por_tema: [{ tema: "Alumbrado público", total: 31, porcentaje: 100 }] }),
    informe({ id: "medio", created_at: "2026-10-19T09:00:00+00:00", origen: "automatico", por_tema: [{ tema: "Calles y baches", total: 22, porcentaje: 100 }] }),
  ] });
  const d = await (await handler(pedir())).json();
  assert.equal(d.origen, "manual");
  assert.deepEqual(d.temas, [{ tema: "Alumbrado público", porcentaje: 100 }]);
});

test("no cuenta ni dice cuántas opiniones han llegado desde el corte (no consulta las opiniones), pero sí cuándo toca el próximo", async () => {
  const hasta = new Date("2026-10-21T13:00:00.000Z");
  montar({ informes: [informe()], opiniones: [opinion("Basura y aseo", hasta, -1 * DIA), opinion("Calles y baches", hasta, 1 * DIA)] });
  const d = await (await handler(pedir())).json();
  assert.equal("nuevas" in d, false);
  assert.equal("minimo" in d, false);
  assert.equal(d.proximo, "2026-10-26T13:00:00.000Z");
  assert.equal(sb.de("submissions").length, 0);
});

test("lee el informe con la service role, pide solo el último y devuelve únicamente porcentajes y fechas", async () => {
  montar({ informes: [informe()] });
  const d = await (await handler(pedir())).json();
  const g = sb.de("informe_publico")[0];
  assert.equal(g.metodo, "GET");
  assert.equal(g.init.headers.apikey, "clave-servicio");
  const q = new URL(g.url).searchParams;
  assert.equal(q.get("order"), "created_at.desc");
  assert.equal(q.get("limit"), "1");
  assert.deepEqual(Object.keys(d).sort(), ["desde", "hasta", "modo", "ok", "origen", "proximo", "publicado", "sin_opiniones", "temas"]);
  assert.deepEqual(Object.keys(d.temas[0]).sort(), ["porcentaje", "tema"]);
  assert.ok(!JSON.stringify(d).includes("inf-0"), "el id interno no sale");
  assert.ok(!/"total"|"nuevas"|"minimo"/.test(JSON.stringify(d)), "ninguna cantidad de opiniones");
});

test("solo deja pasar tema y porcentaje de cada fila, aunque la tabla traiga algo más (ni las cantidades)", async () => {
  montar({ informes: [informe({ por_tema: [{ tema: "Basura y aseo", total: "7", porcentaje: 100, texto: "dato interno", celular: "099" }] })] });
  const d = await (await handler(pedir())).json();
  assert.deepEqual(d.temas, [{ tema: "Basura y aseo", porcentaje: 100 }]);
  assert.deepEqual(d.sin_opiniones, []);
});

test("el informe se guarda en caché unos minutos, igual que el conteo en vivo", async () => {
  montar({ informes: [informe()] });
  const r = await handler(pedir());
  assert.match(r.headers.get("Cache-Control"), /s-maxage=300/);
  assert.match(r.headers.get("Cache-Control"), /max-age=60/);
});

test("sin ningún informe publicado cuenta en vivo los últimos 30 días (modo en-curso)", async () => {
  const ahora = new Date();
  montar({ informes: [], opiniones: [opinion("Basura y aseo", ahora, 2 * DIA), opinion("Basura y aseo", ahora, 3 * DIA), opinion("Calles y baches", ahora, 40 * DIA)] });
  const d = await (await handler(pedir())).json();
  assert.equal(d.ok, true);
  assert.equal(d.modo, "en-curso");
  assert.equal(d.ventana_dias, 30);
  assert.equal(d.temas[0].tema, "Basura y aseo");
  assert.equal(d.temas[0].porcentaje, 100);
});

test("si la tabla informe_publico no existe todavía (migración 0007 sin aplicar), cae al conteo en vivo sin error", async () => {
  montar({ sinTabla: true, opiniones: [opinion("Basura y aseo", new Date(), DIA)] });
  const r = await handler(pedir());
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.modo, "en-curso");
  assert.equal(d.temas[0].tema, "Basura y aseo");
});

test("si falla la lectura del informe (y no es que falte la tabla) no inventa el conteo en vivo: responde 502 y sin caché", async () => {
  // Con un informe ya publicado, mostrar «todavía no hay primer informe» sería falso; mejor el aviso de error
  // de la página (y Vercel sigue sirviendo la última respuesta buena de su caché).
  montar({ informes: [informe()], opiniones: [opinion("Basura y aseo", new Date(), DIA)] });
  sb.estado.falla = (ruta) => ruta === "informe_publico";
  const r = await handler(pedir());
  assert.equal(r.status, 502);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await r.json(), { ok: false, error: "No se pudo calcular el informe." });
});

test("si falla todo (informe y conteo) responde 502 genérico y sin caché", async () => {
  montar({ informes: [informe()] });
  sb.estado.falla = () => true;
  const r = await handler(pedir());
  assert.equal(r.status, 502);
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  const txt = await r.text();
  assert.deepEqual(JSON.parse(txt), { ok: false, error: "No se pudo calcular el informe." });
  assert.ok(!/boom|detalles/.test(txt));
});

test("sigue siendo solo GET y sin ?consulta, y sin configuración no toca la red", async () => {
  montar({ informes: [informe()] });
  assert.equal((await handler(pedir("/api/informe", "POST"))).status, 405);
  assert.equal((await handler(pedir("/api/informe?x=1"))).status, 400);
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal((await handler(pedir())).status, 503);
  assert.equal(sb.estado.llamadas.length, 0);
});
