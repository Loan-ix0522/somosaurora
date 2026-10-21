// /api/informe-admin: desde el panel, un admin calcula (vista previa) o publica un informe de un rango de fechas.
// El servidor cuenta de verdad: del navegador solo reciben las fechas. Solo admins de la sesión; mismo sitio.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import handler from "../../api/informe-admin.js";
import informe from "../../api/informe.js";
import { crearSupabase, URL_BASE } from "./supabase-falso.mjs";

const SITIO = "https://www.laauroraescucha.com";
const DIA = 864e5;
const ADMIN = "token-admin", VECINO = "token-vecino";
let fetchOriginal, envOriginal, sb;

function pedir(cuerpo, { metodo = "POST", token = ADMIN, origen = SITIO, extra = {} } = {}) {
  const headers = { "content-type": "application/json", ...extra };
  if (origen) headers.origin = origen;
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(SITIO + "/api/informe-admin", { method: metodo, headers, body: metodo === "GET" ? undefined : (typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)) });
}
function montar(datos = {}) { sb = crearSupabase(datos); globalThis.fetch = sb.fetch; }
const en = (iso, tema = "Basura y aseo") => ({ tema, created_at: iso });

beforeEach(() => {
  fetchOriginal = globalThis.fetch; envOriginal = { ...process.env };
  process.env.SUPABASE_URL = URL_BASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-servicio";
  process.env.SUPABASE_ANON_KEY = "clave-anon";
});
afterEach(() => { globalThis.fetch = fetchOriginal; process.env = envOriginal; });

// Opiniones de muestra alrededor de los bordes del 10 al 11 de octubre (días de Ecuador: empiezan a las 05:00 UTC).
const BORDES = [
  en("2026-10-10T04:59:59.000Z", "Calles y baches"),   // 9 de oct 23:59:59 en Ecuador: NO
  en("2026-10-10T05:00:00.000Z", "Basura y aseo"),     // 10 de oct 00:00:00: sí
  en("2026-10-11T12:00:00.000Z", "Basura y aseo"),     // sí
  en("2026-10-12T04:59:59.000Z", "Agua potable y cortes"), // 11 de oct 23:59:59: sí
  en("2026-10-12T05:00:00.000Z", "Calles y baches"),   // 12 de oct 00:00:00: NO
];

test("calcular: cuenta solo los días elegidos, con el día de Ecuador, y no guarda nada", async () => {
  montar({ opiniones: BORDES });
  const r = await handler(pedir({ accion: "calcular", desde: "2026-10-10", hasta: "2026-10-11" }));
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.accion, "calcular");
  assert.equal(d.total, 3);
  assert.equal(d.desde, "2026-10-10T05:00:00.000Z");
  assert.equal(d.hasta, "2026-10-12T05:00:00.000Z");
  assert.deepEqual(d.temas.slice(0, 2).map((t) => [t.tema, t.total, t.porcentaje]), [["Basura y aseo", 2, 67], ["Agua potable y cortes", 1, 33]]);
  assert.equal(d.temas.reduce((a, t) => a + t.porcentaje, 0), 100);
  assert.equal(sb.estado.informes.length, 0);
  assert.equal(sb.de("informe_publico").length, 0);
});

test("publicar: guarda el informe como 'manual' con lo que contó el servidor y la web lo muestra enseguida", async () => {
  montar({ opiniones: BORDES });
  const r = await handler(pedir({ accion: "publicar", desde: "2026-10-10", hasta: "2026-10-11" }));
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.publicado, true);
  assert.equal(d.total, 3);
  assert.equal(sb.estado.informes.length, 1);
  const fila = sb.estado.informes[0];
  assert.equal(fila.origen, "manual");
  assert.equal(fila.periodo_desde, "2026-10-10T05:00:00.000Z");
  assert.equal(fila.periodo_hasta, "2026-10-12T05:00:00.000Z");
  assert.equal(fila.total, 3);
  // …y /api/informe ya lo muestra, marcado como manual.
  const publico = await (await informe(new Request(SITIO + "/api/informe"))).json();
  assert.equal(publico.modo, "informe");
  assert.equal(publico.origen, "manual");
  assert.equal(publico.total, 3);
});

test("si 'hasta' es hoy el corte es ahora", async () => {
  montar({ opiniones: [] });
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const d = await (await handler(pedir({ accion: "calcular", desde: hoy, hasta: hoy }))).json();
  assert.equal(d.ok, true);
  assert.ok(Math.abs(Date.parse(d.hasta) - Date.now()) < 60_000);
});

test("publicar un periodo sin opiniones no crea un informe vacío (400), pero calcular sí avisa total 0", async () => {
  montar({ opiniones: BORDES });
  const p = await handler(pedir({ accion: "publicar", desde: "2026-10-20", hasta: "2026-10-21" }));
  assert.equal(p.status, 400);
  assert.match((await p.json()).error, /no hay opiniones/i);
  assert.equal(sb.estado.informes.length, 0);
  const c = await (await handler(pedir({ accion: "calcular", desde: "2026-10-20", hasta: "2026-10-21" }))).json();
  assert.equal(c.ok, true);
  assert.equal(c.total, 0);
});

test("la verificación de admin usa la sesión de quien llama: rpc is_admin con su token y la anon key", async () => {
  montar({ opiniones: BORDES });
  await handler(pedir({ accion: "calcular", desde: "2026-10-10", hasta: "2026-10-11" }));
  const v = sb.de("rpc/is_admin");
  assert.equal(v.length, 1);
  assert.equal(v[0].init.headers.Authorization, `Bearer ${ADMIN}`);
  assert.equal(v[0].init.headers.apikey, "clave-anon");
  // …y las cuentas se hacen con la service role, no con la sesión.
  assert.ok(sb.de("submissions").every((l) => l.init.headers.apikey === "clave-servicio"));
});

test("sin sesión, con sesión inválida o de alguien que no es admin: no se cuenta ni se guarda nada", async () => {
  montar({ opiniones: BORDES });
  const cuerpo = { accion: "publicar", desde: "2026-10-10", hasta: "2026-10-11" };
  assert.equal((await handler(pedir(cuerpo, { token: null }))).status, 401);
  assert.equal((await handler(pedir(cuerpo, { token: "token-roto" }))).status, 401);
  assert.equal((await handler(pedir(cuerpo, { token: VECINO }))).status, 403);
  assert.equal(sb.de("submissions").length, 0);
  assert.equal(sb.estado.informes.length, 0);
  // la clave anónima de la web tampoco sirve como sesión
  assert.ok([401, 403].includes((await handler(pedir(cuerpo, { token: "clave-anon" }))).status));
});

test("solo desde este mismo sitio: otro origen, o sin origen ni Sec-Fetch-Site, responde 403 sin tocar la base", async () => {
  montar({ opiniones: BORDES });
  const cuerpo = { accion: "calcular", desde: "2026-10-10", hasta: "2026-10-11" };
  assert.equal((await handler(pedir(cuerpo, { origen: "https://sitio-malo.example" }))).status, 403);
  assert.equal((await handler(pedir(cuerpo, { origen: null }))).status, 403);
  assert.equal((await handler(pedir(cuerpo, { origen: null, extra: { "sec-fetch-site": "same-origin" } }))).status, 200);
  assert.equal((await handler(pedir(cuerpo, { origen: null, extra: { "sec-fetch-site": "cross-site" } }))).status, 403);
  assert.equal(sb.de("rpc/is_admin").length, 1);
});

test("solo POST", async () => {
  montar();
  const r = await handler(pedir(null, { metodo: "GET" }));
  assert.equal(r.status, 405);
  assert.equal(r.headers.get("Allow"), "POST");
});

test("rechaza lo que no es exactamente {accion, desde, hasta}: otras claves (nadie manda cifras), acciones raras, JSON roto o gigante", async () => {
  montar({ opiniones: BORDES });
  const malos = [
    { accion: "publicar", desde: "2026-10-10", hasta: "2026-10-11", total: 999 },
    { accion: "publicar", desde: "2026-10-10", hasta: "2026-10-11", temas: [] },
    { accion: "borrar", desde: "2026-10-10", hasta: "2026-10-11" },
    { desde: "2026-10-10", hasta: "2026-10-11" },
    [], null, "texto", 5,
  ];
  for (const m of malos) assert.equal((await handler(pedir(m))).status, 400, JSON.stringify(m));
  assert.equal((await handler(pedir("{no es json"))).status, 400);
  assert.equal((await handler(pedir(JSON.stringify({ accion: "calcular", desde: "2026-10-10", hasta: "2026-10-11", x: "y".repeat(5000) })))).status, 400);
  assert.equal(sb.estado.informes.length, 0);
});

test("fechas malas: mensajes claros para el panel y nada se cuenta", async () => {
  montar({ opiniones: BORDES });
  const casos = [
    [{ desde: "10/10/2026", hasta: "2026-10-11" }, /desde/i],
    [{ desde: "2026-10-12", hasta: "2026-10-10" }, /posterior/i],
    [{ desde: "2026-10-10", hasta: "2999-01-01" }, /todavía no/i],
    [{ desde: "2026-01-01", hasta: "2026-10-11" }, /31 días/],
  ];
  for (const [fechas, msg] of casos) {
    const r = await handler(pedir({ accion: "calcular", ...fechas }));
    assert.equal(r.status, 400, JSON.stringify(fechas));
    assert.match((await r.json()).error, msg);
  }
  assert.equal(sb.de("submissions").length, 0);
});

test("si falta la migración 0007 al publicar, lo dice claro; si la base falla, error genérico sin detalles", async () => {
  montar({ sinTabla: true, opiniones: BORDES });
  const r = await handler(pedir({ accion: "publicar", desde: "2026-10-10", hasta: "2026-10-11" }));
  assert.equal(r.status, 500);
  assert.match((await r.json()).error, /0007/);

  montar({ opiniones: BORDES });
  sb.estado.falla = (ruta) => ruta === "submissions";
  const f = await handler(pedir({ accion: "calcular", desde: "2026-10-10", hasta: "2026-10-11" }));
  assert.equal(f.status, 500);
  const txt = await f.text();
  assert.deepEqual(JSON.parse(txt), { ok: false, error: "No se pudo calcular el informe." });
  assert.ok(!/boom|detalles/.test(txt));
});

test("si la base de datos no responde al verificar la sesión, no deja pasar a nadie (503)", async () => {
  montar({ opiniones: BORDES });
  sb.estado.falla = (ruta) => ruta === "rpc/is_admin";
  const r = await handler(pedir({ accion: "publicar", desde: "2026-10-10", hasta: "2026-10-11" }));
  assert.equal(r.status, 503);
  assert.equal(sb.estado.informes.length, 0);
});

test("sin la clave anónima o sin conexión configurada responde 503 sin tocar la red", async () => {
  montar({ opiniones: BORDES });
  delete process.env.SUPABASE_ANON_KEY;
  assert.equal((await handler(pedir({ accion: "calcular", desde: "2026-10-10", hasta: "2026-10-11" }))).status, 503);
  process.env.SUPABASE_ANON_KEY = "clave-anon"; delete process.env.SUPABASE_URL;
  assert.equal((await handler(pedir({ accion: "calcular", desde: "2026-10-10", hasta: "2026-10-11" }))).status, 503);
  assert.equal(sb.estado.llamadas.length, 0);
});

test("nunca se guarda en caché y la respuesta solo lleva conteos y fechas", async () => {
  montar({ opiniones: BORDES });
  const r = await handler(pedir({ accion: "calcular", desde: "2026-10-10", hasta: "2026-10-11" }));
  assert.equal(r.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(Object.keys(await r.json()).sort(), ["accion", "desde", "hasta", "ok", "temas", "total"]);
});
