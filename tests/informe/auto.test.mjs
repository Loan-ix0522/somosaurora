// /api/informe-auto (Vercel Cron, una vez al día): publica el informe cada 5 días si llegaron al menos 10
// opiniones nuevas; si no, deja el que está. Solo lo puede llamar el cron (Bearer CRON_SECRET).
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import handler from "../../api/informe-auto.js";
import { crearSupabase, opinion, URL_BASE } from "./supabase-falso.mjs";

const SITIO = "https://www.laauroraescucha.com";
const DIA = 864e5;
const SECRETO = "secreto-del-cron-1234";
let fetchOriginal, envOriginal, sb, consolaOriginal;

const pedir = (ruta = "/api/informe-auto", { metodo = "GET", auth = `Bearer ${SECRETO}` } = {}) =>
  new Request(SITIO + ruta, { method: metodo, headers: auth ? { authorization: auth } : {} });

// n opiniones repartidas en los últimos `dias` días (la más vieja a punto de cumplirlos)
function opiniones(n, dias, tema = "Agua potable y cortes", ahora = new Date()) {
  return Array.from({ length: n }, (_, i) => opinion(tema, ahora, ((i + 0.5) / n) * dias * DIA));
}
const informeHace = (dias, extra = {}) => {
  const hasta = new Date(Date.now() - dias * DIA);
  return { id: "inf-" + dias, created_at: hasta.toISOString(), origen: "automatico", periodo_desde: new Date(hasta.getTime() - 5 * DIA).toISOString(), periodo_hasta: hasta.toISOString(), total: 12, por_tema: [{ tema: "Basura y aseo", total: 12, porcentaje: 100 }], ...extra };
};
function montar(datos) { sb = crearSupabase(datos); globalThis.fetch = sb.fetch; }

beforeEach(() => {
  fetchOriginal = globalThis.fetch; envOriginal = { ...process.env }; consolaOriginal = console.log;
  console.log = () => {};
  process.env.SUPABASE_URL = URL_BASE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "clave-servicio";
  process.env.CRON_SECRET = SECRETO;
});
afterEach(() => { globalThis.fetch = fetchOriginal; process.env = envOriginal; console.log = consolaOriginal; });

test("el primer informe: sin ninguno publicado y con opiniones suficientes, publica el de los últimos 30 días", async () => {
  const ahora = new Date();
  montar({ opiniones: [...opiniones(8, 20, "Agua potable y cortes", ahora), ...opiniones(4, 20, "Calles y baches", ahora)] });
  const r = await handler(pedir());
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ok, true);
  assert.equal(d.publicado, true);
  assert.equal(d.total, 12);
  assert.equal(sb.estado.informes.length, 1);
  const fila = sb.estado.informes[0];
  assert.equal(fila.origen, "automatico");
  assert.equal(fila.total, 12);
  assert.equal(fila.por_tema[0].tema, "Agua potable y cortes");
  assert.equal(fila.por_tema[0].porcentaje, 67);
  assert.equal(fila.por_tema.reduce((a, t) => a + t.porcentaje, 0), 100);
  assert.ok(Math.abs(Date.parse(fila.periodo_hasta) - Date.now()) < 60_000, "corta ahora");
  assert.ok(Math.abs(Date.now() - Date.parse(fila.periodo_desde) - 30 * DIA) < 60_000, "arranca 30 días atrás");
});

test("cuando toca y alcanzan, el periodo arranca justo donde terminó el informe anterior y solo cuenta lo nuevo", async () => {
  const previo = informeHace(6);
  const corte = new Date(previo.periodo_hasta);
  const ahora = new Date();
  montar({
    informes: [previo],
    opiniones: [
      ...opiniones(11, 5, "Basura y aseo", ahora),                                   // 11 después del corte
      { tema: "Basura y aseo", created_at: new Date(corte.getTime() - 1).toISOString() }, // 1 ms antes: ya estaba en el anterior
      { tema: "Basura y aseo", created_at: corte.toISOString() },                      // justo en el corte: entra en este
    ],
  });
  const d = await (await handler(pedir())).json();
  assert.equal(d.publicado, true);
  assert.equal(d.total, 12);
  const fila = sb.estado.informes.at(-1);
  assert.equal(fila.periodo_desde, corte.toISOString());
  assert.equal(fila.total, 12);
  assert.equal(sb.estado.informes.length, 2);
});

test("todavía no toca (pasaron menos de 5 días): no cuenta, no escribe, se mantiene el informe", async () => {
  montar({ informes: [informeHace(2)], opiniones: opiniones(50, 2) });
  const d = await (await handler(pedir())).json();
  assert.equal(d.ok, true);
  assert.equal(d.publicado, false);
  assert.equal(d.motivo, "aun-no-toca");
  assert.equal(sb.de("submissions").length, 0);
  assert.equal(sb.estado.informes.length, 1);
});

test("toca pero llegaron pocas (menos de 10): se mantiene el informe y se sigue sumando", async () => {
  montar({ informes: [informeHace(7)], opiniones: opiniones(9, 6) });
  const d = await (await handler(pedir())).json();
  assert.equal(d.publicado, false);
  assert.equal(d.motivo, "pocas-opiniones");
  assert.equal(d.nuevas, 9);
  assert.equal(d.minimo, 10);
  assert.equal(sb.estado.informes.length, 1);
});

test("justo 10 opiniones ya alcanza", async () => {
  montar({ informes: [informeHace(5.5)], opiniones: opiniones(10, 5) });
  const d = await (await handler(pedir())).json();
  assert.equal(d.publicado, true);
  assert.equal(sb.estado.informes.length, 2);
});

test("si hay pocas y no sale, el periodo se alarga: cuando alcanzan sale uno que cubre todo desde el corte anterior", async () => {
  const previo = informeHace(8);
  montar({ informes: [previo], opiniones: opiniones(6, 7) });
  assert.equal((await (await handler(pedir())).json()).publicado, false);
  sb.estado.opiniones.push(...opiniones(5, 1));                    // llegan 5 más
  const d = await (await handler(pedir())).json();
  assert.equal(d.publicado, true);
  assert.equal(d.total, 11);
  assert.equal(sb.estado.informes.at(-1).periodo_desde, new Date(previo.periodo_hasta).toISOString());
});

test("es idempotente: si corre dos veces seguidas publica una sola vez", async () => {
  montar({ opiniones: opiniones(15, 10) });
  assert.equal((await (await handler(pedir())).json()).publicado, true);
  const segunda = await (await handler(pedir())).json();
  assert.equal(segunda.publicado, false);
  assert.equal(segunda.motivo, "aun-no-toca");
  assert.equal(sb.estado.informes.length, 1);
});

test("?dry=1 dice qué haría sin escribir nada", async () => {
  montar({ opiniones: opiniones(15, 10) });
  const d = await (await handler(pedir("/api/informe-auto?dry=1"))).json();
  assert.equal(d.ok, true);
  assert.equal(d.dry, true);
  assert.equal(d.publicaria, true);
  assert.equal(d.total, 15);
  assert.equal(sb.estado.informes.length, 0);
  assert.equal(sb.de("informe_publico").filter((l) => l.metodo === "POST").length, 0);
});

test("solo el cron: sin encabezado o con otro secreto responde 401 y no toca la base", async () => {
  montar({ opiniones: opiniones(15, 10) });
  assert.equal((await handler(pedir("/api/informe-auto", { auth: null }))).status, 401);
  assert.equal((await handler(pedir("/api/informe-auto", { auth: "Bearer otro-secreto-cualquiera" }))).status, 401);
  assert.equal((await handler(pedir("/api/informe-auto", { auth: SECRETO }))).status, 401);
  assert.equal(sb.estado.llamadas.length, 0);
});

test("sin CRON_SECRET (o demasiado corto) no hace nada: 503", async () => {
  montar({ opiniones: opiniones(15, 10) });
  delete process.env.CRON_SECRET;
  assert.equal((await handler(pedir("/api/informe-auto", { auth: "Bearer " }))).status, 503);
  process.env.CRON_SECRET = "corto";
  assert.equal((await handler(pedir("/api/informe-auto", { auth: "Bearer corto" }))).status, 503);
  assert.equal(sb.estado.llamadas.length, 0);
});

test("solo GET", async () => {
  montar({});
  assert.equal((await handler(pedir("/api/informe-auto", { metodo: "POST" }))).status, 405);
});

test("si falta la migración 0007 lo dice claro y no escribe", async () => {
  montar({ sinTabla: true, opiniones: opiniones(15, 10) });
  const r = await handler(pedir());
  assert.equal(r.status, 500);
  const d = await r.json();
  assert.equal(d.ok, false);
  assert.match(d.error, /0007/);
});

test("si la base falla responde 500 genérico, sin detalles internos, y no guarda nada", async () => {
  montar({ opiniones: opiniones(15, 10) });
  sb.estado.falla = (ruta) => ruta === "submissions";
  const r = await handler(pedir());
  assert.equal(r.status, 500);
  const txt = await r.text();
  assert.deepEqual(JSON.parse(txt), { ok: false, error: "No se pudo calcular el informe." });
  assert.equal(sb.estado.informes.length, 0);

  montar({ opiniones: opiniones(15, 10) });
  sb.estado.falla = (ruta, metodo) => ruta === "informe_publico" && metodo === "POST";
  const r2 = await handler(pedir());
  assert.equal(r2.status, 500);
  assert.deepEqual(await r2.json(), { ok: false, error: "No se pudo guardar el informe." });
});

test("usa la service role y nunca devuelve el texto de las opiniones", async () => {
  montar({ opiniones: opiniones(15, 10) });
  const d = await (await handler(pedir())).json();
  assert.ok(sb.estado.llamadas.every((l) => l.init.headers.apikey === "clave-servicio"));
  assert.deepEqual(Object.keys(d).sort(), ["desde", "hasta", "ok", "origen", "publicado", "total"]);
});
