// Permisos de la 0005 (parte 2): muro, Storage, Zoom, bitácora y directorio.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearBase, aplicarMigracion, como } from "./sim/db.mjs";
import { crearEscenario } from "./sim/escenario.mjs";

let db, X;
before(async () => { db = await crearBase(); X = await crearEscenario(db); });

const n = async (quien, sql, params) => (await como(db, quien, `select count(*)::int n from (${sql}) t`, params)).rows[0].n;
const nOCero = (quien, sql, params) => n(quien, sql, params).catch((e) => (/permission denied/.test(e.message) ? 0 : Promise.reject(e)));
const publicar = async (quien, texto = "Ya saqué mi RUC") =>
  (await como(db, quien, "insert into jump_posts (texto) values ($1) returning id", [texto])).rows[0].id;

test("E publica y E2 lo ve; S no ve el muro", async () => {
  const id = await publicar(X.E);
  assert.equal(await n(X.E2, "select 1 from jump_posts where id = $1", [id]), 1);
  assert.equal(await nOCero(X.S, "select 1 from jump_posts"), 0);
  assert.equal(await nOCero(X.N, "select 1 from jump_posts"), 0);
  assert.equal(await nOCero("anon", "select 1 from jump_posts"), 0);
});

test("E no publica a nombre de E2", async () => {
  await assert.rejects(como(db, X.E, "insert into jump_posts (autor_id, texto) values ($1, 'suplanto')", [X.E2.id]));
  await assert.rejects(como(db, X.E, "insert into jump_posts (texto, es_ejemplo) values ('x', true)"));
  await assert.rejects(como(db, X.E, "insert into jump_posts (texto, oculto_en) values ('x', now())"));
});

test("E no edita el texto de su post", async () => {
  const id = await publicar(X.E, "original");
  await assert.rejects(como(db, X.E, "update jump_posts set texto = 'cambiado' where id = $1", [id]), /permission denied/);
});

test("A oculta: E2 deja de verlo, E (autor) lo sigue viendo, A lo ve", async () => {
  const id = await publicar(X.E, "para ocultar");
  await como(db, X.A, "update jump_posts set oculto_en = now(), oculto_por = $2 where id = $1", [id, X.A.id]);
  assert.equal(await n(X.E2, "select 1 from jump_posts where id = $1", [id]), 0);
  assert.equal(await n(X.E, "select 1 from jump_posts where id = $1", [id]), 1);
  assert.equal(await n(X.A, "select 1 from jump_posts where id = $1", [id]), 1);
  // E2 no puede ocultar ni restaurar
  await como(db, X.E2, "update jump_posts set oculto_en = null where id = $1", [id]).catch(() => {});
  assert.ok((await db.query("select oculto_en from jump_posts where id = $1", [id])).rows[0].oculto_en);
});

test("no se comenta un post oculto", async () => {
  const id = await publicar(X.E, "otro");
  await db.query("update jump_posts set oculto_en = now() where id = $1", [id]);
  await assert.rejects(como(db, X.E2, "insert into jump_comentarios (post_id, texto) values ($1, 'hola')", [id]));
});

test("comentarios: E2 comenta, E lo ve, S no", async () => {
  const id = await publicar(X.E, "pregunta");
  await como(db, X.E2, "insert into jump_comentarios (post_id, texto) values ($1, 'Yo lo hice así')", [id]);
  assert.equal(await n(X.E, "select 1 from jump_comentarios where post_id = $1", [id]), 1);
  assert.equal(await nOCero(X.S, "select 1 from jump_comentarios"), 0);
  await assert.rejects(como(db, X.E2, "insert into jump_comentarios (post_id, autor_id, texto) values ($1, $2, 'suplanto')", [id, X.E.id]));
});

test("el 11.º post en 24 h falla con limite_publicaciones", async () => {
  const yaHay = await n(X.E2, "select 1 from jump_posts where autor_id = $1", [X.E2.id]);
  for (let i = yaHay; i < 10; i++) await publicar(X.E2, "post " + i);
  await assert.rejects(publicar(X.E2, "uno más"), /limite_publicaciones/);
});

test("el 51.º comentario en 24 h falla con limite_comentarios", async () => {
  const id = await publicar(X.A, "aviso del equipo");
  for (let i = 0; i < 50; i++) await db.query("insert into jump_comentarios (post_id, autor_id, texto) values ($1, $2, 'c')", [id, X.N.id]);
  await db.query("update jump_miembros set debe_cambiar_clave = false where user_id = $1", [X.N.id]);
  try {
    await assert.rejects(como(db, X.N, "insert into jump_comentarios (post_id, texto) values ($1, 'otro')", [id]), /limite_comentarios/);
  } finally {
    await db.query("update jump_miembros set debe_cambiar_clave = true where user_id = $1", [X.N.id]);
  }
});

test("post vacío sin foto falla; post de 1001 caracteres falla; comentario de 501 falla", async () => {
  await assert.rejects(publicar(X.E, "   "));
  await assert.rejects(publicar(X.E, "x".repeat(1001)));
  const id = await publicar(X.E, "ok");
  await assert.rejects(como(db, X.E, "insert into jump_comentarios (post_id, texto) values ($1, $2)", [id, "x".repeat(501)]));
});

test("post solo con foto vale; la foto debe estar en la carpeta del autor", async () => {
  const foto = `${X.E.id}/${randomUUID()}.webp`;
  await como(db, X.E, "insert into jump_posts (texto, foto) values ('', $1)", [foto]);
  await assert.rejects(como(db, X.E, "insert into jump_posts (texto, foto) values ('', $1)", [`${X.E2.id}/${randomUUID()}.webp`]));
  await assert.rejects(como(db, X.E, "insert into jump_posts (texto, foto) values ('', '../x.webp')"));
});

test("E no lee jump_zoom ni escribe jump_bitacora; A lee la bitácora", async () => {
  await db.query("insert into jump_zoom (zoom_user_id, email, refresh_token_cifrado) values ('z', 'z@z.com', 'v1.a.b')");
  assert.equal(await nOCero(X.E, "select 1 from jump_zoom"), 0);
  assert.equal(await nOCero(X.A, "select 1 from jump_zoom"), 0);
  await assert.rejects(como(db, X.E, "insert into jump_bitacora (accion) values ('x')"));
  await assert.rejects(como(db, X.A, "insert into jump_bitacora (accion) values ('x')"));
  await db.query("insert into jump_bitacora (actor_id, accion) values ($1, 'crear-cuenta')", [X.A.id]);
  assert.equal(await nOCero(X.E, "select 1 from jump_bitacora"), 0);
  assert.equal(await n(X.A, "select 1 from jump_bitacora"), 1);
});

test("jump_directorio muestra 'María V.' y no expone cédula ni whatsapp", async () => {
  const { rows, fields } = await como(db, X.E2, "select * from jump_directorio()");
  assert.deepEqual(fields.map((f) => f.name), ["user_id", "nombre", "negocio", "rol"]);
  const maria = rows.find((r) => r.user_id === X.E.id);
  assert.equal(maria.nombre, "María V.");
  assert.equal(rows.find((r) => r.user_id === X.A.id).nombre, "Equipo JUMP");
  assert.equal(rows.some((r) => r.user_id === X.S.id), false, "no lista suspendidos");
  assert.equal((await como(db, X.S, "select * from jump_directorio()")).rows.length, 0);
});

test("Storage: E sube a jump-muro/<su id>/…, no a la carpeta de E2", async () => {
  await como(db, X.E, "insert into storage.objects (bucket_id, name, owner) values ('jump-muro', $1, $2)", [`${X.E.id}/${randomUUID()}.webp`, X.E.id]);
  await assert.rejects(como(db, X.E, "insert into storage.objects (bucket_id, name, owner) values ('jump-muro', $1, $2)", [`${X.E2.id}/${randomUUID()}.webp`, X.E.id]));
  await assert.rejects(como(db, X.S, "insert into storage.objects (bucket_id, name) values ('jump-muro', $1)", [`${X.S.id}/${randomUUID()}.webp`]));
  assert.ok(await n(X.E2, "select 1 from storage.objects where bucket_id = 'jump-muro'") >= 1);
  assert.equal(await n(X.S, "select 1 from storage.objects where bucket_id = 'jump-muro'"), 0);
});

test("Storage: E lee material de P, no de B", async () => {
  await db.query("insert into storage.objects (bucket_id, name) values ('jump-material', $1), ('jump-material', $2), ('jump-material', 'raro/x.pdf')",
    [`${X.P}/${randomUUID()}-guia.pdf`, `${X.B}/${randomUUID()}-factura.pdf`]);
  assert.equal(await n(X.E, "select 1 from storage.objects where bucket_id = 'jump-material'"), 1);
  assert.equal(await n(X.A, "select 1 from storage.objects where bucket_id = 'jump-material'"), 3);
});

test("Storage: E no sube a jump-material ni a jump-portadas; A sí", async () => {
  await assert.rejects(como(db, X.E, "insert into storage.objects (bucket_id, name) values ('jump-material', $1)", [`${X.P}/x.pdf`]));
  await assert.rejects(como(db, X.E, "insert into storage.objects (bucket_id, name) values ('jump-portadas', $1)", [`${randomUUID()}/p.webp`]));
  await como(db, X.A, "insert into storage.objects (bucket_id, name) values ('jump-portadas', $1)", [`${randomUUID()}/p.webp`]);
});

test("Storage: los buckets quedan con sus límites", async () => {
  const { rows } = await db.query("select id, public, file_size_limit from storage.buckets where id like 'jump-%' order by id");
  assert.deepEqual(rows.map((r) => [r.id, r.public, Number(r.file_size_limit)]),
    [["jump-material", false, 20971520], ["jump-muro", false, 5242880], ["jump-portadas", true, 5242880]]);
});

test("E2 borra solo su comentario; E borra su post", async () => {
  const id = await publicar(X.E, "para borrar");
  const c = (await como(db, X.E2, "insert into jump_comentarios (post_id, texto) values ($1, 'mío') returning id", [id])).rows[0].id;
  await como(db, X.E, "delete from jump_comentarios where id = $1", [c]);
  assert.equal((await db.query("select count(*)::int n from jump_comentarios where id = $1", [c])).rows[0].n, 1);
  await como(db, X.E2, "delete from jump_comentarios where id = $1", [c]);
  assert.equal((await db.query("select count(*)::int n from jump_comentarios where id = $1", [c])).rows[0].n, 0);
  await como(db, X.E2, "delete from jump_posts where id = $1", [id]);
  assert.equal((await db.query("select count(*)::int n from jump_posts where id = $1", [id])).rows[0].n, 1);
  await como(db, X.E, "delete from jump_posts where id = $1", [id]);
  assert.equal((await db.query("select count(*)::int n from jump_posts where id = $1", [id])).rows[0].n, 0);
});

test("la 0005 se puede volver a correr sin error", async () => {
  await aplicarMigracion(db, "0005");
  await aplicarMigracion(db, "0005");
  assert.equal(await n(X.E, "select 1 from jump_mentorias"), 1);
});
