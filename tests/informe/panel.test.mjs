// /admin/panel-informe.js: la pestaña «Informe público» del panel. Muestra el informe que ve el público, deja
// preparar uno por fechas (calcular → publicar) y retirar uno. Las cifras las cuenta el servidor (/api/informe-admin).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const P = require("../../admin/panel-informe.js");
const leer = (f) => readFileSync(new URL("../../" + f, import.meta.url), "utf8");
const DIA = 864e5;
const AHORA = new Date("2026-10-26T15:30:00.000Z"); // 10:30 del 26 de octubre en Ecuador

const TEMAS = [
  { tema: "Agua potable y cortes", total: 8, porcentaje: 62 }, { tema: "Calles y baches", total: 5, porcentaje: 38 },
  { tema: "Basura y aseo", total: 0, porcentaje: 0 },
];
const informe = (extra = {}) => ({
  id: "i1", created_at: "2026-10-21T13:00:00+00:00", origen: "automatico",
  periodo_desde: "2026-10-16T13:00:00+00:00", periodo_hasta: "2026-10-21T13:00:00+00:00", total: 13, por_tema: TEMAS, ...extra,
});

// ---------- lógica sin pantalla ----------

test("fechaEc: el día de Ecuador de un instante (hasta las 05:00 UTC todavía es el día anterior)", () => {
  assert.equal(P.fechaEc(new Date("2026-10-26T15:30:00Z")), "2026-10-26");
  assert.equal(P.fechaEc(new Date("2026-10-26T04:59:00Z")), "2026-10-25");
  assert.equal(P.fechaEc(new Date("2026-10-26T05:00:00Z")), "2026-10-26");
});

test("periodo: 'del 16 oct al 21 oct'; el corte es exclusivo, así que un informe que corta a la medianoche termina el día anterior", () => {
  assert.equal(P.periodo("2026-10-16T13:00:00Z", "2026-10-21T13:00:00Z"), "16 oct – 21 oct");
  assert.equal(P.periodo("2026-10-10T05:00:00Z", "2026-10-12T05:00:00Z"), "10 oct – 11 oct");
  assert.equal(P.periodo("2026-10-26T05:00:00Z", "2026-10-27T05:00:00Z"), "26 oct");
  assert.equal(P.periodo("basura", null), "—");
});

test("estadoProximo: fecha del próximo automático, o qué falta si ya tocaba", () => {
  const ult = informe({ periodo_hasta: "2026-10-24T13:00:00Z" });
  const futuro = P.estadoProximo(ult, 3, AHORA);
  assert.equal(futuro.valor, "29 oct");
  assert.match(futuro.nota, /10 opiniones/);

  const vencido = informe({ periodo_hasta: "2026-10-20T13:00:00Z" });
  const falta = P.estadoProximo(vencido, 4, AHORA);
  assert.match(falta.valor, /esperando/i);
  assert.match(falta.nota, /faltan 6/);
  const listo = P.estadoProximo(vencido, 12, AHORA);
  assert.match(listo.nota, /revisión diaria/i);
  assert.equal(P.estadoProximo(null, 0, AHORA), null);
});

test("falta: reconoce el error de 'la tabla no existe' (migración 0007 sin aplicar)", () => {
  assert.equal(P.falta({ code: "PGRST205", message: "x" }), true);
  assert.equal(P.falta({ code: "42P01", message: "x" }), true);
  assert.equal(P.falta({ code: "500", message: "Could not find the table 'public.informe_publico' in the schema cache" }), true);
  assert.equal(P.falta({ code: "500", message: "boom" }), false);
  assert.equal(P.falta(null), false);
});

// ---------- base falsa (imita lo que usa supabase-js) ----------
function dbFalso({ informes = [], sinTabla = false, nuevas = 0, token = "token-del-admin", borra = true, falla = null } = {}) {
  const llamadas = [];
  const lista = [...informes];
  const resolver = (q) => {
    if (falla && falla(q)) return { data: null, count: null, error: { code: "500", message: "boom" } };
    if (q.tabla === "informe_publico" && sinTabla) return { data: null, error: { code: "PGRST205", message: "Could not find the table" } };
    if (q.tabla === "informe_publico" && q.op === "delete") {
      if (!borra) return { data: [], error: null };
      const id = q.filtros.find((f) => f[0] === "eq" && f[1] === "id")[2];
      const i = lista.findIndex((x) => x.id === id);
      if (i >= 0) lista.splice(i, 1);
      return { data: i >= 0 ? [{ id }] : [], error: null };
    }
    if (q.tabla === "informe_publico") return { data: [...lista].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, q.limite || 99), error: null };
    if (q.tabla === "submissions") return { count: nuevas, data: null, error: null };
    return { data: null, error: { message: "tabla no simulada" } };
  };
  const db = {
    llamadas, lista,
    auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) },
    from(tabla) {
      const q = { tabla, op: "select", filtros: [] };
      const api = {
        select(c, o) { q.cols = c; q.opts = o; return api; },
        order(c, o) { q.orden = [c, o]; return api; },
        limit(n) { q.limite = n; return api; },
        gte(c, v) { q.filtros.push(["gte", c, v]); return api; },
        delete() { q.op = "delete"; return api; },
        eq(c, v) { q.filtros.push(["eq", c, v]); return api; },
        then(ok, no) { llamadas.push(q); return Promise.resolve(resolver(q)).then(ok, no); },
      };
      return api;
    },
  };
  return db;
}

test("cargar: trae los informes del más nuevo al más viejo y cuenta las opiniones llegadas desde el corte del último", async () => {
  const db = dbFalso({ informes: [informe({ id: "viejo", created_at: "2026-10-16T13:00:00+00:00" }), informe({ id: "nuevo" })], nuevas: 7 });
  const r = await P.cargar(db);
  assert.equal(r.listo, true);
  assert.deepEqual(r.informes.map((x) => x.id), ["nuevo", "viejo"]);
  assert.equal(r.nuevas, 7);
  const [a, b] = db.llamadas;
  assert.equal(a.tabla, "informe_publico");
  assert.deepEqual(a.orden, ["created_at", { ascending: false }]);
  assert.equal(a.limite, 50);
  assert.equal(b.tabla, "submissions");
  assert.deepEqual(b.opts, { count: "exact", head: true });
  assert.deepEqual(b.filtros, [["gte", "created_at", "2026-10-21T13:00:00+00:00"]]);
});

test("cargar: sin informes no cuenta nada más; sin la migración 0007 avisa; un error real se propaga", async () => {
  const vacio = dbFalso({ informes: [] });
  assert.deepEqual(await P.cargar(vacio), { listo: true, informes: [], nuevas: null });
  assert.equal(vacio.llamadas.length, 1);
  assert.deepEqual(await P.cargar(dbFalso({ sinTabla: true })), { listo: false });
  await assert.rejects(P.cargar(dbFalso({ informes: [informe()], falla: (q) => q.tabla === "informe_publico" })), /boom/);
});

test("cargar: si falla el conteo de nuevas igual muestra los informes (solo falta ese dato)", async () => {
  const r = await P.cargar(dbFalso({ informes: [informe()], falla: (q) => q.tabla === "submissions" }));
  assert.equal(r.listo, true);
  assert.equal(r.nuevas, null);
  assert.equal(r.informes.length, 1);
});

test("llamar: manda la sesión del admin y solo accion, desde y hasta; devuelve lo que contó el servidor", async () => {
  const pedidos = [];
  const f = async (url, init) => { pedidos.push({ url, init }); return { ok: true, json: async () => ({ ok: true, total: 3 }) }; };
  const r = await P.llamar(dbFalso(), "calcular", "2026-10-10", "2026-10-11", f);
  assert.deepEqual(r, { ok: true, total: 3 });
  assert.equal(pedidos[0].url, "/api/informe-admin");
  assert.equal(pedidos[0].init.method, "POST");
  assert.equal(pedidos[0].init.headers.Authorization, "Bearer token-del-admin");
  assert.deepEqual(JSON.parse(pedidos[0].init.body), { accion: "calcular", desde: "2026-10-10", hasta: "2026-10-11" });
});

test("llamar: sin sesión pide volver a entrar sin llamar; si el servidor rechaza, muestra su mensaje", async () => {
  let llamado = false;
  const f = async () => { llamado = true; return { ok: true, json: async () => ({}) }; };
  await assert.rejects(P.llamar(dbFalso({ token: null }), "calcular", "2026-10-10", "2026-10-11", f), /sesión/i);
  assert.equal(llamado, false);
  const no = async () => ({ ok: false, status: 400, json: async () => ({ ok: false, error: "La fecha «Hasta» todavía no llega." }) });
  await assert.rejects(P.llamar(dbFalso(), "publicar", "2026-10-10", "2999-01-01", no), /todavía no llega/);
  const caido = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(P.llamar(dbFalso(), "publicar", "2026-10-10", "2026-10-11", caido), /conexión/i);
  const raro = async () => ({ ok: false, status: 502, json: async () => { throw new Error("no json"); } });
  await assert.rejects(P.llamar(dbFalso(), "publicar", "2026-10-10", "2026-10-11", raro), /no se pudo/i);
});

test("retirar: borra el informe elegido; si no borró nada (no eres admin) lo dice en vez de fingir", async () => {
  const db = dbFalso({ informes: [informe()] });
  await P.retirar(db, "i1");
  assert.equal(db.lista.length, 0);
  const q = db.llamadas[0];
  assert.equal(q.op, "delete");
  assert.deepEqual(q.filtros, [["eq", "id", "i1"]]);
  await assert.rejects(P.retirar(dbFalso({ informes: [informe()], borra: false }), "i1"), /administrador|no se pudo/i);
  await assert.rejects(P.retirar(dbFalso({ informes: [informe()], falla: () => true }), "i1"), /boom/);
});

// ---------- pantalla (con un DOM falso mínimo) ----------
const esperar = () => new Promise((r) => setImmediate(r));
function panelFalso() {
  const el = () => ({ innerHTML: "", value: "", disabled: false, textContent: "" });
  const nodos = {};
  for (const k of ["actual", "prev", "historial", "desde", "hasta", "recargar", "calcular"]) nodos[`[data-inf="${k}"]`] = el();
  const oyentes = {};
  const objetivo = (selector, dataset) => {
    const o = { dataset, closest: (s) => (s.split(",").map((x) => x.trim()).includes(selector) ? o : null) };
    return o;
  };
  return {
    nodos,
    querySelector: (s) => nodos[s] ?? null,
    addEventListener: (t, f) => (oyentes[t] ||= []).push(f),
    async clic(selector, dataset = {}) { for (const f of oyentes.click || []) await f({ target: objetivo(selector, dataset) }); await esperar(); },
    async escribir(selector, valor) { nodos[selector].value = valor; for (const f of oyentes.input || []) await f({ target: objetivo(selector, {}) }); },
    get actual() { return nodos['[data-inf="actual"]'].innerHTML; },
    get prev() { return nodos['[data-inf="prev"]'].innerHTML; },
    get historial() { return nodos['[data-inf="historial"]'].innerHTML; },
    get desde() { return nodos['[data-inf="desde"]'].value; },
    get hasta() { return nodos['[data-inf="hasta"]'].value; },
  };
}
const respuestaOk = (cuerpo) => async () => ({ ok: true, json: async () => cuerpo });
const CALCULO = { ok: true, accion: "calcular", total: 3, desde: "2026-10-10T05:00:00.000Z", hasta: "2026-10-12T05:00:00.000Z",
  temas: [{ tema: "Basura y aseo", total: 2, porcentaje: 67 }, { tema: "Agua potable y cortes", total: 1, porcentaje: 33 }, { tema: "Otro servicio", total: 0, porcentaje: 0 }] };

async function montar(datos = {}, opciones = {}) {
  const db = dbFalso({ informes: [informe()], nuevas: 7, ...datos });
  const panel = panelFalso();
  const pedidos = [];
  const confirmaciones = [];
  const o = {
    ahora: opciones.ahora || (() => AHORA),
    fetch: async (url, init) => { pedidos.push({ url, init }); return (opciones.fetch || respuestaOk(CALCULO))(url, init); },
    confirm: (t) => { confirmaciones.push(t); return opciones.confirmar ?? true; },
  };
  await P.montar(db, panel, o);
  return { db, panel, pedidos, confirmaciones };
}

test("al abrir muestra el informe que ve el público: periodo, origen, opiniones, nuevas desde el corte y cuándo toca el próximo", async () => {
  const { panel } = await montar({}, { ahora: () => new Date("2026-10-24T15:30:00.000Z") });
  assert.match(panel.actual, /13/);
  assert.match(panel.actual, /16 oct – 21 oct/);
  assert.match(panel.actual, /Automático/);
  assert.match(panel.actual, /Agua potable y cortes[\s\S]*62%/);
  assert.match(panel.actual, /Calles y baches[\s\S]*38%/);
  assert.doesNotMatch(panel.actual, /Basura y aseo/, "los temas sin opiniones no se dibujan");
  assert.match(panel.actual, />7</, "7 opiniones nuevas desde el corte");
  assert.match(panel.actual, /26 oct/, "próximo automático: corte + 5 días");
});

test("si ya tocaba el próximo y faltan opiniones, el panel dice cuántas faltan (no una fecha que ya pasó)", async () => {
  const { panel } = await montar({ nuevas: 7 });   // ahora = 26 oct 10:30; el corte fue el 21 oct 08:00
  assert.match(panel.actual, /Esperando opiniones/);
  assert.match(panel.actual, /faltan 3 para llegar a 10/);
  assert.doesNotMatch(panel.actual, /26 oct/);
});

test("al abrir deja listas las fechas del formulario: los últimos 5 días, en días de Ecuador; no pisa lo que ya escribió", async () => {
  const { panel } = await montar();
  assert.equal(panel.hasta, "2026-10-26");
  assert.equal(panel.desde, "2026-10-22");
  const otro = panelFalso();
  otro.nodos['[data-inf="desde"]'].value = "2026-10-01";
  await P.montar(dbFalso({ informes: [] }), otro, { ahora: () => AHORA, fetch: respuestaOk({}), confirm: () => true });
  assert.equal(otro.desde, "2026-10-01");
});

test("el historial lista los informes, marca el que se ve en la web y ofrece retirar cada uno", async () => {
  const { panel } = await montar({ informes: [informe({ id: "viejo", created_at: "2026-10-16T13:00:00+00:00", origen: "manual" }), informe({ id: "nuevo" })] });
  assert.equal((panel.historial.match(/data-retirar=/g) || []).length, 2);
  assert.match(panel.historial, /data-retirar="nuevo"/);
  assert.match(panel.historial, /Manual/);
  assert.match(panel.historial, /Automático/);
  assert.equal((panel.historial.match(/Se muestra en la web/g) || []).length, 1);
  assert.ok(panel.historial.indexOf("data-retirar=\"nuevo\"") < panel.historial.indexOf("data-retirar=\"viejo\""));
});

test("sin informes publicados explica que la web muestra el conteo de 30 días y que el primero sale solo o a mano", async () => {
  const { panel } = await montar({ informes: [] });
  assert.match(panel.actual, /Todavía no hay un informe publicado/);
  assert.match(panel.actual, /30 días/);
  assert.doesNotMatch(panel.historial, /data-retirar/);
});

test("sin la migración 0007 lo dice claro y no deja publicar", async () => {
  const { panel } = await montar({ sinTabla: true });
  assert.match(panel.actual, /0007/);
});

test("Calcular: manda las fechas elegidas, enseña la vista previa con los porcentajes y ofrece publicar", async () => {
  const { panel, pedidos } = await montar();
  await panel.escribir('[data-inf="desde"]', "2026-10-10");
  await panel.escribir('[data-inf="hasta"]', "2026-10-11");
  await panel.clic('[data-inf="calcular"]');
  assert.deepEqual(JSON.parse(pedidos[0].init.body), { accion: "calcular", desde: "2026-10-10", hasta: "2026-10-11" });
  assert.match(panel.prev, /Basura y aseo[\s\S]*67%/);
  assert.match(panel.prev, /3 opiniones/);
  assert.match(panel.prev, /10 oct – 11 oct/);
  assert.match(panel.prev, /data-inf="publicar"/);
  assert.doesNotMatch(panel.prev, /Otro servicio/);
});

test("Calcular sin opiniones en esas fechas: lo avisa y no ofrece publicar", async () => {
  const vacio = { ...CALCULO, total: 0, temas: CALCULO.temas.map((t) => ({ ...t, total: 0, porcentaje: 0 })) };
  const { panel } = await montar({}, { fetch: respuestaOk(vacio) });
  await panel.clic('[data-inf="calcular"]');
  assert.match(panel.prev, /No hay opiniones en esas fechas/);
  assert.doesNotMatch(panel.prev, /data-inf="publicar"/);
});

test("Calcular con error del servidor muestra el mensaje y no deja publicar", async () => {
  const mal = async () => ({ ok: false, status: 400, json: async () => ({ ok: false, error: "El periodo no puede pasar de 31 días." }) });
  const { panel } = await montar({}, { fetch: mal });
  await panel.clic('[data-inf="calcular"]');
  assert.match(panel.prev, /no puede pasar de 31 días/);
  assert.doesNotMatch(panel.prev, /data-inf="publicar"/);
});

test("Publicar: pide confirmar con los datos de la vista previa; si dice que no, no se publica nada", async () => {
  const { panel, pedidos, confirmaciones } = await montar({}, { confirmar: false });
  await panel.clic('[data-inf="calcular"]');
  await panel.clic('[data-inf="publicar"]');
  assert.equal(confirmaciones.length, 1);
  assert.match(confirmaciones[0], /3 opiniones/);
  assert.match(confirmaciones[0], /10 oct – 11 oct/);
  assert.equal(pedidos.length, 1, "solo el cálculo; no se llamó a publicar");
});

test("Publicar con confirmación: publica lo que se vio (no lo que haya en los campos ahora), recarga y avisa", async () => {
  const respuestas = [CALCULO, { ok: true, accion: "publicar", publicado: true, total: 3 }];
  const { panel, pedidos, db } = await montar({}, { fetch: async () => ({ ok: true, json: async () => respuestas.shift() }) });
  await panel.escribir('[data-inf="desde"]', "2026-10-10");
  await panel.escribir('[data-inf="hasta"]', "2026-10-11");
  await panel.clic('[data-inf="calcular"]');
  const antes = db.llamadas.length;
  await panel.clic('[data-inf="publicar"]');
  assert.deepEqual(JSON.parse(pedidos[1].init.body), { accion: "publicar", desde: "2026-10-10", hasta: "2026-10-11" });
  assert.match(panel.prev, /Informe publicado/);
  assert.ok(db.llamadas.length > antes, "recargó el informe y el historial");
});

test("si cambias las fechas después de calcular, la vista previa se borra: no se publica algo que no viste", async () => {
  const { panel } = await montar();
  await panel.clic('[data-inf="calcular"]');
  assert.match(panel.prev, /data-inf="publicar"/);
  await panel.escribir('[data-inf="desde"]', "2026-10-01");
  assert.equal(panel.prev, "");
  await panel.clic('[data-inf="publicar"]');   // un clic suelto ya no hace nada
  assert.equal(panel.prev, "");
});

test("Retirar: confirma, borra ese informe y recarga; si dice que no, no borra", async () => {
  const no = await montar({ informes: [informe()] }, { confirmar: false });
  await no.panel.clic("[data-retirar]", { retirar: "i1" });
  assert.equal(no.db.lista.length, 1);

  const si = await montar({ informes: [informe({ id: "viejo", created_at: "2026-10-16T13:00:00+00:00" }), informe({ id: "nuevo" })] });
  await si.panel.clic("[data-retirar]", { retirar: "nuevo" });
  assert.match(si.confirmaciones[0], /anterior/i, "avisa que volverá a verse el anterior");
  assert.deepEqual(si.db.lista.map((x) => x.id), ["viejo"]);
  assert.match(si.panel.historial, /data-retirar="viejo"/);
  assert.doesNotMatch(si.panel.historial, /data-retirar="nuevo"/);
});

test("Recargar vuelve a pedir todo; escapa lo que viene de la base", async () => {
  const { panel, db } = await montar({ informes: [informe({ por_tema: [{ tema: '<img src=x onerror="alert(1)">', total: 5, porcentaje: 100 }] })] });
  assert.doesNotMatch(panel.actual, /<img/);
  assert.match(panel.actual, /&lt;img/);
  const antes = db.llamadas.length;
  await panel.clic('[data-inf="recargar"]');
  assert.ok(db.llamadas.length > antes);
});

// ---------- la página del panel ----------
test("admin/index.html: pestaña «Informe público» con su sección, el script con ruta absoluta y el montaje al abrirla", () => {
  const html = leer("admin/index.html");
  assert.match(html, /<script src="\/admin\/panel-informe\.js"><\/script>/);
  assert.match(html, /<button[^>]*role="tab"[^>]*id="tab-informe"[^>]*aria-controls="pane-informe"[^>]*aria-selected="false"/);
  const m = html.match(/<section id="pane-informe"[^>]*>([\s\S]*?)<\/section>/);
  assert.ok(m, "falta la sección pane-informe");
  assert.match(m[0].slice(0, m[0].indexOf(">") + 1), /role="tabpanel"[^>]*\bhidden\b|\bhidden\b[^>]*role="tabpanel"/);
  for (const k of ["actual", "prev", "historial", "desde", "hasta", "calcular", "recargar"]) assert.match(m[1], new RegExp(`data-inf="${k}"`), k);
  assert.match(m[1], /id="informePanel"/);
  assert.match(html, /AuroraInforme\.montar\(db, \$\('#informePanel'\)\)/);
  assert.match(html, /#informe/);
});

test("las tres pestañas conviven: Opiniones sigue abierta al entrar y Visitas no cambia", () => {
  const html = leer("admin/index.html");
  assert.match(html, /<button[^>]*role="tab"[^>]*aria-controls="pane-opiniones"[^>]*aria-selected="true"/);
  assert.match(html, /<button[^>]*role="tab"[^>]*aria-controls="pane-visitas"[^>]*aria-selected="false"/);
  assert.match(html, /AuroraVisitas\.montar\(db, \$\('#visitasPanel'\)\)/);
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 3);
  // el aviso flotante sirve a las tres pestañas: no puede quedar escondido dentro de una
  for (const id of ["pane-opiniones", "pane-visitas", "pane-informe"]) {
    const m = html.match(new RegExp(`<section id="${id}"[^>]*>([\\s\\S]*?)</section>`));
    assert.ok(m, id);
    assert.doesNotMatch(m[1], /id="toast"/, id);
  }
});
