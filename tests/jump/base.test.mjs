// La base simulada reproduce lo que importa de Supabase (roles, auth.uid(), RLS) y aplica las migraciones reales.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearBase, como, nuevoUsuario } from "./sim/db.mjs";

test("0001-0004 aplican y is_admin() es falso para anon y para un usuario cualquiera", async () => {
  const db = await crearBase({ hasta: "0004" });
  assert.equal((await como(db, "anon", "select public.is_admin() a")).rows[0].a, false);
  const id = await nuevoUsuario(db, { email: "x@y.com", password: "p" });
  assert.equal((await como(db, { id, email: "x@y.com" }, "select public.is_admin() a")).rows[0].a, false);
});

test("un correo de admins es admin", async () => {
  const db = await crearBase({ hasta: "0004" });
  const email = "somosaurora.daule@gmail.com"; // lo precarga la 0002
  const id = await nuevoUsuario(db, { email, password: "p" });
  assert.equal((await como(db, { id, email }, "select public.is_admin() a")).rows[0].a, true);
});

test("RLS de La Aurora: un usuario cualquiera no lee submissions", async () => {
  const db = await crearBase({ hasta: "0004" });
  await db.query("insert into public.submissions (tipo, tema, detalle) values ('Otro tema', 'x', 'hola')");
  const id = await nuevoUsuario(db, { email: "x@y.com", password: "p" });
  const { rows } = await como(db, { id, email: "x@y.com" }, "select count(*)::int n from public.submissions");
  assert.equal(rows[0].n, 0);
});
