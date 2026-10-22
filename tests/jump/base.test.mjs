// La base simulada reproduce lo que importa de Supabase (roles, auth.uid(), RLS) y aplica la migración real de JUMP.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearBase, como, nuevoUsuario } from "./sim/db.mjs";

test("la migración de JUMP aplica sobre un proyecto de Supabase vacío", async () => {
  const db = await crearBase();
  const { rows } = await db.query("select to_regclass('public.jump_miembros') t, to_regclass('storage.objects') s");
  assert.notEqual(rows[0].t, null);
  assert.notEqual(rows[0].s, null);
});

test("quien no es miembro de JUMP no lee nada de JUMP, ni con sesión iniciada", async () => {
  const db = await crearBase();
  const id = await nuevoUsuario(db, { email: "x@y.com", password: "p" });
  const { rows } = await como(db, { id, email: "x@y.com" }, "select count(*)::int n from public.jump_miembros");
  assert.equal(rows[0].n, 0);
});

test("anon no puede leer jump_miembros", async () => {
  const db = await crearBase();
  await assert.rejects(como(db, "anon", "select 1 from public.jump_miembros"), /permission denied/);
});
