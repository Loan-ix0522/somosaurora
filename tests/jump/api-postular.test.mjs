// Formulario «Postula» de la página de JUMP (/jump/) → /api/jump-postular, contra el Supabase simulado.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { iniciarSim } from "./sim/servidor.mjs";

let sim;
before(async () => { sim = await iniciarSim(); });
after(() => sim.cerrar());

async function postular(cuerpo, { origin, ip = "203.0.113.7", metodo = "POST" } = {}) {
  const headers = { "Content-Type": "application/json", "X-Forwarded-For": ip };
  if (origin !== null) headers.Origin = origin ?? sim.url;
  const r = await fetch(sim.url + "/api/jump-postular", { method: metodo, headers, body: metodo === "GET" ? undefined : JSON.stringify(cuerpo) });
  return { status: r.status, ...(await r.json()) };
}
const valida = (extra = {}) => ({ nombres: "Rosa Mora", whatsapp: "099 123 4567", negocio: "Dulces Rosa", rubro: "Comida y bebidas",
  sector: "Villa Club, etapa Doral", ruc: "no", aurora: true, ...extra });
const filas = async (where) => (await sim.db.query(`select * from jump_postulaciones where ${where}`)).rows;

test("solo POST y solo desde este mismo sitio", async () => {
  assert.equal((await postular(null, { metodo: "GET" })).status, 405);
  assert.equal((await postular(valida({ whatsapp: "0990000101" }), { origin: "https://malo.com" })).status, 403);
  assert.equal((await postular(valida({ whatsapp: "0990000102" }), { origin: null })).status, 403);
  assert.equal((await filas("whatsapp in ('0990000101', '0990000102')")).length, 0);
});

test("una postulación válida se guarda normalizada y sin la IP cruda", async () => {
  const r = await postular(valida(), { ip: "198.51.100.23" });
  assert.equal(r.status, 201);
  assert.equal(r.ok, true);
  const [f] = await filas("whatsapp = '0991234567'");
  assert.equal(f.nombres, "Rosa Mora");
  assert.equal(f.negocio, "Dulces Rosa");
  assert.equal(f.rubro, "Comida y bebidas");
  assert.equal(f.sector, "Villa Club, etapa Doral");
  assert.equal(f.ruc, "no");
  assert.equal(f.estado, "nueva");
  assert.ok(f.ip_hash && f.ip_hash.length >= 20 && !f.ip_hash.includes("198.51.100.23"), f.ip_hash);
});

test("cada dato inválido responde 400 con su campo", async () => {
  const casos = [["nombres", { nombres: "R" }], ["whatsapp", { whatsapp: "12345" }], ["negocio", { negocio: " " }],
    ["rubro", { rubro: "Drogas" }], ["sector", { sector: "" }], ["ruc", { ruc: "quizas" }], ["aurora", { aurora: false }]];
  for (const [campo, extra] of casos) {
    const r = await postular(valida({ whatsapp: "0990000200", ...extra }));
    assert.equal(r.status, 400, campo);
    assert.equal(r.campo, campo);
    assert.ok(r.error && r.error.length > 5, campo);
  }
  assert.equal((await filas("whatsapp = '0990000200'")).length, 0);
  assert.equal((await postular("no es un objeto")).status, 400);
});

test("el campo trampa para robots responde ok pero no guarda nada", async () => {
  const r = await postular(valida({ whatsapp: "0990000300", sitio: "http://spam.example" }));
  assert.equal(r.status, 200);
  assert.equal(r.ok, true);
  assert.equal((await filas("whatsapp = '0990000300'")).length, 0);
});

test("el mismo WhatsApp otra vez no se duplica", async () => {
  assert.equal((await postular(valida({ whatsapp: "0990000400" }), { ip: "198.51.100.40" })).status, 201);
  const otra = await postular(valida({ whatsapp: "+593 99 000 0400", nombres: "Rosa M." }), { ip: "198.51.100.41" });
  assert.equal(otra.status, 200);
  assert.equal(otra.repetida, true);
  assert.equal((await filas("whatsapp = '0990000400'")).length, 1);
});

test("más de 5 postulaciones en un día desde la misma conexión → 429", async () => {
  for (let i = 0; i < 5; i++) assert.equal((await postular(valida({ whatsapp: `099000050${i}` }), { ip: "192.0.2.50" })).status, 201, `envío ${i + 1}`);
  const sexta = await postular(valida({ whatsapp: "0990000509" }), { ip: "192.0.2.50" });
  assert.equal(sexta.status, 429);
  assert.equal((await filas("whatsapp = '0990000509'")).length, 0);
  assert.equal((await postular(valida({ whatsapp: "0990000510" }), { ip: "192.0.2.51" })).status, 201, "otra conexión sí puede");
});

test("las opciones de «¿Qué vendes?» de la página son las que acepta la API", async () => {
  const { RUBROS } = await import("../../api/_jump/postulaciones.js");
  const html = readFileSync(new URL("../../jump/index.html", import.meta.url), "utf8");
  const ini = html.indexOf('<select id="f-rubro"');
  const select = html.slice(ini, html.indexOf("</select>", ini));
  const opciones = [...select.matchAll(/<option(?: value="([^"]*)")?>([^<]*)<\/option>/g)].map((m) => m[1] ?? m[2]).filter(Boolean);
  assert.deepEqual(opciones, RUBROS);
});
