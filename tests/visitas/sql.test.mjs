// Migración 0006: contador de visitas. Solo el servidor registra; solo el equipo (admins) lee.
// Guarda la IP y la ciudad; la IP se borra sola a los 30 días (borrar_ip_visitas, desde /api/purge).
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearBase, como, nuevoUsuario } from "./db.mjs";

const BASE = ["0001", "0002", "0003", "0004", "0006"];
const ADMIN = "somosaurora.daule@gmail.com"; // lo precarga la 0002

async function preparar() {
  const db = await crearBase(BASE);
  const admin = await nuevoUsuario(db, ADMIN);
  const otro = await nuevoUsuario(db, "otro@correo.com");
  return { db, admin, otro };
}

const registrar = (db, v) =>
  como(db, "service", "select public.registrar_visita($1, $2, $3, $4, $5, $6, $7) ok",
    [v.ruta, v.visitante ?? null, v.pais ?? null, v.dispositivo ?? null, v.procedencia ?? null, v.ip ?? null, v.ciudad ?? null]);

// Medianoche de hoy en Ecuador (UTC-5 todo el año, sin horario de verano), en UTC.
function inicioHoyEcuador() {
  const ec = new Date(Date.now() - 5 * 3600e3);
  return new Date(Date.UTC(ec.getUTCFullYear(), ec.getUTCMonth(), ec.getUTCDate(), 5));
}

test("registrar_visita guarda la visita con sus datos limpios", async () => {
  const { db } = await preparar();
  const r = await registrar(db, { ruta: "/", visitante: "abc-123_X", pais: "EC", dispositivo: "movil", procedencia: "www.google.com", ip: "186.4.20.7", ciudad: "Daule" });
  assert.equal(r.rows[0].ok, true);
  const { rows } = await db.query("select ruta, visitante, pais, dispositivo, procedencia, host(ip) ip, ciudad, creada_en from public.visitas");
  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0], creada_en: undefined }, { ruta: "/", visitante: "abc-123_X", pais: "EC", dispositivo: "movil", procedencia: "www.google.com", ip: "186.4.20.7", ciudad: "Daule", creada_en: undefined });
  assert.ok(Math.abs(rows[0].creada_en.getTime() - Date.now()) < 60e3);
});

test("registrar_visita descarta datos raros sin fallar y rechaza rutas inválidas", async () => {
  const { db } = await preparar();
  const r = await registrar(db, { ruta: "/terminos.html", visitante: "no vale!", pais: "ecuador", dispositivo: "nevera", procedencia: "x".repeat(300), ip: "999.1.1.1", ciudad: "c".repeat(100) });
  assert.equal(r.rows[0].ok, true);
  const { rows } = await db.query("select visitante, pais, dispositivo, procedencia, ip, ciudad from public.visitas");
  assert.deepEqual(rows[0], { visitante: null, pais: null, dispositivo: null, procedencia: null, ip: null, ciudad: null });
  await registrar(db, { ruta: "/", ip: "2800:bf0:1::7" }); // IPv6 también vale
  assert.equal((await db.query("select host(ip) ip from public.visitas where ip is not null")).rows[0].ip, "2800:bf0:1::7");
  for (const ruta of ["", "terminos.html", "/admin/", "/admin", "/" + "a".repeat(250)]) {
    assert.equal((await registrar(db, { ruta })).rows[0].ok, false, ruta);
  }
  assert.equal((await db.query("select count(*)::int n from public.visitas")).rows[0].n, 2);
});

test("la misma persona recargando la misma página en menos de 10 s cuenta una vez", async () => {
  const { db } = await preparar();
  assert.equal((await registrar(db, { ruta: "/", visitante: "v1" })).rows[0].ok, true);
  assert.equal((await registrar(db, { ruta: "/", visitante: "v1" })).rows[0].ok, false);
  assert.equal((await registrar(db, { ruta: "/terminos.html", visitante: "v1" })).rows[0].ok, true);
  assert.equal((await registrar(db, { ruta: "/", visitante: "v2" })).rows[0].ok, true);
  await db.query("update public.visitas set creada_en = now() - interval '11 seconds'");
  assert.equal((await registrar(db, { ruta: "/", visitante: "v1" })).rows[0].ok, true);
  assert.equal((await db.query("select count(*)::int n from public.visitas")).rows[0].n, 4);
});

test("el público y las cuentas que no son admin no registran ni leen visitas", async () => {
  const { db, otro } = await preparar();
  await registrar(db, { ruta: "/", visitante: "v1" });
  for (const quien of ["anon", otro]) {
    await assert.rejects(como(db, quien, "select public.registrar_visita('/', 'v9', null, null, null, null, null)"), /permission denied/);
    await assert.rejects(como(db, quien, "select public.borrar_ip_visitas()"), /permission denied/);
    await assert.rejects(como(db, quien, "insert into public.visitas (ruta) values ('/')"), /permission denied|row-level security/);
  }
  await assert.rejects(como(db, "anon", "select count(*) from public.visitas"), /permission denied/);
  assert.equal((await como(db, otro, "select count(*)::int n from public.visitas")).rows[0].n, 0);
  await assert.rejects(como(db, "anon", "select public.estadisticas_visitas()"), /permission denied/);
  const s = (await como(db, otro, "select public.estadisticas_visitas() s")).rows[0].s;
  assert.equal(s.visitas_total, 0);
});

test("estadisticas_visitas: personas únicas, hoy desde la medianoche de Ecuador y últimos 7 días", async () => {
  const { db, admin } = await preparar();
  const hoy = inicioHoyEcuador().getTime();
  const fila = (min, visitante) => db.query("insert into public.visitas (ruta, visitante, creada_en) values ('/', $1, $2)", [visitante, new Date(hoy + min * 60e3)]);
  await fila(1, "a");          // hoy, recién pasada la medianoche
  await fila(2, "a");          // la misma persona otra vez hoy
  await fila(-1, "b");         // ayer a las 23:59
  await fila(-3 * 1440, null); // hace 3 días, sin identificar (incógnito)
  await fila(-9 * 1440, "c");  // hace 9 días
  const s = (await como(db, admin, "select public.estadisticas_visitas() s")).rows[0].s;
  assert.deepEqual(s, {
    visitas_total: 5, personas_total: 3,
    visitas_hoy: 2, personas_hoy: 1,
    visitas_semana: 4, personas_semana: 2,
  });
  const { rows } = await como(db, admin, "select count(*)::int n from public.visitas");
  assert.equal(rows[0].n, 5);
});

test("borrar_ip_visitas: a los 30 días se borra la IP y se conserva la visita", async () => {
  const { db, admin } = await preparar();
  await registrar(db, { ruta: "/", visitante: "viejo", ip: "186.4.20.7", ciudad: "Daule" });
  await registrar(db, { ruta: "/", visitante: "nuevo", ip: "186.4.20.8", ciudad: "Guayaquil" });
  await db.query("update public.visitas set creada_en = now() - interval '31 days' where visitante = 'viejo'");
  const n = (await como(db, "service", "select public.borrar_ip_visitas() n")).rows[0].n;
  assert.equal(n, 1);
  const { rows } = await como(db, admin, "select visitante, host(ip) ip, ciudad from public.visitas order by visitante");
  assert.deepEqual(rows, [{ visitante: "nuevo", ip: "186.4.20.8", ciudad: "Guayaquil" }, { visitante: "viejo", ip: null, ciudad: "Daule" }]);
  assert.equal((await como(db, "service", "select public.borrar_ip_visitas() n")).rows[0].n, 0);
});
