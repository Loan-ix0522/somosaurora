// /api/informe cuando ya hay un informe publicado (automático o manual): muestra ese, no el conteo en vivo.
// Si todavía no hay ninguno, o la tabla no existe, o falla, cae al conteo en vivo de 30 días ("en-curso").
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

test("con un informe publicado muestra ese: sus porcentajes, su periodo y de dónde salió", async () => {
  montar({ informes: [informe()] });
  const r = await handler(pedir());
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.modo, "informe");
  assert.equal(d.origen, "automatico");
  assert.equal(d.total, 10);
  assert.equal(d.desde, "2026-10-16T13:00:00.000Z");
  assert.equal(d.hasta, "2026-10-21T13:00:00.000Z");
  assert.equal(d.publicado, "2026-10-21T13:00:00.000Z");
  assert.deepEqual(d.temas.slice(0, 2), [{ tema: "Agua potable y cortes", total: 8, porcentaje: 80 }, { tema: "Calles y baches", total: 2, porcentaje: 20 }]);
  assert.equal(d.temas.reduce((a, t) => a + t.porcentaje, 0), 100);
});

test("entre varios informes manda el publicado más recientemente (un manual puede reemplazar al automático)", async () => {
  montar({ informes: [
    informe({ id: "viejo", created_at: "2026-10-16T13:00:00+00:00", origen: "automatico", total: 14 }),
    informe({ id: "nuevo", created_at: "2026-10-22T09:00:00+00:00", origen: "manual", total: 31 }),
    informe({ id: "medio", created_at: "2026-10-19T09:00:00+00:00", origen: "automatico", total: 22 }),
  ] });
  const d = await (await handler(pedir())).json();
  assert.equal(d.origen, "manual");
  assert.equal(d.total, 31);
});

test("dice cuántas opiniones han llegado desde el corte, cuándo toca el próximo y el mínimo para publicarlo", async () => {
  const hasta = new Date("2026-10-21T13:00:00.000Z");
  montar({
    informes: [informe()],
    opiniones: [opinion("Basura y aseo", hasta, -1 * DIA), opinion("Basura y aseo", hasta, -2 * DIA), opinion("Calles y baches", hasta, 1 * DIA)], // 2 después del corte, 1 antes
  });
  const d = await (await handler(pedir())).json();
  assert.equal(d.nuevas, 2);
  assert.equal(d.proximo, "2026-10-26T13:00:00.000Z");
  assert.equal(d.minimo, 10);
  // El conteo de "nuevas" es de un solo tramo (desde el corte), con la service role y solo el número.
  const c = sb.de("submissions");
  assert.equal(c.length, 1);
  assert.equal(c[0].metodo, "HEAD");
  assert.equal(c[0].init.headers.apikey, "clave-servicio");
  assert.deepEqual(new URL(c[0].url).searchParams.getAll("created_at"), ["gte.2026-10-21T13:00:00.000Z"]);
});

test("si no se puede contar las nuevas, igual muestra el informe (solo falta ese dato)", async () => {
  montar({ informes: [informe()] });
  sb.estado.falla = (ruta) => ruta === "submissions";
  const d = await (await handler(pedir())).json();
  assert.equal(d.ok, true);
  assert.equal(d.modo, "informe");
  assert.equal("nuevas" in d, false);
  assert.equal(d.proximo, "2026-10-26T13:00:00.000Z");
});

test("lee el informe con la service role, pide solo el último y devuelve únicamente conteos y fechas", async () => {
  montar({ informes: [informe()] });
  const d = await (await handler(pedir())).json();
  const g = sb.de("informe_publico")[0];
  assert.equal(g.metodo, "GET");
  assert.equal(g.init.headers.apikey, "clave-servicio");
  const q = new URL(g.url).searchParams;
  assert.equal(q.get("order"), "created_at.desc");
  assert.equal(q.get("limit"), "1");
  assert.deepEqual(Object.keys(d).sort(), ["desde", "hasta", "minimo", "modo", "nuevas", "ok", "origen", "proximo", "publicado", "temas", "total"]);
  assert.deepEqual(Object.keys(d.temas[0]).sort(), ["porcentaje", "tema", "total"]);
  assert.ok(!JSON.stringify(d).includes("inf-0"), "el id interno no sale");
});

test("solo deja pasar tema, total y porcentaje de cada fila, aunque la tabla traiga algo más", async () => {
  montar({ informes: [informe({ por_tema: [{ tema: "Basura y aseo", total: "7", porcentaje: 100, texto: "dato interno", celular: "099" }] })] });
  const d = await (await handler(pedir())).json();
  assert.deepEqual(d.temas, [{ tema: "Basura y aseo", total: 7, porcentaje: 100 }]);
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
  assert.equal(d.total, 2);
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
  assert.equal(d.total, 1);
});

test("si falla la lectura del informe, también cae al conteo en vivo en vez de dejar la página vacía", async () => {
  montar({ informes: [informe()], opiniones: [opinion("Basura y aseo", new Date(), DIA)] });
  sb.estado.falla = (ruta) => ruta === "informe_publico";
  const r = await handler(pedir());
  assert.equal(r.status, 200);
  assert.equal((await r.json()).modo, "en-curso");
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
