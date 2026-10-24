// Permisos de la migración 0002: postulaciones que llegan desde la página de JUMP (/jump/).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { crearBase, como } from "./sim/db.mjs";
import { crearEscenario } from "./sim/escenario.mjs";

let db, X;
before(async () => { db = await crearBase(); X = await crearEscenario(db); });

const n = async (quien, sql, params) => (await como(db, quien, `select count(*)::int n from (${sql}) t`, params)).rows[0].n;
const nOCero = (quien, sql, params) => n(quien, sql, params).catch((e) => (/permission denied/.test(e.message) ? 0 : Promise.reject(e)));
const INSERTAR = "insert into jump_postulaciones (nombres, whatsapp, negocio, rubro, sector, ruc, ip_hash) values ('Rosa Mora', $1, 'Dulces Rosa', 'Comida y bebidas', 'Villa Club', 'no', 'h1') returning id";
const nueva = async (wa) => (await como(db, "service", INSERTAR, [wa])).rows[0].id;
const estado = async (id) => (await db.query("select estado from jump_postulaciones where id = $1", [id])).rows[0].estado;

test("desde el navegador nadie crea postulaciones (solo la API, con service_role)", async () => {
  for (const quien of ["anon", X.E, X.A]) await assert.rejects(como(db, quien, INSERTAR, ["0990000001"]), /permission denied|row-level security/);
});

test("anon, emprendedores, suspendidas y cuentas en primer ingreso no las ven", async () => {
  await nueva("0990000002");
  for (const quien of ["anon", X.E, X.S, X.N]) assert.equal(await nOCero(quien, "select 1 from jump_postulaciones"), 0);
});

test("el equipo las ve, pero no el hash de la conexión", async () => {
  const id = await nueva("0990000003");
  assert.equal(await n(X.A, "select 1 from jump_postulaciones where id = $1", [id]), 1);
  await assert.rejects(como(db, X.A, "select ip_hash from jump_postulaciones"), /permission denied/);
});

test("el equipo cambia el estado, pero no los datos de la persona", async () => {
  const id = await nueva("0990000004");
  await como(db, X.A, "update jump_postulaciones set estado = 'contactada' where id = $1", [id]);
  assert.equal(await estado(id), "contactada");
  await assert.rejects(como(db, X.A, "update jump_postulaciones set nombres = 'Otra' where id = $1", [id]), /permission denied/);
  await assert.rejects(como(db, X.A, "update jump_postulaciones set estado = 'aceptadisima' where id = $1", [id]), /check constraint/);
  await como(db, X.E, "update jump_postulaciones set estado = 'descartada' where id = $1", [id]).catch(() => {});
  assert.equal(await estado(id), "contactada", "un emprendedor no la cambia");
});

test("el equipo borra una postulación; un emprendedor no", async () => {
  const id = await nueva("0990000005");
  await como(db, X.E, "delete from jump_postulaciones where id = $1", [id]).catch(() => {});
  assert.equal(await n("service", "select 1 from jump_postulaciones where id = $1", [id]), 1);
  await como(db, X.A, "delete from jump_postulaciones where id = $1", [id]);
  assert.equal(await n("service", "select 1 from jump_postulaciones where id = $1", [id]), 0);
});

test("la base rechaza datos fuera de forma aunque vengan con service_role", async () => {
  const insertar = (cambios) => {
    const v = { nombres: "Rosa Mora", whatsapp: "0991234500", negocio: "Dulces", rubro: "Otro", sector: "Villa Club", ruc: "no", ...cambios };
    return como(db, "service", "insert into jump_postulaciones (nombres, whatsapp, negocio, rubro, sector, ruc) values ($1, $2, $3, $4, $5, $6)",
      [v.nombres, v.whatsapp, v.negocio, v.rubro, v.sector, v.ruc]);
  };
  await assert.rejects(insertar({ whatsapp: "12345" }), /check constraint/);
  await assert.rejects(insertar({ ruc: "quizas" }), /check constraint/);
  await assert.rejects(insertar({ rubro: "Drogas" }), /check constraint/);
  await assert.rejects(insertar({ nombres: "R" }), /check constraint/);
});
