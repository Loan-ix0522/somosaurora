// Datos de ejemplo: cargar, contar lo real que cuelga de ellos y borrarlos sin tocar lo real.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { iniciarSim } from "./sim/servidor.mjs";
import { crearEscenario } from "./sim/escenario.mjs";
import { cedulaValida } from "../../jump/comunidad/js/cedula.js";

let sim, X, jwtA, jwtE;
before(async () => {
  sim = await iniciarSim();
  X = await crearEscenario(sim.db);
  jwtA = await tok(X.A);
  jwtE = await tok(X.E);
});
after(() => sim.cerrar());

async function tok(p) {
  const r = await fetch(sim.url + "/supa/auth/v1/token?grant_type=password", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: p.email, password: "clave-prueba-1" }) });
  return (await r.json()).access_token;
}
async function admin(accion, cuerpo = {}, jwt = jwtA) {
  const r = await fetch(sim.url + "/api/jump-admin", { method: "POST",
    headers: { "Content-Type": "application/json", Origin: sim.url, Authorization: "Bearer " + jwt }, body: JSON.stringify({ accion, ...cuerpo }) });
  return { status: r.status, ...(await r.json()) };
}
const rest = async (ruta, jwt, init = {}) => {
  const r = await fetch(sim.url + "/supa/rest/v1/" + ruta, { ...init,
    headers: { apikey: "anon", Authorization: "Bearer " + jwt, "Content-Type": "application/json", ...(init.headers || {}) } });
  const t = await r.text();
  return { status: r.status, datos: t ? JSON.parse(t) : null };
};
const n = async (sql, p) => (await sim.db.query(sql, p)).rows[0].n;

test("un emprendedor no puede cargar ni borrar ejemplos", async () => {
  assert.equal((await admin("ejemplos-cargar", {}, jwtE)).status, 403);
  assert.equal((await admin("ejemplos-borrar", { confirmacion: "BORRAR" }, jwtE)).status, 403);
});

test("contar antes de cargar → cargados:false", async () => {
  const r = await admin("ejemplos-contar");
  assert.equal(r.status, 200);
  assert.equal(r.cargados, false);
  assert.deepEqual(r.reales, { comentarios: 0, publicaciones: 0, progreso: 0 });
});

test("cargar crea el contenido del mockup; cargar otra vez → 409", async () => {
  const r = await admin("ejemplos-cargar");
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(await n("select count(*)::int n from jump_mentorias where es_ejemplo"), 6);
  assert.equal(await n("select count(*)::int n from jump_mentorias where es_ejemplo and estado = 'publicada'"), 5);
  assert.equal(await n("select count(*)::int n from jump_miembros where es_ejemplo"), 12);
  assert.equal(await n("select count(*)::int n from jump_miembros where es_ejemplo and estado = 'suspendida'"), 2);
  assert.equal(await n("select count(*)::int n from jump_clases where es_ejemplo"), 5);
  assert.equal(await n("select count(*)::int n from jump_clases where es_ejemplo and inicia_en < now()"), 2);
  assert.equal(await n("select count(*)::int n from jump_clases where es_ejemplo and grabacion_url is not null"), 0);
  assert.equal(await n("select count(*)::int n from jump_avisos where es_ejemplo"), 3);
  assert.equal(await n("select count(*)::int n from jump_posts where es_ejemplo"), 4);
  assert.equal(await n("select count(*)::int n from jump_comentarios where es_ejemplo"), 6);
  assert.equal(await n("select count(*)::int n from jump_modulos where es_ejemplo and video_url is not null"), 0);
  assert.equal(await n("select count(*)::int n from jump_materiales where es_ejemplo and tipo <> 'enlace'"), 0);
  assert.ok(await n("select count(*)::int n from jump_progreso p join jump_miembros m using (user_id) where m.es_ejemplo") > 50);
  assert.ok(await n("select count(*)::int n from jump_asistencia a join jump_clases c on c.id = a.clase_id where c.es_ejemplo") > 5);
  assert.equal(await n("select count(*)::int n from jump_posts where es_ejemplo and texto not like '(ejemplo)%'"), 0);
  assert.equal(await n("select count(*)::int n from jump_comentarios where es_ejemplo and texto not like '(ejemplo)%'"), 0);
  // Las clases van a las 19:00 de Guayaquil.
  assert.equal(await n("select count(*)::int n from jump_clases where es_ejemplo and to_char(inicia_en at time zone 'America/Guayaquil', 'HH24:MI') <> '19:00'"), 0);
  const otra = await admin("ejemplos-cargar");
  assert.equal(otra.status, 409);
  assert.equal(otra.error, "Los datos de ejemplo ya están cargados.");
  assert.equal(await n("select count(*)::int n from jump_miembros where es_ejemplo"), 12);
});

test("las cédulas de ejemplo son válidas, empiezan con 30 y nadie las ve como clave", async () => {
  const { rows } = await sim.db.query("select m.cedula, u.email from jump_miembros m join auth.users u on u.id = m.user_id where m.es_ejemplo");
  assert.equal(rows.length, 12);
  for (const { cedula, email } of rows) {
    assert.ok(cedulaValida(cedula), cedula);
    assert.ok(cedula.startsWith("30"), cedula);
    assert.equal(email, `c${cedula}@cuentas.laauroraescucha.com`);
  }
  const { rows: claves } = await sim.db.query("select encrypted_password p from auth.users u join jump_miembros m on m.user_id = u.id where m.es_ejemplo");
  assert.ok(claves.every((c) => c.p.length >= 24 && !/^JUMP-/.test(c.p)), "clave larga aleatoria, no una temporal");
});

test("E (real) ve las 5 mentorías publicadas de ejemplo y el muro de ejemplo; no ve el borrador", async () => {
  const m = await rest("jump_mentorias?select=id,titulo,es_ejemplo,estado", jwtE);
  assert.equal(m.datos.filter((x) => x.es_ejemplo).length, 5);
  assert.ok(m.datos.every((x) => x.estado === "publicada"));
  const p = await rest("jump_posts?select=id,es_ejemplo", jwtE);
  assert.equal(p.datos.filter((x) => x.es_ejemplo).length, 4);
});

test("E comenta en una publicación de ejemplo y marca un módulo de ejemplo → contar lo reporta", async () => {
  const post = (await sim.db.query("select id from jump_posts where es_ejemplo limit 1")).rows[0].id;
  const c = await rest("jump_comentarios", jwtE, { method: "POST", body: JSON.stringify({ post_id: post, texto: "Comentario real" }), headers: { Prefer: "return=minimal" } });
  assert.equal(c.status, 201);
  const mod = (await sim.db.query("select mo.id from jump_modulos mo join jump_mentorias me on me.id = mo.mentoria_id where mo.es_ejemplo and me.estado = 'publicada' limit 1")).rows[0].id;
  assert.equal((await rest("jump_progreso", jwtE, { method: "POST", body: JSON.stringify({ modulo_id: mod }), headers: { Prefer: "return=minimal" } })).status, 201);
  const r = await admin("ejemplos-contar");
  assert.equal(r.cargados, true);
  assert.deepEqual(r.reales, { comentarios: 1, publicaciones: 0, progreso: 1 });
});

test("borrar exige escribir BORRAR; con BORRAR no queda nada de ejemplo y lo real sigue", async () => {
  const sin = await admin("ejemplos-borrar", { confirmacion: "borrar todo" });
  assert.equal(sin.status, 400);
  assert.equal(await n("select count(*)::int n from jump_mentorias where es_ejemplo"), 6);
  const r = await admin("ejemplos-borrar", { confirmacion: "BORRAR" });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.borrados.mentorias, 6);
  assert.equal(r.borrados.miembros, 12);
  for (const t of ["jump_mentorias", "jump_modulos", "jump_materiales", "jump_clases", "jump_avisos", "jump_posts", "jump_comentarios", "jump_miembros"])
    assert.equal(await n(`select count(*)::int n from ${t} where es_ejemplo`), 0, t);
  assert.equal(await n("select count(*)::int n from auth.users where email like 'c30%@cuentas.laauroraescucha.com'"), 0);
  assert.equal(await n("select count(*)::int n from jump_miembros where user_id = any($1::uuid[])", [[X.A.id, X.E.id]]), 2);
  assert.equal(await n("select count(*)::int n from jump_mentorias where id = $1", [X.P]), 1);
  assert.equal(await n("select count(*)::int n from jump_bitacora where accion in ('ejemplos-cargar', 'ejemplos-borrar')"), 2);
  assert.equal((await admin("ejemplos-contar")).cargados, false);
  // Se pueden volver a cargar.
  assert.equal((await admin("ejemplos-cargar")).status, 200);
});
