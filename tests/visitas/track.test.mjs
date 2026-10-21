// /api/track: registra la visita llamando a registrar_visita con la service role. Siempre responde 204.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import handler from "../../api/track.js";

const SITIO = "https://www.laauroraescucha.com";
const MOVIL = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
let llamadas, fetchOriginal, envOriginal;

beforeEach(() => {
  llamadas = [];
  fetchOriginal = globalThis.fetch;
  envOriginal = { ...process.env };
  process.env.SUPABASE_URL = "https://ejemplo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-servicio";
  globalThis.fetch = async (url, init) => { llamadas.push({ url: String(url), init }); return new Response("true", { status: 200 }); };
});
afterEach(() => { globalThis.fetch = fetchOriginal; process.env = envOriginal; });

function pedir(cuerpo, { origin = SITIO, ua = MOVIL, pais = "EC", ip = "186.4.20.7, 10.0.0.1", ciudad = "Daule", metodo = "POST", extra = {} } = {}) {
  const headers = { "content-type": "application/json", ...extra };
  if (ip) headers["x-forwarded-for"] = ip;
  if (ciudad) headers["x-vercel-ip-city"] = ciudad;
  if (origin) headers.origin = origin;
  if (ua) headers["user-agent"] = ua;
  if (pais) headers["x-vercel-ip-country"] = pais;
  return new Request(SITIO + "/api/track", { method: metodo, headers, body: metodo === "POST" ? (typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)) : undefined });
}

test("registra la visita con la service role y responde 204", async () => {
  const r = await handler(pedir({ path: "/?utm=x#reportar", vid: "abc-123", ref: "https://www.google.com/search?q=aurora" }));
  assert.equal(r.status, 204);
  assert.equal(llamadas.length, 1);
  const { url, init } = llamadas[0];
  assert.equal(url, "https://ejemplo.supabase.co/rest/v1/rpc/registrar_visita");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.apikey, "clave-servicio");
  assert.equal(init.headers.Authorization, "Bearer clave-servicio");
  assert.deepEqual(JSON.parse(init.body), { p_ruta: "/", p_visitante: "abc-123", p_pais: "EC", p_dispositivo: "movil", p_procedencia: "www.google.com", p_ip: "186.4.20.7", p_ciudad: "Daule" });
});

test("acepta los nombres de variables que quedaron puestos en Vercel", async () => {
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.ProjectURL = "https://otro.supabase.co"; process.env.service_role = "otra-clave";
  await handler(pedir({ path: "/terminos.html", vid: "v1", ref: "" }, { ua: PC, pais: null, ip: null, ciudad: null, extra: { "x-real-ip": "2800:bf0:1::7" } }));
  assert.equal(llamadas[0].url, "https://otro.supabase.co/rest/v1/rpc/registrar_visita");
  assert.deepEqual(JSON.parse(llamadas[0].init.body), { p_ruta: "/terminos.html", p_visitante: "v1", p_pais: null, p_dispositivo: "escritorio", p_procedencia: null, p_ip: "2800:bf0:1::7", p_ciudad: null });
});

test("datos raros: /index.html cuenta como portada, el código inválido y la navegación interna quedan vacíos", async () => {
  await handler(pedir({ path: "/index.html", vid: "no vale!", ref: SITIO + "/terminos.html" }, { ua: "Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 Chrome/130.0 Safari/537.36", ip: "basura", ciudad: "Samborond%C3%B3n" }));
  assert.deepEqual(JSON.parse(llamadas[0].init.body), { p_ruta: "/", p_visitante: null, p_pais: "EC", p_dispositivo: "tablet", p_procedencia: null, p_ip: null, p_ciudad: "Samborondón" });
  await handler(pedir({ path: "/" }, { ciudad: "%E0%A4%A" })); // ciudad mal codificada
  assert.equal(JSON.parse(llamadas[1].init.body).p_ciudad, null);
});

test("no registra: otro sitio, el panel, bots, rutas inválidas, cuerpos raros o grandes, sin configuración", async () => {
  const casos = [
    ["otro sitio", pedir({ path: "/" }, { origin: "https://malo.com" })],
    ["sin origen", pedir({ path: "/" }, { origin: null })],
    ["panel", pedir({ path: "/admin/" })],
    ["panel sin barra", pedir({ path: "/admin" })],
    ["bot", pedir({ path: "/" }, { ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" })],
    ["sin navegador", pedir({ path: "/" }, { ua: null })],
    ["ruta relativa", pedir({ path: "terminos.html" })],
    ["ruta de otro tipo", pedir({ path: 42 })],
    ["claves de más", pedir({ path: "/", vid: "v", ref: "", extra: 1 })],
    ["no es JSON", pedir("hola")],
    ["lista", pedir("[1,2]")],
    ["grande", pedir({ path: "/", ref: "https://x.com/" + "a".repeat(3000) })],
  ];
  for (const [nombre, req] of casos) {
    const r = await handler(req);
    assert.equal(r.status, 204, nombre);
  }
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.equal((await handler(pedir({ path: "/" }))).status, 204);
  assert.equal(llamadas.length, 0, llamadas.map((l) => l.init.body).join(" | "));
});

test("misma página pedida sin Origin pero marcada same-origin por el navegador sí cuenta", async () => {
  await handler(pedir({ path: "/" }, { origin: null, extra: { "sec-fetch-site": "same-origin" } }));
  assert.equal(llamadas.length, 1);
});

test("si Supabase falla, igual responde 204; GET responde 405", async () => {
  globalThis.fetch = async () => { throw new Error("caído"); };
  assert.equal((await handler(pedir({ path: "/" }))).status, 204);
  const g = await handler(pedir(null, { metodo: "GET" }));
  assert.equal(g.status, 405);
  assert.equal(g.headers.get("allow"), "POST");
});
