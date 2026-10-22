// JUMP vive en su propio proyecto de Supabase: no comparte base, llaves ni destinos del navegador con La Aurora Escucha.
// Si una variable de JUMP falta, JUMP se niega a funcionar; nunca cae en la base de La Aurora.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crearBase } from "./sim/db.mjs";

const AURORA_REF = "jdterctcniotbipgwcdv";
const JUMP_VARS = ["JUMP_SUPABASE_URL", "JUMP_SUPABASE_ANON_KEY", "JUMP_SUPABASE_SERVICE_ROLE_KEY"];
const AURORA_VARS = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ProjectURL", "anonpublic", "service_role"];
const raiz = (ruta) => new URL("../../" + ruta, import.meta.url);

// Corre `fn` con exactamente estas variables (todas las de Supabase quedan sin definir salvo las dadas) y las restaura.
async function conEntorno(vars, fn) {
  const antes = Object.fromEntries([...JUMP_VARS, ...AURORA_VARS].map((k) => [k, process.env[k]]));
  for (const k of Object.keys(antes)) delete process.env[k];
  Object.assign(process.env, vars);
  try { return await fn(); }
  finally { for (const [k, v] of Object.entries(antes)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

const AURORA = {
  SUPABASE_URL: `https://${AURORA_REF}.supabase.co`, SUPABASE_ANON_KEY: "aurora-anon", SUPABASE_SERVICE_ROLE_KEY: "aurora-service",
  ProjectURL: `https://${AURORA_REF}.supabase.co`, anonpublic: "aurora-anon", service_role: "aurora-service",
};
const JUMP = { JUMP_SUPABASE_URL: "https://jump-prueba.supabase.co/", JUMP_SUPABASE_ANON_KEY: "jump-anon", JUMP_SUPABASE_SERVICE_ROLE_KEY: "jump-service" };

test("la migración de JUMP corre sola, en una base de Supabase sin nada de La Aurora Escucha", async () => {
  const db = await crearBase();
  const existe = async (sql) => (await db.query(`select ${sql} r`)).rows[0].r;
  assert.notEqual(await existe("to_regclass('public.jump_miembros')"), null);
  assert.equal(await existe("to_regclass('public.submissions')"), null);
  assert.equal(await existe("to_regclass('public.admins')"), null);
  assert.equal(await existe("to_regprocedure('public.is_admin()')"), null);
});

test("las variables de JUMP son propias: las de La Aurora Escucha no se usan, ni como respaldo", async () => {
  const { supa } = await import("../../api/_jump/env.js");
  await conEntorno(AURORA, () => assert.deepEqual(supa(), { url: "", anon: "", service: "" }));
  await conEntorno({ ...AURORA, ...JUMP }, () => assert.deepEqual(supa(), { url: "https://jump-prueba.supabase.co", anon: "jump-anon", service: "jump-service" }));
});

test("sin las variables de JUMP, el servidor no llama a ninguna base", async () => {
  const { rest, authAdmin, authUsuario, claveCorrecta } = await import("../../api/_jump/supa.js");
  const fetchReal = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; return new Response("{}"); };
  try {
    await conEntorno(AURORA, async () => {
      assert.throws(() => rest("jump_miembros"), /JUMP_SUPABASE/);
      assert.throws(() => authAdmin("users"), /JUMP_SUPABASE/);
      await assert.rejects(authUsuario("un.jwt"), /JUMP_SUPABASE/);
      await assert.rejects(claveCorrecta("a@b.c", "x"), /JUMP_SUPABASE/);
    });
  } finally { globalThis.fetch = fetchReal; }
  assert.equal(llamadas, 0);
});

test("/api/jump-config entrega la URL y la llave pública de JUMP; nunca la service_role ni nada de La Aurora", async () => {
  const { default: handler } = await import("../../api/jump-config.js");
  await conEntorno({ ...AURORA, ...JUMP }, async () => {
    const r = await handler(new Request("https://x.test/api/jump-config"));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    const texto = await r.text();
    assert.deepEqual(JSON.parse(texto), { url: "https://jump-prueba.supabase.co", anonKey: "jump-anon" });
    assert.ok(!/service|aurora/i.test(texto));
  });
});

test("/api/jump-config sin configurar responde 503 y no entrega la base de La Aurora", async () => {
  const { default: handler } = await import("../../api/jump-config.js");
  await conEntorno(AURORA, async () => {
    const r = await handler(new Request("https://x.test/api/jump-config"));
    assert.equal(r.status, 503);
    const texto = await r.text();
    assert.ok(!texto.includes(AURORA_REF) && !texto.includes("aurora-anon"));
  });
});

test("la app de JUMP pide su configuración a /api/jump-config, nunca a /api/config (que es de La Aurora)", () => {
  const datos = readFileSync(raiz("jump/comunidad/js/datos.js"), "utf8");
  assert.match(datos, /fetch\("\/api\/jump-config"/);
  assert.doesNotMatch(datos, /\/api\/config\b/);
});

test("la CSP de /jump solo deja hablar con la base de JUMP, y la de La Aurora no cambia", () => {
  const cfg = JSON.parse(readFileSync(raiz("vercel.json"), "utf8"));
  const csp = (fuente) => cfg.headers.filter((h) => h.source === fuente).flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy").value;
  const hosts = (valor) => [...valor.matchAll(/https:\/\/[a-z0-9.-]+\.(?:supabase\.co|invalid)\b/g)].map((m) => m[0]);

  for (const fuente of ["/jump/(.*)", "/jump"]) {
    const valor = csp(fuente);
    assert.ok(!valor.includes(AURORA_REF), `${fuente} no debe nombrar la base de La Aurora`);
    const unicos = [...new Set(hosts(valor))];
    assert.equal(unicos.length, 1, `${fuente} nombra una sola base: ${unicos}`);
    assert.match(valor, new RegExp(`connect-src 'self' ${unicos[0].replace(/\./g, "\\.")}(;|$)`));
    assert.match(valor, new RegExp(`img-src [^;]*${unicos[0].replace(/\./g, "\\.")}`));
  }
  const hostJump = hosts(csp("/jump/(.*)"))[0];
  assert.match(csp("/admin/(.*)"), new RegExp(`connect-src 'self' https://${AURORA_REF}\\.supabase\\.co`));
  assert.ok(!csp("/admin/(.*)").includes(hostJump));
  const publica = cfg.headers.filter((h) => /^\/\(\(\?!admin/.test(h.source)).flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy").value;
  assert.ok(!publica.includes(hostJump) && !publica.includes(AURORA_REF));
});
