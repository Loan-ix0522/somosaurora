// Zoom: conectar/cambiar/desconectar por OAuth, crear reuniones y desautorización, contra el Zoom falso del simulador.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { iniciarSim } from "./sim/servidor.mjs";
import { crearEscenario } from "./sim/escenario.mjs";

let sim, X, jwtA, sec;
before(async () => {
  sim = await iniciarSim();
  X = await crearEscenario(sim.db);
  jwtA = await tok(X.A);
  sec = await import("../../api/_jump/secretos.js");
});
after(() => sim.cerrar());

async function tok(p, clave = "clave-prueba-1") {
  const r = await fetch(sim.url + "/supa/auth/v1/token?grant_type=password", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: p.email, password: clave }) });
  return (await r.json()).access_token;
}
async function admin(accion, cuerpo = {}, jwt = jwtA) {
  const r = await fetch(sim.url + "/api/jump-admin", { method: "POST",
    headers: { "Content-Type": "application/json", Origin: sim.url, Authorization: "Bearer " + jwt }, body: JSON.stringify({ accion, ...cuerpo }) });
  return { status: r.status, headers: r.headers, ...(await r.json()) };
}
async function iniciar() {
  const r = await admin("zoom-iniciar");
  const url = new URL(r.url);
  return { r, url, state: url.searchParams.get("state"), cookie: (r.headers.get("set-cookie") || "").split(";")[0] };
}
const callback = (qs, cookie) => fetch(sim.url + "/api/jump-zoom-callback?" + new URLSearchParams(qs),
  { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
const destino = (estado) => `${sim.url}/jump/comunidad/#a/ajustes?zoom=${estado}`;
const filaZoom = async () => (await sim.db.query("select * from jump_zoom")).rows[0];
async function conectar() {
  const i = await iniciar();
  const r = await callback({ code: "codigo-" + Date.now(), state: i.state }, i.cookie);
  assert.equal(r.headers.get("location"), destino("ok"));
}
function firmado(cuerpo, { ts = Math.floor(Date.now() / 1000), secreto = "zoom-webhook" } = {}) {
  const body = JSON.stringify(cuerpo);
  const sig = "v0=" + createHmac("sha256", secreto).update(`v0:${ts}:${body}`).digest("hex");
  return { body, headers: { "Content-Type": "application/json", "x-zm-request-timestamp": String(ts), "x-zm-signature": sig } };
}
const deauth = async ({ body, headers }) => {
  const r = await fetch(sim.url + "/api/jump-zoom-deauth", { method: "POST", headers, body });
  return { status: r.status, ...(await r.json()) };
};

test("zoom-iniciar: emprendedor 403; admin recibe la URL de Zoom con redirect_uri y state verificable", async () => {
  assert.equal((await admin("zoom-iniciar", {}, await tok(X.E))).status, 403);
  const { r, url, state, cookie } = await iniciar();
  assert.equal(r.status, 200);
  assert.equal(url.origin + url.pathname, "https://zoom.us/oauth/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "zoom-id");
  assert.equal(url.searchParams.get("redirect_uri"), sim.url + "/api/jump-zoom-callback");
  const st = await sec.verificar(state);
  assert.equal(st.adminId, X.A.id);
  assert.ok(st.nonce && st.exp - Date.now() <= 600e3 && st.exp - Date.now() > 590e3);
  // El state queda atado al navegador que inició el flujo.
  assert.equal(cookie, "jump_zoom_nonce=" + st.nonce);
  const sc = r.headers.get("set-cookie");
  assert.match(sc, /HttpOnly/i);
  assert.match(sc, /SameSite=Lax/i);
  assert.match(sc, /Path=\/api\/jump-zoom-callback/);
});

test("callback con state alterado, sin la cookie del navegador, cancelado o con admin inactivo → no conecta nada", async () => {
  const i = await iniciar();
  const alterado = i.state.slice(0, -2) + (i.state.endsWith("AA") ? "BB" : "AA");
  assert.equal((await callback({ code: "c", state: alterado }, i.cookie)).headers.get("location"), destino("error"));
  assert.equal((await callback({ code: "c", state: i.state })).headers.get("location"), destino("error"));
  assert.equal((await callback({ code: "c", state: i.state }, "jump_zoom_nonce=otro")).headers.get("location"), destino("error"));
  const cancel = await callback({ error: "access_denied", state: i.state }, i.cookie);
  assert.equal(cancel.status, 302);
  assert.equal(cancel.headers.get("location"), destino("cancelado"));
  await sim.db.query("update jump_miembros set estado = 'suspendida' where user_id = $1", [X.A.id]);
  try { assert.equal((await callback({ code: "c", state: i.state }, i.cookie)).headers.get("location"), destino("error")); }
  finally { await sim.db.query("update jump_miembros set estado = 'activa' where user_id = $1", [X.A.id]); }
  assert.equal(await filaZoom(), undefined);
});

test("callback válido conecta la cuenta y guarda los tokens cifrados", async () => {
  const i = await iniciar();
  const r = await callback({ code: "codigo-1", state: i.state }, i.cookie);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), destino("ok"));
  assert.match(r.headers.get("set-cookie") || "", /jump_zoom_nonce=;.*Max-Age=0/i);
  const canje = sim.zoomFalso.pedidos.find((p) => p.url.startsWith("https://zoom.us/oauth/token"));
  assert.equal(canje.headers.Authorization, "Basic " + Buffer.from("zoom-id:zoom-secreto").toString("base64"));
  assert.equal(new URLSearchParams(canje.cuerpo).get("redirect_uri"), sim.url + "/api/jump-zoom-callback");
  const f = await filaZoom();
  assert.equal(f.zoom_user_id, "zu-1");
  assert.equal(f.email, "jump@zoom.test");
  assert.equal(f.nombre, "Cuenta JUMP");
  assert.equal(f.conectada_por, X.A.id);
  const n = sim.zoomFalso.n;
  assert.notEqual(f.refresh_token_cifrado, `zr-${n}`);
  assert.equal(await sec.descifrar(f.refresh_token_cifrado), `zr-${n}`);
  assert.equal(await sec.descifrar(f.access_token_cifrado), `za-${n}`);
  assert.ok(new Date(f.expira_en) > new Date(Date.now() + 3500e3));
  assert.equal((await sim.db.query("select count(*)::int n from jump_bitacora where accion = 'zoom-conectar'")).rows[0].n, 1);
});

test("zoom-estado muestra la cuenta conectada sin tokens", async () => {
  const r = await admin("zoom-estado");
  assert.equal(r.configurada, true);
  assert.equal(r.conectada, true);
  assert.equal(r.email, "jump@zoom.test");
  assert.equal(r.nombre, "Cuenta JUMP");
  assert.ok(r.conectadaEn);
  assert.doesNotMatch(JSON.stringify(r), /token|zr-|za-/i);
});

test("conectar otra cuenta revoca la anterior; volver a conectar la misma no revoca", async () => {
  const antes = await filaZoom();
  const viejos = [await sec.descifrar(antes.refresh_token_cifrado), await sec.descifrar(antes.access_token_cifrado)];
  sim.zoomFalso.usuario = { id: "zu-2", email: "clases@zoom.test", first_name: "Clases", last_name: "JUMP" };
  await conectar();
  assert.equal((await filaZoom()).zoom_user_id, "zu-2");
  assert.ok(viejos.some((t) => sim.zoomFalso.revocados.includes(t)), "revoca los tokens de la cuenta anterior");
  const revocadosAntes = sim.zoomFalso.revocados.length;
  await conectar();
  assert.equal(sim.zoomFalso.revocados.length, revocadosAntes);
});

test("zoom-reunion con el token vencido: refresca, guarda el refresh rotado y crea la reunión en hora de Guayaquil", async () => {
  sim.zoomFalso.vencerAccesos();
  await sim.db.query("update jump_zoom set expira_en = now() - interval '1 minute'");
  const refreshAntes = await sec.descifrar((await filaZoom()).refresh_token_cifrado);
  const r = await admin("zoom-reunion", { claseId: X.C3 });
  assert.equal(r.status, 200);
  const f = await filaZoom();
  assert.notEqual(await sec.descifrar(f.refresh_token_cifrado), refreshAntes);
  assert.equal(await sec.descifrar(f.refresh_token_cifrado), `zr-${sim.zoomFalso.n}`);
  const cz = (await sim.db.query("select * from jump_clases_zoom where clase_id = $1", [X.C3])).rows[0];
  assert.match(cz.join_url, /^https:\/\/us06web\.zoom\.us\/j\/\d+/);
  assert.equal(cz.passcode, "abc123");
  assert.ok(cz.meeting_id);
  const pedido = sim.zoomFalso.pedidos.filter((p) => p.url === "https://api.zoom.us/v2/users/me/meetings").at(-1);
  const b = JSON.parse(pedido.cuerpo);
  const clase = (await sim.db.query("select titulo, inicia_en, duracion_min from jump_clases where id = $1", [X.C3])).rows[0];
  assert.equal(b.type, 2);
  assert.equal(b.timezone, "America/Guayaquil");
  assert.equal(b.topic, clase.titulo);
  assert.equal(b.duration, clase.duracion_min);
  assert.equal(b.start_time, new Date(new Date(clase.inicia_en).getTime() - 5 * 3600e3).toISOString().slice(0, 19));
  assert.deepEqual(b.settings, { waiting_room: true, join_before_host: false });
});

test("zoom-reunion: id inválido 400, clase inexistente 404, refresh rechazado por Zoom 409", async () => {
  assert.equal((await admin("zoom-reunion", { claseId: "x" })).status, 400);
  assert.equal((await admin("zoom-reunion", { claseId: "6f1c2a8e-1b2c-4d3e-8f90-1234567890ab" })).status, 404);
  await sim.db.query("update jump_zoom set expira_en = now() - interval '1 minute'");
  const vigentes = new Map(sim.zoomFalso.vigentes);
  sim.zoomFalso.vigentes.clear();
  try {
    const r = await admin("zoom-reunion", { claseId: X.C1 });
    assert.equal(r.status, 409);
    assert.equal(r.error, "La conexión con Zoom se perdió. Vuelve a conectar la cuenta en Ajustes o pega el enlace a mano.");
  } finally {
    for (const [k, v] of vigentes) sim.zoomFalso.vigentes.set(k, v);
  }
});

test("deauth: firma mala, sin firma o vieja → 401; la validación de URL devuelve el HMAC; app_deauthorized borra solo la cuenta conectada", async () => {
  const conectada = (await filaZoom()).zoom_user_id;
  const evento = (user_id) => ({ event: "app_deauthorized", payload: { user_id, account_id: "acc", client_id: "zoom-id" } });
  assert.equal((await deauth(firmado(evento(conectada), { secreto: "otro" }))).status, 401);
  assert.equal((await deauth(firmado(evento(conectada), { ts: Math.floor(Date.now() / 1000) - 400 }))).status, 401);
  const sinFirma = firmado(evento(conectada));
  delete sinFirma.headers["x-zm-signature"];
  assert.equal((await deauth(sinFirma)).status, 401);
  assert.ok(await filaZoom());

  const v = await deauth(firmado({ event: "endpoint.url_validation", payload: { plainToken: "qgg8vlvZRS6UYooatFL8Aw" } }));
  assert.equal(v.status, 200);
  assert.equal(v.plainToken, "qgg8vlvZRS6UYooatFL8Aw");
  assert.equal(v.encryptedToken, createHmac("sha256", "zoom-webhook").update("qgg8vlvZRS6UYooatFL8Aw").digest("hex"));
  // Sin firma no hay validación: si no, serviría de oráculo para firmar eventos falsos.
  const vs = firmado({ event: "endpoint.url_validation", payload: { plainToken: "abc" } });
  delete vs.headers["x-zm-signature"];
  assert.equal((await deauth(vs)).status, 401);

  assert.equal((await deauth(firmado(evento("zu-otra")))).status, 200);
  assert.ok(await filaZoom(), "otra cuenta no borra la conectada");
  assert.equal((await deauth(firmado(evento(conectada)))).status, 200);
  assert.equal(await filaZoom(), undefined);
});

test("zoom-desconectar revoca y borra; luego zoom-reunion pide conectar", async () => {
  await conectar();
  const f = await filaZoom();
  const refresh = await sec.descifrar(f.refresh_token_cifrado);
  const access = await sec.descifrar(f.access_token_cifrado);
  const r = await admin("zoom-desconectar");
  assert.equal(r.status, 200);
  assert.equal(await filaZoom(), undefined);
  assert.ok(sim.zoomFalso.revocados.includes(refresh) || sim.zoomFalso.revocados.includes(access));
  assert.equal((await sim.db.query("select count(*)::int n from jump_bitacora where accion = 'zoom-desconectar'")).rows[0].n, 1);
  assert.equal((await admin("zoom-estado")).conectada, false);
  const sin = await admin("zoom-reunion", { claseId: X.C3 });
  assert.equal(sin.status, 409);
  assert.equal(sin.error, "Conecta una cuenta de Zoom en Ajustes o pega el enlace a mano.");
  // Desconectar sin cuenta no falla.
  assert.equal((await admin("zoom-desconectar")).status, 200);
});

test("sin ZOOM_CLIENT_ID: zoom-iniciar 503 y zoom-estado configurada:false", async () => {
  const id = process.env.ZOOM_CLIENT_ID;
  delete process.env.ZOOM_CLIENT_ID;
  try {
    const r = await admin("zoom-iniciar");
    assert.equal(r.status, 503);
    assert.equal(r.error, "Zoom todavía no está configurado en el servidor.");
    assert.equal((await admin("zoom-estado")).configurada, false);
  } finally {
    process.env.ZOOM_CLIENT_ID = id;
  }
});
