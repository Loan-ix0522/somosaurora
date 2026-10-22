// Superficie de ataque de la base de JUMP, vista desde el catálogo de Postgres (no desde casos sueltos):
// lo que una persona sin cuenta o con cuenta de emprendedor podría tocar aunque ninguna prueba puntual lo pensara.
// Las bases de Supabase dan por defecto permisos amplios a anon y authenticated; la migración tiene que quitarlos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearBase } from "./sim/db.mjs";

const TABLAS = `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'jump\\_%' order by 1`;
const FUNCIONES = `select p.oid::regprocedure::text as firma, p.prosecdef as definer, p.proconfig as config from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'jump\\_%' order by 1`;
const col = async (db, sql) => (await db.query(sql)).rows.map((r) => Object.values(r)[0]);

// Tablas jump_* sin RLS. Es la consulta que usan las pruebas de abajo y su control negativo.
const sinRls = async (db) => col(db, `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'jump\\_%' and not c.relrowsecurity order by 1`);
const privilegios = async (db, rol, tablas, privs) => {
  const abiertos = [];
  for (const t of tablas) for (const p of privs)
    if ((await db.query("select has_table_privilege($1, $2, $3) ok", [rol, `public.${t}`, p])).rows[0].ok) abiertos.push(`${rol} ${p} ${t}`);
  return abiertos;
};

test("toda tabla jump_* tiene RLS (y la consulta de control sí detecta una que no)", async () => {
  const db = await crearBase();
  const tablas = await col(db, TABLAS);
  assert.ok(tablas.length >= 14, "tablas: " + tablas.join(", "));
  assert.deepEqual(await sinRls(db), []);
  await db.exec("create table public.jump_prueba_sin_rls (id int)");
  assert.deepEqual(await sinRls(db), ["jump_prueba_sin_rls"]);
});

test("anon (sin sesión) no tiene ningún permiso sobre las tablas de JUMP", async () => {
  const db = await crearBase();
  const tablas = await col(db, TABLAS);
  assert.deepEqual(await privilegios(db, "anon", tablas, ["select", "insert", "update", "delete"]), []);
  await db.exec("grant select on public.jump_posts to anon");
  assert.deepEqual(await privilegios(db, "anon", tablas, ["select", "insert", "update", "delete"]), ["anon select jump_posts"]);
});

test("las llaves de Zoom (jump_zoom) no se tocan con una sesión: solo con service_role", async () => {
  const db = await crearBase();
  assert.deepEqual(await privilegios(db, "authenticated", ["jump_zoom"], ["select", "insert", "update", "delete"]), []);
});

test("la bitácora y las cuentas solo las cambia el servidor, no una sesión", async () => {
  const db = await crearBase();
  assert.deepEqual(await privilegios(db, "authenticated", ["jump_bitacora"], ["insert", "update", "delete"]), []);
  // jump_miembros: la persona no se crea, no se borra ni se cambia el rol/estado desde el navegador.
  assert.deepEqual(await privilegios(db, "authenticated", ["jump_miembros"], ["insert", "delete"]), []);
  const cols = await col(db, `select column_name from information_schema.column_privileges
    where grantee = 'authenticated' and table_schema = 'public' and table_name = 'jump_miembros' and privilege_type = 'UPDATE' order by 1`);
  for (const prohibida of ["rol", "estado", "user_id", "cedula", "usuario", "debe_cambiar_clave", "es_ejemplo"])
    assert.ok(!cols.includes(prohibida), `authenticated puede actualizar jump_miembros.${prohibida}`);
});

test("ninguna función jump_* la puede ejecutar anon, y las de security definer fijan su search_path", async () => {
  const db = await crearBase();
  const fns = (await db.query(FUNCIONES)).rows;
  assert.ok(fns.length >= 8, "funciones: " + fns.map((f) => f.firma).join(", "));
  const abiertas = [];
  for (const f of fns)
    if ((await db.query("select has_function_privilege('anon', $1::regprocedure, 'execute') ok", [f.firma])).rows[0].ok) abiertas.push(f.firma);
  assert.deepEqual(abiertas, []);
  const sinPath = fns.filter((f) => f.definer && !(f.config || []).some((c) => /^search_path=/.test(c))).map((f) => f.firma);
  assert.deepEqual(sinPath, []);
});
