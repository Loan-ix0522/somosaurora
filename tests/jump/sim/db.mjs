// Postgres real (PGlite) con lo mínimo de Supabase, para probar RLS y funciones de las migraciones.
// JUMP tiene su propio proyecto de Supabase: la base de pruebas es un proyecto vacío + las migraciones de supabase/jump/
// (nada de La Aurora Escucha, que vive en supabase/migrations/ y en otro proyecto).
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRACIONES = new URL("../../../supabase/jump/", import.meta.url);
const migraciones = () => readdirSync(MIGRACIONES).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();

// Aplica base.sql y las migraciones de JUMP, en orden. { hasta: "0002" } se detiene ahí (para probar un proyecto
// al que todavía le falta una migración).
export async function crearBase({ hasta } = {}) {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(readFileSync(new URL("base.sql", import.meta.url), "utf8"));
  for (const f of migraciones()) if (!hasta || f.slice(0, 4) <= hasta) await aplicarMigracion(db, f.slice(0, 4));
  return db;
}

// Aplica una sola migración por su prefijo ("0001").
export async function aplicarMigracion(db, prefijo) {
  const f = migraciones().find((x) => x.startsWith(prefijo + "_"));
  if (!f) throw new Error(`No existe la migración ${prefijo}`);
  await db.exec(readFileSync(new URL(f, MIGRACIONES), "utf8"));
}

const papel = (quien) =>
  quien === "anon" ? { rol: "anon", claims: { role: "anon" } }
  : quien === "service" ? { rol: "service_role", claims: { role: "service_role" } }
  : { rol: "authenticated", claims: { sub: quien.id, email: quien.email, role: "authenticated" } };

// Corre `sql` como lo haría PostgREST para ese usuario: rol + claims del JWT, dentro de una transacción.
export async function como(db, quien, sql, params = []) {
  const { rol, claims } = papel(quien);
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await tx.exec(`set local role ${rol}`);
    return tx.query(sql, params);
  });
}

export async function nuevoUsuario(db, { email, password }) {
  const { rows } = await db.query(
    "insert into auth.users (email, encrypted_password) values ($1, $2) returning id", [email, password]);
  return rows[0].id;
}
