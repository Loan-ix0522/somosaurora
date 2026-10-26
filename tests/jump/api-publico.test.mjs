// Lo público de la página de JUMP (/jump/) → /api/jump-publico: la próxima clase, la encuesta y el voto de cualquier
// visitante. Contra el Supabase simulado.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { iniciarSim } from "./sim/servidor.mjs";
import { crearEscenario } from "./sim/escenario.mjs";
import { crearBase } from "./sim/db.mjs";

let sim, X;
before(async () => { sim = await iniciarSim(); X = await crearEscenario(sim.db); });
after(() => sim.cerrar());

const sql = (q, p) => sim.db.query(q, p);
const uno = async (q, p) => (await sql(q, p)).rows[0];
async function leer(s = sim) {
  const r = await fetch(s.url + "/api/jump-publico");
  return { status: r.status, cache: r.headers.get("cache-control"), ...(await r.json()) };
}
async function votar(cuerpo, { origin, ip = "203.0.113.7", metodo = "POST" } = {}) {
  const headers = { "Content-Type": "application/json", "X-Forwarded-For": ip };
  if (origin !== null) headers.Origin = origin ?? sim.url;
  const r = await fetch(sim.url + "/api/jump-publico", { method: metodo, headers, body: JSON.stringify(cuerpo) });
  return { status: r.status, ...(await r.json()) };
}
const disp = (n) => `aparato-de-prueba-${String(n).padStart(4, "0")}`;

// Cada caso arranca sin encuestas; abierta() crea una abierta real con dos opciones.
beforeEach(async () => { await sql("delete from jump_encuestas"); });
async function encuesta(pregunta, estado, { ejemplo = false, cerradaHace = 0 } = {}) {
  const { id } = await uno("insert into jump_encuestas (pregunta, estado, es_ejemplo) values ($1, $2, $3) returning id", [pregunta, estado, ejemplo]);
  if (cerradaHace) await sql("update jump_encuestas set cerrada_en = now() - make_interval(days => $2) where id = $1", [id, cerradaHace]);
  const o1 = (await uno("insert into jump_encuesta_opciones (encuesta_id, texto, orden) values ($1, 'Feria de Navidad', 1) returning id", [id])).id;
  const o2 = (await uno("insert into jump_encuesta_opciones (encuesta_id, texto, orden) values ($1, 'Fotos para redes', 2) returning id", [id])).id;
  return { id, o1, o2 };
}

test("GET da la próxima clase sin datos privados y sin ejemplos ni borradores", async () => {
  await sql("update jump_clases set mensaje = 'Traigan su cédula', grabacion_url = 'https://youtu.be/x' where id = $1", [X.C1]);
  let r = await leer();
  assert.equal(r.status, 200);
  assert.equal(r.cache, "public, max-age=30");
  assert.deepEqual(Object.keys(r.clase).sort(), ["duracionMin", "iniciaEn", "titulo"]);
  assert.equal(r.clase.titulo, "Dudas del RUC");
  assert.equal(r.clase.duracionMin, 60);
  assert.doesNotMatch(JSON.stringify(r), /zoom|cédula|youtu/i);
  await sql("update jump_clases set es_ejemplo = true where id = $1", [X.C1]);
  r = await leer();
  assert.equal(r.clase.titulo, "Ventas por WhatsApp", "C2 es de una mentoría en borrador: no sale");
  await sql("update jump_clases set es_ejemplo = false where id = $1", [X.C1]);
});

test("GET muestra una clase que ya empezó mientras sigue en vivo, y no una terminada", async () => {
  const { id } = await uno("insert into jump_clases (titulo, inicia_en, duracion_min) values ('Clase que empezó', now() - interval '20 minutes', 60) returning id");
  const { id: vieja } = await uno("insert into jump_clases (titulo, inicia_en, duracion_min) values ('Clase de ayer', now() - interval '1 day', 60) returning id");
  try { assert.equal((await leer()).clase.titulo, "Clase que empezó"); }
  finally { await sql("delete from jump_clases where id = any($1)", [[id, vieja]]); }
});

test("GET sin encuesta abierta muestra la última cerrada; sin ninguna, null", async () => {
  assert.equal((await leer()).encuesta, null);
  await encuesta("¿Qué taller hicimos primero?", "cerrada", { cerradaHace: 30 });
  const reciente = await encuesta("¿Qué taller quieres en noviembre?", "cerrada", { cerradaHace: 2 });
  await encuesta("Borrador que nadie ve", "borrador");
  let r = await leer();
  assert.equal(r.encuesta.id, reciente.id);
  assert.equal(r.encuesta.estado, "cerrada");
  const abierta = await encuesta("¿Qué curso quieres para diciembre?", "abierta");
  r = await leer();
  assert.equal(r.encuesta.id, abierta.id);
  assert.equal(r.encuesta.estado, "abierta");
  assert.deepEqual(r.encuesta.opciones.map((o) => [o.texto, o.porcentaje]), [["Feria de Navidad", 0], ["Fotos para redes", 0]]);
  assert.deepEqual(Object.keys(r.encuesta.opciones[0]).sort(), ["id", "porcentaje", "texto"]);
  assert.deepEqual(Object.keys(r.encuesta).sort(), ["estado", "id", "opciones", "pregunta"]);
});

test("GET nunca devuelve encuestas de ejemplo", async () => {
  await encuesta("Encuesta de ejemplo abierta", "abierta", { ejemplo: true });
  assert.equal((await leer()).encuesta, null);
  const real = await encuesta("Encuesta real ya cerrada", "cerrada", { cerradaHace: 1 });
  assert.equal((await leer()).encuesta.id, real.id);
});

test("votar: un voto por aparato, cambiarlo no duplica", async () => {
  const e = await encuesta("¿Qué curso quieres?", "abierta");
  let r = await votar({ opcion: e.o1, dispositivo: disp(1) }, { ip: "198.51.100.23" });
  assert.equal(r.status, 200);
  assert.equal(r.ok, true);
  assert.deepEqual(r.encuesta.opciones.map((o) => o.porcentaje), [100, 0]);
  r = await votar({ opcion: e.o2, dispositivo: disp(1) }, { ip: "198.51.100.23" });
  assert.deepEqual(r.encuesta.opciones.map((o) => o.porcentaje), [0, 100]);
  const filas = (await sql("select * from jump_encuesta_votos where encuesta_id = $1", [e.id])).rows;
  assert.equal(filas.length, 1);
  assert.equal(filas[0].origen, "publico");
  assert.equal(filas[0].opcion_id, e.o2);
  assert.equal(filas[0].user_id, null);
  assert.ok(filas[0].dispositivo_hash && !filas[0].dispositivo_hash.includes("aparato"), filas[0].dispositivo_hash);
  assert.ok(filas[0].ip_hash && !filas[0].ip_hash.includes("198.51"), filas[0].ip_hash);
  assert.notEqual(filas[0].dispositivo_hash, filas[0].ip_hash);
});

test("votar valida origen, método, cuerpo y opción", async () => {
  const e = await encuesta("¿Qué curso quieres?", "abierta");
  const otra = await encuesta("Encuesta vieja", "cerrada", { cerradaHace: 3 });
  assert.equal((await votar({ opcion: e.o1, dispositivo: disp(2) }, { origin: "https://malo.com" })).status, 403);
  assert.equal((await votar({ opcion: e.o1, dispositivo: disp(2) }, { origin: null })).status, 403);
  assert.equal((await votar({ opcion: e.o1, dispositivo: disp(2) }, { metodo: "PUT" })).status, 405);
  let r = await votar({ opcion: "no-es-uuid", dispositivo: disp(2) });
  assert.equal(r.status, 400); assert.equal(r.campo, "opcion");
  for (const d of ["corto", "x".repeat(65), "con espacios y ñ 1234567", 12345678901234567]) {
    r = await votar({ opcion: e.o1, dispositivo: d });
    assert.equal(r.status, 400, String(d)); assert.equal(r.campo, "dispositivo");
  }
  r = await votar({ opcion: otra.o1, dispositivo: disp(2) });
  assert.equal(r.status, 409);
  assert.ok(r.error.length > 5);
  r = await votar({ opcion: "11111111-1111-4111-8111-111111111111", dispositivo: disp(2) });
  assert.equal(r.status, 409, "una opción que no existe");
  const big = await fetch(sim.url + "/api/jump-publico", { method: "POST", headers: { "Content-Type": "application/json", Origin: sim.url },
    body: JSON.stringify({ opcion: e.o1, dispositivo: disp(2), relleno: "x".repeat(2000) }) });
  assert.equal(big.status, 400, "cuerpo de más de 1 KB");
  assert.equal((await sql("select 1 from jump_encuesta_votos where encuesta_id = $1", [e.id])).rows.length, 0);
});

test("en una encuesta de ejemplo no se vota desde la página", async () => {
  const e = await encuesta("Encuesta de ejemplo", "abierta", { ejemplo: true });
  assert.equal((await votar({ opcion: e.o1, dispositivo: disp(3) })).status, 409);
});

test("tope por conexión: el aparato 31 desde la misma IP → 429, otra IP sí", async () => {
  const e = await encuesta("¿Qué curso quieres?", "abierta");
  for (let i = 0; i < 30; i++) assert.equal((await votar({ opcion: e.o1, dispositivo: disp(100 + i) }, { ip: "192.0.2.50" })).status, 200, `aparato ${i + 1}`);
  const r = await votar({ opcion: e.o1, dispositivo: disp(200) }, { ip: "192.0.2.50" });
  assert.equal(r.status, 429);
  assert.ok(r.error.length > 5);
  assert.equal((await votar({ opcion: e.o2, dispositivo: disp(100) }, { ip: "192.0.2.50" })).status, 200, "cambiar el voto de uno que ya votó sí");
  assert.equal((await votar({ opcion: e.o1, dispositivo: disp(200) }, { ip: "192.0.2.51" })).status, 200);
});

test("tope por conexión con 60 votos a la vez desde la misma IP: entran 30", async () => {
  const e = await encuesta("¿Qué curso quieres?", "abierta");
  const r = await Promise.all(Array.from({ length: 60 }, (_, i) => votar({ opcion: e.o1, dispositivo: disp(300 + i) }, { ip: "192.0.2.77" })));
  const n = (await uno("select count(*)::int n from jump_encuesta_votos where encuesta_id = $1", [e.id])).n;
  assert.equal(n, 30);
  assert.equal(r.filter((x) => x.status === 200).length, 30);
  assert.equal(r.filter((x) => x.status === 429).length, 30);
});

test("tope por conexión en IPv6: las direcciones de una misma red /64 cuentan como una conexión", async () => {
  const e = await encuesta("¿Qué curso quieres?", "abierta");
  for (let i = 0; i < 30; i++)
    assert.equal((await votar({ opcion: e.o1, dispositivo: disp(400 + i) }, { ip: `2001:db8:a:b:${(i + 1).toString(16)}::1` })).status, 200, `aparato ${i + 1}`);
  assert.equal((await votar({ opcion: e.o1, dispositivo: disp(500) }, { ip: "2001:0db8:000a:000b:ffff:1:2:3" })).status, 429);
  assert.equal((await votar({ opcion: e.o1, dispositivo: disp(501) }, { ip: "2001:db8:a:c::1" })).status, 200, "otra red /64 sí");
});

test("sin la tabla de encuestas (falta la 0003) GET responde 200 con encuesta null", async () => {
  const s = await iniciarSim({ db: await crearBase({ hasta: "0002" }) });
  try {
    const r = await leer(s);
    assert.equal(r.status, 200);
    assert.equal(r.encuesta, null);
    assert.equal(r.clase, null);
    const v = await fetch(s.url + "/api/jump-publico", { method: "POST", headers: { "Content-Type": "application/json", Origin: s.url },
      body: JSON.stringify({ opcion: "11111111-1111-4111-8111-111111111111", dispositivo: disp(1) }) });
    assert.equal(v.status, 409);
  } finally { s.cerrar(); }
});
