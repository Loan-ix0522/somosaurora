// Permisos de la 0005 (parte 1): quién ve qué en miembros, mentorías, módulos, clases, Zoom y avisos.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { crearBase, aplicarMigracion, como } from "./sim/db.mjs";
import { crearEscenario } from "./sim/escenario.mjs";

let db, X;
before(async () => { db = await crearBase(); X = await crearEscenario(db); });

const n = async (quien, sql, params) => (await como(db, quien, `select count(*)::int n from (${sql}) t`, params)).rows[0].n;
// Lectura que puede fallar por permiso o no devolver filas: ambas cuentan como "no ve nada".
const nOCero = (quien, sql, params) => n(quien, sql, params).catch((e) => (/permission denied/.test(e.message) ? 0 : Promise.reject(e)));

test("precondición: sin 0002 la 0005 no corre", async () => {
  const vieja = await crearBase({ hasta: "0001" });
  await assert.rejects(aplicarMigracion(vieja, "0005"), /Falta aplicar 0002/);
});

test("E ve P y sus módulos, no ve B ni sus módulos", async () => {
  assert.equal(await n(X.E, "select 1 from jump_mentorias where id = $1", [X.P]), 1);
  assert.equal(await n(X.E, "select 1 from jump_modulos where mentoria_id = $1", [X.P]), 2);
  assert.equal(await n(X.E, "select 1 from jump_mentorias where id = $1", [X.B]), 0);
  assert.equal(await n(X.E, "select 1 from jump_modulos where mentoria_id = $1", [X.B]), 0);
  assert.equal(await n(X.E, "select 1 from jump_materiales where mentoria_id = $1", [X.B]), 0);
});

test("E no ve C2 (de un borrador)", async () => {
  assert.equal(await n(X.E, "select 1 from jump_clases where id = $1", [X.C2]), 0);
  assert.equal(await n(X.E, "select 1 from jump_clases"), 2);
});

test("E no lee jump_clases_zoom", async () => {
  assert.equal(await nOCero(X.E, "select 1 from jump_clases_zoom"), 0);
  assert.equal(await n(X.A, "select 1 from jump_clases_zoom"), 2);
});

test("S, N y U no ven nada de contenido", async () => {
  for (const q of [X.S, X.N, X.U, "anon"])
    for (const t of ["jump_mentorias", "jump_modulos", "jump_materiales", "jump_clases", "jump_avisos"])
      assert.equal(await nOCero(q, `select 1 from ${t}`), 0, `${t} visible para ${q.email || q}`);
});

test("S ve su propia fila con jump_yo()", async () => {
  const { rows } = await como(db, X.S, "select * from jump_yo()");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].estado, "suspendida");
  const nRows = (await como(db, X.N, "select * from jump_yo()")).rows;
  assert.equal(nRows[0].debe_cambiar_clave, true);
  assert.equal((await como(db, X.U, "select * from jump_yo()")).rows.length, 0);
});

test("jump_yo() marca el último ingreso", async () => {
  await como(db, X.E2, "select * from jump_yo()");
  const { rows } = await db.query("select ultimo_ingreso from jump_miembros where user_id = $1", [X.E2.id]);
  assert.ok(rows[0].ultimo_ingreso);
});

test("E solo ve su fila de jump_miembros; A ve todas", async () => {
  assert.equal(await n(X.E, "select 1 from jump_miembros"), 1);
  assert.equal(await n(X.A, "select 1 from jump_miembros"), 5);
});

test("E no puede cambiar su rol ni su estado", async () => {
  await como(db, X.E, "update jump_miembros set rol = 'admin' where user_id = $1", [X.E.id]).catch(() => {});
  await como(db, X.S, "update jump_miembros set estado = 'activa' where user_id = $1", [X.S.id]).catch(() => {});
  const { rows } = await db.query("select rol, estado from jump_miembros where user_id in ($1, $2) order by rol", [X.E.id, X.S.id]);
  assert.deepEqual(rows.map((r) => r.rol + "/" + r.estado).sort(), ["emprendedor/activa", "emprendedor/suspendida"]);
  await assert.rejects(como(db, X.E, "insert into jump_miembros (user_id, rol, usuario, nombres) values ($1, 'admin', 'yo.admin', 'Yo')", [X.U.id]));
});

test("jump_entrar_clase da el enlace en la ventana y falla fuera", async () => {
  const { rows } = await como(db, X.E, "select jump_entrar_clase($1) u", [X.C1]);
  assert.equal(rows[0].u, "https://us02web.zoom.us/j/111");
  const a = await db.query("select entro_en from jump_asistencia where clase_id = $1 and user_id = $2", [X.C1, X.E.id]);
  assert.ok(a.rows[0].entro_en);
  await assert.rejects(como(db, X.E, "select jump_entrar_clase($1)", [X.C3]), /fuera_de_ventana/);
  await assert.rejects(como(db, X.E, "select jump_entrar_clase($1)", [X.C2]), /no_encontrada/);
  await assert.rejects(como(db, X.S, "select jump_entrar_clase($1)", [X.C1]), /sin_acceso/);
});

test("E no inserta progreso a nombre de otro ni de un módulo de B", async () => {
  await como(db, X.E, "insert into jump_progreso (modulo_id) values ($1)", [X.P1]);
  assert.equal(await n(X.E, "select 1 from jump_progreso"), 1);
  await assert.rejects(como(db, X.E, "insert into jump_progreso (user_id, modulo_id) values ($1, $2)", [X.E2.id, X.P2]));
  await assert.rejects(como(db, X.E, "insert into jump_progreso (modulo_id) values ($1)", [X.B1]));
  assert.equal(await n(X.E2, "select 1 from jump_progreso"), 0);
  assert.equal(await n(X.A, "select 1 from jump_progreso"), 1);
});

test("E no escribe contenido ni avisos", async () => {
  await assert.rejects(como(db, X.E, "insert into jump_avisos (tipo, texto) values ('aviso', 'hola')"));
  await assert.rejects(como(db, X.E, "insert into jump_mentorias (titulo) values ('Mía')"));
  await como(db, X.E, "update jump_mentorias set titulo = 'x' where id = $1", [X.P]).catch(() => {});
  assert.equal((await db.query("select titulo from jump_mentorias where id = $1", [X.P])).rows[0].titulo, "Tu RUC paso a paso");
});

test("A escribe contenido; un admin suspendido no", async () => {
  await como(db, X.A, "insert into jump_avisos (tipo, texto) values ('aviso', 'Hola comunidad')");
  await db.query("update jump_miembros set estado = 'suspendida' where user_id = $1", [X.A.id]);
  try {
    await assert.rejects(como(db, X.A, "insert into jump_avisos (tipo, texto) values ('aviso', 'otro')"));
    assert.equal(await nOCero(X.A, "select 1 from jump_mentorias"), 0);
  } finally {
    await db.query("update jump_miembros set estado = 'activa' where user_id = $1", [X.A.id]);
  }
});

test("is_admin() es falso para un miembro de JUMP aunque su correo esté en admins", async () => {
  await db.query("insert into public.admins (email) values ($1)", [X.E.email]);
  assert.equal((await como(db, X.E, "select public.is_admin() a")).rows[0].a, false);
});

test("is_admin() sigue verdadero para el admin real de La Aurora", async () => {
  const email = "somosaurora.daule@gmail.com";
  const id = (await db.query("insert into auth.users (email) values ($1) returning id", [email])).rows[0].id;
  assert.equal((await como(db, { id, email }, "select public.is_admin() a")).rows[0].a, true);
});

test("E no lee submissions ni admins", async () => {
  await db.query("insert into public.submissions (tipo, tema, detalle) values ('Otro tema', 'x', 'privado')");
  assert.equal(await nOCero(X.E, "select 1 from public.submissions"), 0);
  assert.equal(await nOCero(X.E, "select 1 from public.admins"), 0);
});

test("jump_actualizar_perfil valida", async () => {
  await como(db, X.E, "select jump_actualizar_perfil('Dulces de la Abuela', '0991234567')");
  const { rows } = await db.query("select negocio, whatsapp from jump_miembros where user_id = $1", [X.E.id]);
  assert.deepEqual(rows[0], { negocio: "Dulces de la Abuela", whatsapp: "0991234567" });
  await assert.rejects(como(db, X.E, "select jump_actualizar_perfil('Dulces', '12345')"), /whatsapp_invalido/);
  await assert.rejects(como(db, X.E, "select jump_actualizar_perfil('  ', '')"), /negocio_invalido/);
  await assert.rejects(como(db, X.S, "select jump_actualizar_perfil('x', '')"), /sin_acceso/);
});

test("jump_conteos: el equipo recibe los conteos; un emprendedor, null", async () => {
  await db.query("insert into jump_progreso (user_id, modulo_id) values ($1, $2), ($1, $3), ($4, $2) on conflict do nothing", [X.E.id, X.P1, X.B1, X.E2.id]);
  await db.query("insert into jump_asistencia (clase_id, user_id, confirmado_en, entro_en) values ($1, $2, now(), now()), ($1, $3, now(), null) on conflict do nothing", [X.C1, X.E.id, X.E2.id]);
  const aviso = (await db.query("select id from jump_avisos where clase_id = $1", [X.C1])).rows[0].id;
  await db.query("insert into jump_avisos_vistos (aviso_id, user_id) values ($1, $2) on conflict do nothing", [aviso, X.E.id]);
  const c = (await como(db, X.A, "select public.jump_conteos() c")).rows[0].c;
  // Avance: solo módulos de mentorías publicadas (B1 es de un borrador).
  assert.equal(c.progreso[X.E.id], 1);
  assert.equal(c.progreso[X.E2.id], 1);
  assert.deepEqual(c.asistencia[X.C1], { confirmados: 2, entraron: 1 });
  assert.equal(c.avisos[aviso], 1);
  assert.equal(c.mentorias[X.P], 2);
  assert.equal((await como(db, X.E, "select public.jump_conteos() c")).rows[0].c, null);
  await assert.rejects(como(db, "anon", "select public.jump_conteos()"), /permission denied/);
});
