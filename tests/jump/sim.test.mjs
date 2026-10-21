// El Supabase simulado responde como el real a las llamadas que hace supabase-js 2.45.4.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { iniciarSim } from "./sim/servidor.mjs";
import { crearEscenario } from "./sim/escenario.mjs";

let sim, X;
const cliente = () => createClient(sim.url + "/supa", "anon", { auth: { persistSession: false, autoRefreshToken: false } });
const entrar = async (p) => {
  const c = cliente();
  const { error } = await c.auth.signInWithPassword({ email: p.email, password: "clave-prueba-1" });
  assert.equal(error, null);
  return c;
};

before(async () => { sim = await iniciarSim(); X = await crearEscenario(sim.db); });
after(() => sim.cerrar());

test("login de E y rpc jump_yo", async () => {
  const c = await entrar(X.E);
  const { data, error } = await c.rpc("jump_yo").maybeSingle();
  assert.equal(error, null);
  assert.equal(data.cedula, "0912345675");
});

test("clave mala → invalid_credentials", async () => {
  const { error } = await cliente().auth.signInWithPassword({ email: X.E.email, password: "otra" });
  assert.equal(error.code, "invalid_credentials");
});

test("select con order respeta RLS", async () => {
  const c = await entrar(X.E);
  const { data, error } = await c.from("jump_mentorias").select("id,titulo").order("titulo");
  assert.equal(error, null);
  assert.deepEqual(data.map((m) => m.titulo), ["Tu RUC paso a paso"]);
});

test("filtros in, eq e is", async () => {
  const c = await entrar(X.A);
  const { data } = await c.from("jump_modulos").select("id").in("mentoria_id", [X.P, X.B]);
  assert.equal(data.length, 3);
  const r2 = await c.from("jump_clases").select("id").is("mentoria_id", null);
  assert.deepEqual(r2.data.map((x) => x.id), [X.C3]);
  const r3 = await c.from("jump_modulos").select("titulo").eq("id", X.P1).single();
  assert.equal(r3.data.titulo, "¿Qué es el RUC?");
});

test("insert + select().single() devuelve la fila", async () => {
  const c = await entrar(X.E2);
  const { data, error } = await c.from("jump_progreso").insert({ modulo_id: X.P1 }).select().single();
  assert.equal(error, null);
  assert.equal(data.user_id, X.E2.id);
});

test("insert que viola RLS da error 42501", async () => {
  const c = await entrar(X.E2);
  const { error } = await c.from("jump_progreso").insert({ modulo_id: X.B1 });
  assert.equal(error.code, "42501");
});

test("upsert con ignoreDuplicates dos veces deja 1 fila", async () => {
  const c = await entrar(X.E2);
  for (let i = 0; i < 2; i++) {
    const { error } = await c.from("jump_asistencia").upsert({ clase_id: X.C3 }, { onConflict: "clase_id,user_id", ignoreDuplicates: true });
    assert.equal(error, null);
  }
  const { rows } = await sim.db.query("select count(*)::int n from jump_asistencia where clase_id = $1 and user_id = $2", [X.C3, X.E2.id]);
  assert.equal(rows[0].n, 1);
});

test("update y delete con filtros", async () => {
  const c = await entrar(X.A);
  const { data, error } = await c.from("jump_clases").update({ mensaje: "Trae tus dudas" }).eq("id", X.C3).select("mensaje");
  assert.equal(error, null);
  assert.deepEqual(data, [{ mensaje: "Trae tus dudas" }]);
  const { error: e2 } = await c.from("jump_avisos").insert({ tipo: "aviso", texto: "para borrar" });
  assert.equal(e2, null);
  const del = await c.from("jump_avisos").delete().eq("texto", "para borrar").select("id");
  assert.equal(del.data.length, 1);
});

test("count exact con head", async () => {
  const c = await entrar(X.E);
  const { count, error } = await c.from("jump_avisos").select("*", { count: "exact", head: true });
  assert.equal(error, null);
  assert.equal(count, 1);
});

test("rpc con argumentos y error de la función", async () => {
  const c = await entrar(X.E);
  const ok = await c.rpc("jump_entrar_clase", { p_clase: X.C1 });
  assert.equal(ok.data, "https://us02web.zoom.us/j/111");
  const malo = await c.rpc("jump_entrar_clase", { p_clase: X.C3 });
  assert.match(malo.error.message, /fuera_de_ventana/);
  const v = await c.rpc("jump_actualizar_perfil", { p_negocio: "Dulces", p_whatsapp: "0991112233" });
  assert.equal(v.error, null);
});

test("Storage: subir a la carpeta propia sí, a la ajena no", async () => {
  const c = await entrar(X.E);
  const blob = new Blob([new Uint8Array([82, 73, 70, 70])], { type: "image/webp" });
  const propia = await c.storage.from("jump-muro").upload(`${X.E.id}/${randomUUID()}.webp`, blob, { contentType: "image/webp" });
  assert.equal(propia.error, null);
  const ajena = await c.storage.from("jump-muro").upload(`${X.E2.id}/${randomUUID()}.webp`, blob, { contentType: "image/webp" });
  assert.ok(ajena.error);
  const tipoMalo = await c.storage.from("jump-muro").upload(`${X.E.id}/${randomUUID()}.webp`, new Blob(["hola"], { type: "text/plain" }));
  assert.ok(tipoMalo.error);
});

test("Storage: URL firmada del material de P sí, de B no; y se descarga", async () => {
  const admin = await entrar(X.A);
  const pdf = new Blob(["%PDF-1.4 prueba"], { type: "application/pdf" });
  const rp = `${X.P}/${randomUUID()}-guia.pdf`, rb = `${X.B}/${randomUUID()}-factura.pdf`;
  assert.equal((await admin.storage.from("jump-material").upload(rp, pdf, { contentType: "application/pdf" })).error, null);
  assert.equal((await admin.storage.from("jump-material").upload(rb, pdf, { contentType: "application/pdf" })).error, null);
  const c = await entrar(X.E);
  const okP = await c.storage.from("jump-material").createSignedUrl(rp, 120);
  assert.equal(okP.error, null);
  const bajada = await fetch(okP.data.signedUrl);
  assert.equal(await bajada.text(), "%PDF-1.4 prueba");
  const noB = await c.storage.from("jump-material").createSignedUrl(rb, 120);
  assert.ok(noB.error);
  const borrado = await admin.storage.from("jump-material").remove([rb]);
  assert.equal(borrado.data.length, 1);
});

test("ban: E baneada no entra (user_banned)", async () => {
  await sim.banear(X.S.id);
  const { error } = await cliente().auth.signInWithPassword({ email: X.S.email, password: "clave-prueba-1" });
  assert.equal(error.code, "user_banned");
});
