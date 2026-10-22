// /api/purge también borra las IP de visitas con más de 30 días (borrar_ip_visitas de la 0006).
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import handler from "../../api/purge.js";

const SECRETO = "s".repeat(32);
let llamadas, fetchOriginal, envOriginal, respuestaIp;

beforeEach(() => {
  llamadas = [];
  respuestaIp = () => new Response("3", { status: 200 });
  fetchOriginal = globalThis.fetch;
  envOriginal = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: "https://ejemplo.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "clave-servicio", CRON_SECRET: SECRETO });
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    llamadas.push({ url: u, init });
    if (u.includes("/rpc/borrar_ip_visitas")) return respuestaIp();
    if (u.includes("/rest/v1/submissions")) return new Response("[]", { status: 200, headers: { "content-range": "*/0" } });
    return new Response(null, { status: 201 });
  };
});
afterEach(() => { globalThis.fetch = fetchOriginal; process.env = envOriginal; });

const pedir = (q = "") => new Request("https://www.laauroraescucha.com/api/purge" + q, { headers: { authorization: `Bearer ${SECRETO}` } });

test("la limpieza nocturna borra las IP viejas de las visitas y lo informa", async () => {
  const r = await handler(pedir());
  const cuerpo = await r.json();
  assert.equal(r.status, 200);
  assert.equal(cuerpo.ok, true);
  assert.equal(cuerpo.ips, 3);
  const rpc = llamadas.find((l) => l.url === "https://ejemplo.supabase.co/rest/v1/rpc/borrar_ip_visitas");
  assert.ok(rpc, "no llamó a borrar_ip_visitas");
  assert.equal(rpc.init.method, "POST");
  assert.equal(rpc.init.headers.apikey, "clave-servicio");
  assert.equal(rpc.init.headers.Authorization, "Bearer clave-servicio");
});

test("si la 0006 todavía no está aplicada, la limpieza de opiniones sigue bien", async () => {
  respuestaIp = () => new Response('{"code":"PGRST202"}', { status: 404 });
  const r = await handler(pedir());
  const cuerpo = await r.json();
  assert.equal(r.status, 200);
  assert.equal(cuerpo.ok, true);
  assert.equal(cuerpo.ips, null);
});

test("la prueba sin borrar (?dry=1) no toca las IP", async () => {
  const r = await handler(pedir("?dry=1"));
  assert.equal(r.status, 200);
  assert.equal(llamadas.some((l) => l.url.includes("borrar_ip_visitas")), false);
});
