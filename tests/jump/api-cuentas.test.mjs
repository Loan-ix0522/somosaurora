// API de cuentas (/api/jump-admin) y de cambio de clave (/api/jump-clave), contra el Supabase simulado.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { iniciarSim } from "./sim/servidor.mjs";
import { crearEscenario } from "./sim/escenario.mjs";

let sim, X;
before(async () => { sim = await iniciarSim(); X = await crearEscenario(sim.db); });
after(() => sim.cerrar());

const verificador = (nueve) => {
  const s = [...nueve].reduce((a, d, i) => { let p = +d * (i % 2 ? 1 : 2); if (p > 9) p -= 9; return a + p; }, 0);
  return String((10 - (s % 10)) % 10);
};
const cedula = (nueve) => nueve + verificador(nueve);

async function token(email, clave = "clave-prueba-1") {
  const r = await fetch(sim.url + "/supa/auth/v1/token?grant_type=password", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: clave }) });
  return { status: r.status, ...(await r.json()) };
}
const tok = async (p) => (await token(p.email)).access_token;
async function api(ruta, cuerpo, jwt, origin) {
  const headers = { "Content-Type": "application/json", Origin: origin ?? sim.url };
  if (jwt) headers.Authorization = "Bearer " + jwt;
  const r = await fetch(sim.url + ruta, { method: "POST", headers, body: JSON.stringify(cuerpo) });
  return { status: r.status, ...(await r.json()) };
}
const admin = (accion, cuerpo, jwt, origin) => api("/api/jump-admin", { accion, ...cuerpo }, jwt, origin);
const rest = async (ruta, jwt) => (await fetch(sim.url + "/supa/rest/v1/" + ruta, { headers: { apikey: "anon", Authorization: "Bearer " + jwt } })).json();
const fila = async (sql, p) => (await sim.db.query(sql, p)).rows[0];

test("sin token 401, emprendedor 403, admin suspendido 403, otro origen 403", async () => {
  const cuerpo = { rol: "emprendedor", cedula: cedula("170000001"), nombres: "Lucía Pincay", negocio: "Ceviches" };
  assert.equal((await admin("crear-cuenta", cuerpo)).status, 401);
  assert.equal((await admin("crear-cuenta", cuerpo, await tok(X.E))).status, 403);
  const jwtA = await tok(X.A);
  assert.equal((await admin("crear-cuenta", cuerpo, jwtA, "https://malo.com")).status, 403);
  assert.equal((await admin("crear-cuenta", cuerpo, jwtA, "")).status, 403);
  await sim.db.query("update jump_miembros set estado = 'suspendida' where user_id = $1", [X.A.id]);
  try { assert.equal((await admin("crear-cuenta", cuerpo, jwtA)).status, 403); }
  finally { await sim.db.query("update jump_miembros set estado = 'activa' where user_id = $1", [X.A.id]); }
  assert.equal((await fila("select count(*)::int n from jump_miembros where cedula = $1", [cuerpo.cedula])).n, 0);
});

test("acción desconocida → 400", async () => {
  const r = await admin("borrar-todo", {}, await tok(X.A));
  assert.equal(r.status, 400);
  assert.equal(r.error, "Acción no válida.");
});

test("A crea una emprendedora y ella entra con su clave temporal", async () => {
  const ced = cedula("170000002");
  const r = await admin("crear-cuenta", { rol: "emprendedor", cedula: ced.slice(0, 3) + " " + ced.slice(3), nombres: "  Lucía   Pincay ",
    negocio: "Ceviches Lucía", whatsapp: "+593 99 123 4567" }, await tok(X.A));
  assert.equal(r.status, 201);
  assert.match(r.clave, /^JUMP-\d{4}-\d{4}$/);
  const m = await fila("select * from jump_miembros where user_id = $1", [r.userId]);
  assert.equal(m.cedula, ced);
  assert.equal(m.nombres, "Lucía Pincay");
  assert.equal(m.whatsapp, "0991234567");
  assert.equal(m.debe_cambiar_clave, true);
  assert.ok(new Date(m.clave_temporal_vence) > new Date(Date.now() + 6.9 * 864e5));
  assert.equal(m.creado_por, X.A.id);
  const t = await token(`c${ced}@cuentas.laauroraescucha.com`, r.clave);
  assert.equal(t.status, 200);
  const yo = await (await fetch(sim.url + "/supa/rest/v1/rpc/jump_yo", { method: "POST",
    headers: { apikey: "anon", Authorization: "Bearer " + t.access_token, "Content-Type": "application/json" }, body: "{}" })).json();
  assert.equal(yo[0].debe_cambiar_clave, true);
  assert.equal((await fila("select count(*)::int n from jump_bitacora where accion = 'crear-cuenta' and objetivo = $1", [r.userId])).n, 1);
});

test("la misma cédula otra vez → 409 sin usuario huérfano", async () => {
  const ced = cedula("170000003");
  const jwt = await tok(X.A);
  assert.equal((await admin("crear-cuenta", { rol: "emprendedor", cedula: ced, nombres: "Pedro Ruiz", negocio: "Taller" }, jwt)).status, 201);
  const r = await admin("crear-cuenta", { rol: "emprendedor", cedula: ced, nombres: "Otro Nombre", negocio: "Otro" }, jwt);
  assert.equal(r.status, 409);
  assert.equal(r.error, "Ya existe una cuenta con esa cédula.");
  assert.equal((await fila("select count(*)::int n from auth.users where email = $1", [`c${ced}@cuentas.laauroraescucha.com`])).n, 1);
});

test("si Auth ya tiene el correo (huérfano) → 409 y no se toca", async () => {
  const ced = cedula("170000004");
  await sim.crearUsuario({ email: `c${ced}@cuentas.laauroraescucha.com`, password: "x" });
  const r = await admin("crear-cuenta", { rol: "emprendedor", cedula: ced, nombres: "Ana Ruiz", negocio: "Taller" }, await tok(X.A));
  assert.equal(r.status, 409);
});

test("validaciones con campo", async () => {
  const jwt = await tok(X.A);
  const base = { rol: "emprendedor", cedula: cedula("170000005"), nombres: "Lucía Pincay", negocio: "Ceviches" };
  assert.equal((await admin("crear-cuenta", { ...base, cedula: "0912345678" }, jwt)).campo, "cedula");
  assert.equal((await admin("crear-cuenta", { ...base, nombres: "L" }, jwt)).campo, "nombres");
  assert.equal((await admin("crear-cuenta", { ...base, negocio: "" }, jwt)).campo, "negocio");
  assert.equal((await admin("crear-cuenta", { ...base, whatsapp: "12345" }, jwt)).campo, "whatsapp");
  assert.equal((await admin("crear-cuenta", { ...base, rol: "jefe" }, jwt)).campo, "rol");
  assert.equal((await admin("crear-cuenta", { rol: "admin", usuario: "Ana Admin", nombres: "Ana" + " Ruiz" }, jwt)).campo, "usuario");
});

test("A crea a otra persona del equipo con usuario", async () => {
  const r = await admin("crear-cuenta", { rol: "admin", usuario: "Pedro.Equipo", nombres: "Pedro Equipo" }, await tok(X.A));
  assert.equal(r.status, 201);
  const m = await fila("select rol, usuario from jump_miembros where user_id = $1", [r.userId]);
  assert.deepEqual(m, { rol: "admin", usuario: "pedro.equipo" });
  assert.equal((await token("pedro.equipo@equipo.laauroraescucha.com", r.clave)).status, 200);
  const dup = await admin("crear-cuenta", { rol: "admin", usuario: "pedro.equipo", nombres: "Otro" + " Pedro" }, await tok(X.A));
  assert.equal(dup.error, "Ya existe una cuenta con ese usuario.");
});

test("A no puede suspenderse a sí mismo", async () => {
  const r = await admin("suspender", { userId: X.A.id, motivo: "prueba" }, await tok(X.A));
  assert.equal(r.status, 400);
  assert.equal(r.error, "No puedes suspender tu propia cuenta.");
});

test("no deja el equipo sin nadie activo (carrera entre dos admins que se suspenden)", async () => {
  // Por la API es inalcanzable (quien llama es admin activo); se prueba la guarda llamando al módulo
  // como lo haría una segunda petición concurrente cuyo autor ya quedó suspendido.
  const { cuentas } = await import("../../api/_jump/cuentas.js");
  const r = await cuentas.suspender({ userId: X.E2.id }, { userId: X.A.id, motivo: "x" });
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "Debe quedar al menos una persona del equipo activa.");
  assert.equal((await fila("select estado from jump_miembros where user_id = $1", [X.A.id])).estado, "activa");
});

test("ids inválidos → 400 (nunca llegan a la ruta de Auth)", async () => {
  const jwt = await tok(X.A);
  for (const accion of ["suspender", "reactivar", "clave-nueva"])
    assert.equal((await admin(accion, { userId: "../../users" }, jwt)).status, 400, accion);
  assert.equal((await admin("clave-nueva", { userId: "6f1c2a8e-1b2c-4d3e-8f90-1234567890ab" }, jwt)).status, 404);
});

test("suspender E: no entra y su token viejo ya no ve nada; reactivar lo revierte", async () => {
  const viejo = await tok(X.E2);
  const jwtA = await tok(X.A);
  assert.equal((await admin("suspender", { userId: X.E2.id, motivo: "Publicó algo fuera de lugar" }, jwtA)).status, 200);
  assert.equal((await token(X.E2.email)).error_code, "user_banned");
  assert.deepEqual(await rest("jump_mentorias?select=id", viejo), []);
  const esMiembro = await (await fetch(sim.url + "/supa/rest/v1/rpc/jump_es_miembro", { method: "POST",
    headers: { apikey: "anon", Authorization: "Bearer " + viejo, "Content-Type": "application/json" }, body: "{}" })).json();
  assert.equal(esMiembro, false);
  assert.equal((await fila("select estado, motivo_suspension from jump_miembros where user_id = $1", [X.E2.id])).motivo_suspension, "Publicó algo fuera de lugar");
  assert.equal((await admin("reactivar", { userId: X.E2.id }, jwtA)).status, 200);
  assert.equal((await token(X.E2.email)).status, 200);
  assert.equal((await rest("jump_mentorias?select=id", viejo)).length, 1);
});

test("clave nueva: el token viejo ya no ve contenido y la nueva clave temporal sirve", async () => {
  const viejo = await tok(X.E);
  const r = await admin("clave-nueva", { userId: X.E.id }, await tok(X.A));
  assert.match(r.clave, /^JUMP-\d{4}-\d{4}$/);
  assert.deepEqual(await rest("jump_mentorias?select=id", viejo), []);
  assert.equal((await token(X.E.email, r.clave)).status, 200);
  assert.equal((await token(X.E.email)).status, 400, "la clave anterior ya no sirve");
  X.E.clave = r.clave;
});

test("jump-clave en el primer ingreso: privacidad, vencimiento y cambio", async () => {
  const jwt = (await token(X.E.email, X.E.clave)).access_token;
  const sinPriv = await api("/api/jump-clave", { nueva: "dulces2026" }, jwt);
  assert.equal(sinPriv.status, 400);
  assert.equal(sinPriv.campo, "privacidad");
  const corta = await api("/api/jump-clave", { nueva: "abc", aceptaPrivacidad: true, versionPrivacidad: "2026-10-19" }, jwt);
  assert.equal(corta.campo, "nueva");
  await sim.db.query("update jump_miembros set clave_temporal_vence = now() - interval '1 day' where user_id = $1", [X.E.id]);
  const vencida = await api("/api/jump-clave", { nueva: "dulces2026", aceptaPrivacidad: true, versionPrivacidad: "2026-10-19" }, jwt);
  assert.equal(vencida.status, 403);
  assert.equal(vencida.error, "Tu clave temporal venció. Pídele una nueva al equipo de JUMP.");
  await sim.db.query("update jump_miembros set clave_temporal_vence = now() + interval '1 day' where user_id = $1", [X.E.id]);
  const ok = await api("/api/jump-clave", { nueva: "dulces2026", aceptaPrivacidad: true, versionPrivacidad: "2026-10-19" }, jwt);
  assert.equal(ok.status, 200);
  const m = await fila("select debe_cambiar_clave, clave_temporal_vence, privacidad_version, privacidad_aceptada_en from jump_miembros where user_id = $1", [X.E.id]);
  assert.equal(m.debe_cambiar_clave, false);
  assert.equal(m.clave_temporal_vence, null);
  assert.equal(m.privacidad_version, "2026-10-19");
  assert.ok(m.privacidad_aceptada_en);
  assert.equal((await token(X.E.email, "dulces2026")).status, 200);
});

test("jump-clave desde el perfil exige la clave actual", async () => {
  const jwt = (await token(X.E.email, "dulces2026")).access_token;
  const mala = await api("/api/jump-clave", { actual: "otra", nueva: "nueva2026x" }, jwt);
  assert.equal(mala.status, 400);
  assert.equal(mala.campo, "actual");
  const ok = await api("/api/jump-clave", { actual: "dulces2026", nueva: "nueva2026x" }, jwt);
  assert.equal(ok.status, 200);
  assert.equal((await token(X.E.email, "nueva2026x")).status, 200);
});

test("jump-clave: sin token 401, suspendida 403, sin cuenta JUMP 403, otro origen 403", async () => {
  assert.equal((await api("/api/jump-clave", { nueva: "x" })).status, 401);
  const jwtS = (await token(X.S.email)).access_token; // S no está baneada en Auth en este escenario, solo suspendida
  assert.equal((await api("/api/jump-clave", { actual: "clave-prueba-1", nueva: "otra2026x" }, jwtS)).status, 403);
  const jwtU = (await token(X.U.email, "x")).access_token;
  assert.equal((await api("/api/jump-clave", { actual: "x", nueva: "otra2026x" }, jwtU)).status, 403);
  const jwtE2 = await tok(X.E2);
  assert.equal((await api("/api/jump-clave", { actual: "clave-prueba-1", nueva: "otra2026x" }, jwtE2, "https://malo.com")).status, 403);
});

test("si el insert en jump_miembros falla, se borra el usuario de Auth (compensación) y responde 500", async () => {
  await sim.db.query(`create or replace function public.falla_forzada() returns trigger language plpgsql as $f$
    begin if new.nombres = 'Falla Forzada' then raise exception 'falla forzada'; end if; return new; end $f$`);
  await sim.db.query("create trigger falla_forzada before insert on public.jump_miembros for each row execute function public.falla_forzada()");
  try {
    const ced = cedula("170000006");
    const r = await admin("crear-cuenta", { rol: "emprendedor", cedula: ced, nombres: "Falla Forzada", negocio: "X" }, await tok(X.A));
    assert.equal(r.status, 500);
    assert.equal(r.error, "No se pudo completar. Intenta de nuevo.");
    assert.equal((await fila("select count(*)::int n from auth.users where email = $1", [`c${ced}@cuentas.laauroraescucha.com`])).n, 0);
  } finally {
    await sim.db.query("drop trigger falla_forzada on public.jump_miembros");
  }
});
