// Postgres real (PGlite) con lo mínimo de Supabase (roles, auth.uid(), RLS), para probar las migraciones reales.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRACIONES = new URL("../../supabase/migrations/", import.meta.url);
const migraciones = () => readdirSync(MIGRACIONES).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();

// base.sql + las migraciones indicadas por prefijo (en orden).
export async function crearBase(prefijos) {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(readFileSync(new URL("base.sql", import.meta.url), "utf8"));
  for (const p of prefijos) {
    const f = migraciones().find((x) => x.startsWith(p + "_"));
    if (!f) throw new Error(`No existe la migración ${p}`);
    await db.exec(readFileSync(new URL(f, MIGRACIONES), "utf8"));
  }
  return db;
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

export async function nuevoUsuario(db, email) {
  const { rows } = await db.query("insert into auth.users (email, encrypted_password) values ($1, 'p') returning id", [email]);
  return { id: rows[0].id, email };
}
