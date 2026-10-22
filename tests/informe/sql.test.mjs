// Migración 0007: informe_publico. Cada informe que ve el público (automático cada 5 días o manual del
// admin) es una fila con solo conteos. Todos lo leen; solo el servidor escribe; el admin puede retirar uno.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crearBase, como, nuevoUsuario } from "../visitas/db.mjs";

const BASE = ["0001", "0002", "0003", "0004", "0006"];
const ADMIN = "somosaurora.daule@gmail.com"; // lo precarga la 0002
const SQL = readFileSync(new URL("../../supabase/migrations/0007_informe_publico.sql", import.meta.url), "utf8");

async function preparar() {
  const db = await crearBase(BASE);
  await db.exec(SQL);
  const admin = await nuevoUsuario(db, ADMIN);
  const otro = await nuevoUsuario(db, "otro@correo.com");
  return { db, admin, otro };
}

const POR_TEMA = JSON.stringify([{ tema: "Basura y aseo", total: 8, porcentaje: 80 }, { tema: "Calles y baches", total: 2, porcentaje: 20 }]);
const insertar = (db, extra = {}) => {
  const f = { origen: "automatico", desde: "2026-10-16T13:00:00Z", hasta: "2026-10-21T13:00:00Z", total: 10, por_tema: POR_TEMA, ...extra };
  return como(db, "service",
    "insert into public.informe_publico (origen, periodo_desde, periodo_hasta, total, por_tema) values ($1, $2, $3, $4, $5::jsonb) returning id",
    [f.origen, f.desde, f.hasta, f.total, f.por_tema]);
};

test("el servidor guarda el informe y cualquiera lo puede leer, con sesión o sin ella", async () => {
  const { db, otro } = await preparar();
  await insertar(db);
  for (const quien of ["anon", otro]) {
    const { rows } = await como(db, quien, "select origen, total, por_tema from public.informe_publico");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].origen, "automatico");
    assert.equal(rows[0].total, 10);
    assert.equal(rows[0].por_tema[0].porcentaje, 80);
  }
});

test("nadie desde el navegador puede inventar ni cambiar un informe: ni anónimos, ni con sesión, ni siquiera el admin", async () => {
  const { db, admin, otro } = await preparar();
  const { rows: [{ id }] } = await insertar(db);
  for (const quien of ["anon", otro, admin]) {
    await assert.rejects(
      como(db, quien, "insert into public.informe_publico (origen, periodo_desde, periodo_hasta, total, por_tema) values ('manual', now(), now(), 5, '[]')"),
      /permission denied|row-level security/);
    await assert.rejects(como(db, quien, "update public.informe_publico set total = 99 where id = $1", [id]), /permission denied|row-level security/);
  }
  assert.equal((await db.query("select total from public.informe_publico")).rows[0].total, 10);
});

test("solo un admin puede retirar un informe; los demás no borran nada", async () => {
  const { db, admin, otro } = await preparar();
  const { rows: [{ id }] } = await insertar(db);
  await assert.rejects(como(db, "anon", "delete from public.informe_publico where id = $1", [id]), /permission denied/);
  const r = await como(db, otro, "delete from public.informe_publico where id = $1", [id]);
  assert.equal(r.affectedRows, 0);
  assert.equal((await db.query("select count(*)::int n from public.informe_publico")).rows[0].n, 1);
  const r2 = await como(db, admin, "delete from public.informe_publico where id = $1", [id]);
  assert.equal(r2.affectedRows, 1);
  assert.equal((await db.query("select count(*)::int n from public.informe_publico")).rows[0].n, 0);
});

test("rechaza datos mal formados: origen raro, total 0, periodo al revés o por_tema que no es una lista", async () => {
  const { db } = await preparar();
  await assert.rejects(insertar(db, { origen: "magia" }), /informe_publico_origen_chk/);
  await assert.rejects(insertar(db, { total: 0 }), /informe_publico_total_chk/);
  await assert.rejects(insertar(db, { desde: "2026-10-22T00:00:00Z", hasta: "2026-10-21T00:00:00Z" }), /informe_publico_periodo_chk/);
  await assert.rejects(insertar(db, { por_tema: '{"a":1}' }), /informe_publico_tema_chk/);
  assert.equal((await db.query("select count(*)::int n from public.informe_publico")).rows[0].n, 0);
});

test("se puede aplicar dos veces sin error ni perder lo guardado", async () => {
  const { db } = await preparar();
  await insertar(db);
  await db.exec(SQL);
  assert.equal((await db.query("select count(*)::int n from public.informe_publico")).rows[0].n, 1);
});

test("si falta la 0002 (is_admin) avisa claro en vez de dejar la tabla sin protección", async () => {
  const db = await crearBase(["0001"]);
  await assert.rejects(db.exec(SQL), /0002/);
});

test("el informe no guarda nada personal: la tabla solo tiene conteos y fechas", async () => {
  const { db } = await preparar();
  const { rows } = await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='informe_publico' order by 1");
  assert.deepEqual(rows.map((r) => r.column_name), ["created_at", "id", "origen", "periodo_desde", "periodo_hasta", "por_tema", "total"]);
});
