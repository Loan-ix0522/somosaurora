// Pruebas de interfaz de la Comunidad JUMP en Chrome real (CDP), contra el Supabase simulado.
//
//   node tests/jump/ui/cdp.mjs <grupo> [--movil] [--fotos <carpeta>]
//
// Grupos: los de ESCENARIOS (abajo). Imprime un JSON { resultados: {escenario: "ok" | detalle}, consola: [...] }
// y sale con código 1 si algo falla. Necesita Chrome y red (supabase-js viene de jsDelivr, como en producción).
// Escritorio: 1366 px de ancho (JUMP_UI_ANCHO=1440 lo cambia); móvil: 390 px. Los puertos son fijos: una corrida a la vez.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { deflateSync, crc32 } from "node:zlib";
import { join } from "node:path";
import { iniciarSim } from "../sim/servidor.mjs";
import { crearEscenario } from "../sim/escenario.mjs";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const args = process.argv.slice(2);
const grupo = args[0] || "ingreso";
const movil = args.includes("--movil");
const fotos = args.includes("--fotos") ? args[args.indexOf("--fotos") + 1] : null;
const [W, H] = movil ? [390, 844] : [Number(process.env.JUMP_UI_ANCHO) || 1366, 900];
const PUERTO_CDP = 9341;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const cedulaDe = (p) => p.email.slice(1, 11);

// ---------- simulador y datos ----------
const sim = await iniciarSim({ puerto: 8899 });
const X = await crearEscenario(sim.db);
await sim.banear(X.S.id); // una suspensión real también banea en Auth
const BASE = sim.url + "/jump/comunidad/";

// ---------- Chrome ----------
const perfil = mkdtempSync(join(tmpdir(), "jump-cdp-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${PUERTO_CDP}`, `--user-data-dir=${perfil}`, `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });
let objetivos;
for (let i = 0; i < 60; i++) {
  try { objetivos = await (await fetch(`http://127.0.0.1:${PUERTO_CDP}/json`)).json(); if (objetivos.find((t) => t.type === "page")) break; } catch {}
  await dormir(250);
}
const ws = new WebSocket(objetivos.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let nid = 0;
const pendientes = new Map();
const consola = [];
// Respuestas de error que un escenario provoca a propósito (p. ej. el 400 del límite diario del muro): no cuentan como falla.
let erroresEsperados = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") consola.push("EXC " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consola.push("CON " + m.params.args.map((a) => a.value ?? a.description).join(" "));
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    const url = m.params.entry.url || "";
    // Las fuentes de Google pueden fallar sin red; no son de la app.
    // Una clave mala o una cuenta baneada es un 400 de Auth que el navegador registra solo; la app lo maneja.
    const esperado = /fonts\.(googleapis|gstatic)\.com/.test(url) || (/\/auth\/v1\/token\?grant_type=password$/.test(url) && /status of 400/.test(m.params.entry.text))
      || erroresEsperados.some(([u, t]) => u.test(url) && t.test(m.params.entry.text));
    if (!esperado) consola.push("LOG " + m.params.entry.text + (url ? " " + url : ""));
  }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++nid; pendientes.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.result?.exceptionDetails) throw new Error("JS: " + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
}
async function esperar(expr, ms = 8000) {
  const fin = Date.now() + ms;
  let v;
  while (Date.now() < fin) { v = await ev(expr).catch(() => undefined); if (v) return v; await dormir(80); }
  throw new Error(`no se cumplió: ${expr} (último valor: ${JSON.stringify(v)})`);
}
await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable"); await send("Network.enable");
await send("Network.setUserAgentOverride", { userAgent: UA }); // el UA de headless está bloqueado en vercel.json
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: movil });

// ---------- acciones ----------
async function abrir(hash, { limpiar = true } = {}) {
  if (limpiar) await send("Storage.clearDataForOrigin", { origin: sim.url, storageTypes: "local_storage,session_storage,cookies" });
  await send("Page.navigate", { url: "about:blank" });
  await send("Page.navigate", { url: BASE + "#" + hash });
  await esperar(`document.readyState === "complete" && !!document.querySelector("#app > *")`);
}
const ir = (hash) => ev(`location.hash = ${JSON.stringify(hash)}`);
const clic = (sel) => ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) throw new Error("no existe ${sel.replace(/"/g, "'")}"); b.click(); return true; })()`);
async function escribir(sel, texto) {
  await ev(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) throw new Error("no existe ${sel.replace(/"/g, "'")}"); i.focus(); i.select?.(); return true; })()`);
  await send("Input.insertText", { text: texto });
}
const texto = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim() ?? null`);
async function foto(nombre) {
  if (!fotos) return;
  mkdirSync(fotos, { recursive: true });
  // Diálogos y avisos entran con una animación corta: sin esperarla la captura sale a medio aparecer (translúcida).
  await ev(`Promise.race([Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 800))]).then(() => true)`);
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(fotos, `${movil ? "movil" : "escritorio"}-${nombre}.png`), Buffer.from(r.result.data, "base64"));
}
async function entrar(p, clave = "clave-prueba-1", { equipo = false } = {}) {
  await abrir("ingreso");
  if (equipo) { await clic('[data-act="lrole"][data-r="a"]'); await escribir("#lgUser", p.correo); }
  else await escribir("#lgUser", cedulaDe(p));
  await escribir("#lgPass", clave);
  await clic("#loginForm [type=submit]");
}
const fila = async (sql, p) => (await sim.db.query(sql, p)).rows[0];
const sql = (q, p) => sim.db.query(q, p);
const token = async (p) => (await (await fetch(sim.url + "/supa/auth/v1/token?grant_type=password", { method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": UA }, body: JSON.stringify({ email: p.email, password: "clave-prueba-1" }) })).json()).access_token;
const pedirAdmin = async (accion, cuerpo = {}) => fetch(sim.url + "/api/jump-admin", { method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": UA, Origin: sim.url, Authorization: "Bearer " + (await token(X.A)) },
  body: JSON.stringify({ accion, ...cuerpo }) });
// La API real, como el equipo (A): para sembrar ejemplos o suspender a alguien mientras otro navega.
async function apiAdmin(accion, cuerpo = {}) {
  const r = await pedirAdmin(accion, cuerpo);
  return { status: r.status, ...(await r.json()) };
}
// Lo que ve una persona por la API REST (con su propia sesión y RLS).
async function restComo(p, ruta) {
  const r = await fetch(sim.url + "/supa/rest/v1/" + ruta, { headers: { apikey: "anon", Authorization: "Bearer " + (await token(p)), "User-Agent": UA } });
  return r.json();
}
// Conecta la cuenta del Zoom falso con el flujo OAuth real (iniciar → callback con la cookie).
async function conectarZoom() {
  const r = await pedirAdmin("zoom-iniciar");
  const state = new URL((await r.json()).url).searchParams.get("state");
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  const c = await fetch(sim.url + "/api/jump-zoom-callback?" + new URLSearchParams({ code: "codigo-ui", state }),
    { redirect: "manual", headers: { Cookie: cookie, "User-Agent": UA } });
  if (!(c.headers.get("location") || "").includes("zoom=ok")) throw new Error("no se conectó Zoom: " + c.headers.get("location"));
}
// Pone el valor de un campo como si lo hubiera elegido la persona (fecha, hora, select, radio).
const poner = (sel, valor) => ev(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) throw new Error("no existe ${sel.replace(/"/g, "'")}");
  if (el.type === "radio" || el.type === "checkbox") el.checked = ${JSON.stringify(valor)} !== false; else el.value = ${JSON.stringify(valor)};
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
async function subirArchivo(sel, ruta) {
  const doc = await send("DOM.getDocument", { depth: 0 });
  const n = await send("DOM.querySelector", { nodeId: doc.result.root.nodeId, selector: sel });
  if (!n.result?.nodeId) throw new Error("no existe " + sel);
  await send("DOM.setFileInputFiles", { nodeId: n.result.nodeId, files: [ruta] });
}
const dobleClic = (sel) => ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) throw new Error("no existe"); b.click(); b.click(); return true; })()`);
// Fecha "AAAA-MM-DD" en Guayaquil dentro de `dias`.
const fechaEn = (dias) => new Date(Date.now() + dias * 864e5 - 5 * 3600e3).toISOString().slice(0, 10);
async function cedulaNueva(base) {
  const { cedulaValida } = await import("../../../jump/comunidad/js/cedula.js");
  for (let d = 0; d < 10; d++) if (cedulaValida(base + d)) return base + d;
  throw new Error("sin cédula válida para " + base);
}
const entrarEquipo = async () => {
  await entrar({ correo: "ana.torres@correo.test" }, "clave-prueba-1", { equipo: true });
  await esperar(`location.hash === "#a/resumen"`);
};
// window.open falso: guarda lo que la app abre. La app abre la pestaña antes de esperar la red y después le pone la URL.
const atraparAperturas = () => ev(`(() => {
  window.__abiertas = [];
  window.open = (u) => {
    if (u) window.__abiertas.push(u);
    return { opener: 1, close() {}, location: { replace: (x) => window.__abiertas.push(x), set href(x) { window.__abiertas.push(x); } } };
  };
  return true;
})()`);
const desborde = () => ev("document.documentElement.scrollWidth - innerWidth");
// La página pública de JUMP (/jump/), donde está el formulario «Postula».
async function abrirLanding() {
  await send("Page.navigate", { url: "about:blank" });
  await send("Page.navigate", { url: sim.url + "/jump/#postula" });
  await esperar(`document.readyState === "complete" && !!document.querySelector("#sendBtn")`); // el módulo ya corrió (va diferido)
}
// La landing completa, limpia o conservando lo que guardó el navegador (el voto del aparato, lo que ya dijo JC).
// Espera a que la encuesta termine de cargar (#poll[data-estado] deja de ser «cargando»).
async function landing(hash = "", { limpiar = true } = {}) {
  if (limpiar) await send("Storage.clearDataForOrigin", { origin: sim.url, storageTypes: "local_storage,session_storage,cookies" });
  await send("Page.navigate", { url: "about:blank" });
  await send("Page.navigate", { url: sim.url + "/jump/" + (hash ? "#" + hash : "") });
  await esperar(`document.readyState === "complete" && !!document.querySelector("#poll")?.dataset.estado && document.querySelector("#poll").dataset.estado !== "cargando"`);
}
// Una encuesta real con tres opciones y cuatro votos (tres públicos y uno de inscrito): 3 / 1 / 0 → 75 %, 25 %, 0 %.
async function sembrarEncuesta(estado = "abierta") {
  await sql("delete from public.jump_encuestas");
  const { id } = await fila("insert into public.jump_encuestas (pregunta, estado) values ('¿Qué taller quieres para diciembre?', $1) returning id", [estado]);
  const o = [];
  for (const [i, t] of ["Fotos de producto con el celular", "Cómo sacar el RUC sin enredos", "Vender por WhatsApp Business"].entries())
    o.push((await fila("insert into public.jump_encuesta_opciones (encuesta_id, texto, orden) values ($1, $2, $3) returning id", [id, t, i + 1])).id);
  await sql(`insert into public.jump_encuesta_votos (encuesta_id, opcion_id, origen, dispositivo_hash, ip_hash) values
    ($1, $2, 'publico', 'semilla-1', 'ip-semilla'), ($1, $2, 'publico', 'semilla-2', 'ip-semilla'), ($1, $3, 'publico', 'semilla-3', 'ip-semilla')`, [id, o[0], o[1]]);
  await sql("insert into public.jump_encuesta_votos (encuesta_id, opcion_id, origen, user_id) values ($1, $2, 'inscrito', $3)", [id, o[0], X.E.id]);
  return { id, o };
}
const votosPublicos = async (id) => (await fila("select count(*)::int n from public.jump_encuesta_votos where encuesta_id = $1 and origen = 'publico'", [id])).n;
const barras = () => ev(`[...document.querySelectorAll("#opts .opt")].map((b) => ({ id: b.dataset.id, t: b.querySelector(".lbl").textContent.trim(),
  pct: b.querySelector(".pct").textContent.trim(), mia: b.classList.contains("mine"), off: b.disabled }))`);
// JC: lo que dice (el globo visible), dónde está y si ya terminó de moverse.
const globoJC = () => ev(`document.querySelector(".jc-globo.visible")?.textContent ?? null`);
const modoJC = () => ev(`document.querySelector(".jc-escena")?.dataset.modo ?? null`);
const jcQuieto = `!!document.querySelector(".jc") && !document.querySelector(".jc").getAnimations().length`;
// ¿JC (o su globo) tapa los botones de la portada o la cara de Josué? La cara: el tercio de arriba de la foto, al centro.
const tapaPortada = () => ev(`(() => {
  const cruza = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const img = document.querySelector(".ha-cut img").getBoundingClientRect();
  const cara = { left: img.left + img.width * .35, right: img.left + img.width * .72, top: img.top, bottom: img.top + img.height * .34 };
  const jc = document.querySelector(".jc").getBoundingClientRect(), g = document.querySelector(".jc-globo.visible")?.getBoundingClientRect();
  const botones = [...document.querySelectorAll(".hero-copy .ctas a, #logoBtn")].map((e) => e.getBoundingClientRect());
  const r = [];
  if (botones.some((b) => cruza(jc, b))) r.push("JC tapa un botón");
  if (cruza(jc, cara)) r.push("JC tapa la cara de Josué");
  if (g && cruza(g, cara)) r.push("el globo tapa la cara de Josué");
  if (g && botones.some((b) => cruza(g, b))) r.push("el globo tapa un botón");
  return r.join("; ");
})()`);
async function llenarPostula({ nombre, wa, negocio, sector, rubro = "Comida y bebidas", ruc = "no" }) {
  await escribir("#f-nombre", nombre);
  await escribir("#f-wa", wa);
  await escribir("#f-negocio", negocio);
  await ev(`(() => { const s = document.querySelector("#f-rubro"); s.value = ${JSON.stringify(rubro)}; s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  await escribir("#f-sector", sector);
  await clic(`input[name="ruc"][value="${ruc}"]`);
  await ev(`(() => { const c = document.querySelector("#f-ok"); if (!c.checked) c.click(); return true; })()`);
}
// Elige un archivo creado en el navegador: una foto PNG dibujada en un canvas, o un archivo con el contenido dado.
const elegirArchivo = (sel, { nombre = "feria.png", tipo = "image/png", contenido = null } = {}) => ev(`(async () => {
  let b;
  if (${JSON.stringify(contenido)} === null) {
    const c = document.createElement("canvas"); c.width = 900; c.height = 600;
    const g = c.getContext("2d"); g.fillStyle = "#0B1F5C"; g.fillRect(0, 0, 900, 600); g.fillStyle = "#DCE4FA"; g.fillRect(120, 120, 380, 240);
    b = await new Promise((r) => c.toBlob(r, "image/png"));
  } else b = new Blob([${JSON.stringify(contenido)}], { type: ${JSON.stringify(tipo)} });
  const dt = new DataTransfer(); dt.items.add(new File([b], ${JSON.stringify(nombre)}, { type: ${JSON.stringify(tipo)} }));
  const i = document.querySelector(${JSON.stringify(sel)});
  if (!i) throw new Error("no existe ${sel.replace(/"/g, "'")}");
  i.files = dt.files; i.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
// Una publicación sembrada directo en la base (como si la persona la hubiera hecho).
const sembrarPost = async (p, texto, extra = {}) =>
  (await fila("insert into public.jump_posts (autor_id, texto, creado_en) values ($1, $2, $3) returning id", [p.id, texto, extra.creadoEn || new Date().toISOString()])).id;
const abrirMuro = async (p, { equipo = false } = {}) => {
  if (equipo) await entrarEquipo(); else { await entrar(p); await esperar(`location.hash === "#e/inicio"`); }
  await ir(equipo ? "a/muro" : "e/muro");
  await esperar(`!!document.querySelector("#muroForm") && !!document.querySelector("#muroLista")`);
};
const enPost = (id, sel = "") => `[data-post="${id}"] ${sel}`.trim();

// ---- ajustes: Zoom y equipo ----
// Deja la cuenta de Zoom del servidor como se pide (por la API real).
async function asegurarZoom(conectada) {
  const z = await apiAdmin("zoom-estado");
  if (!!z.conectada === conectada) return;
  if (conectada) await conectarZoom();
  else if (!(await apiAdmin("zoom-desconectar")).ok) throw new Error("no se desconectó Zoom");
}
const bytes64 = (s) => Buffer.from(s).toString("base64");
// Atrapa lo que la app manda a zoom.us (la página real no se visita) y guarda las direcciones.
async function atraparZoomWeb(urls, fn) {
  const alMensaje = (e) => {
    const m = JSON.parse(e.data);
    if (m.method !== "Fetch.requestPaused") return;
    urls.push(m.params.request.url);
    send("Fetch.fulfillRequest", { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "text/html" }], body: bytes64("<p>Zoom falso</p>") });
  };
  ws.addEventListener("message", alMensaje);
  await send("Fetch.enable", { patterns: [{ urlPattern: "https://zoom.us/*" }] });
  try { return await fn(); } finally { await send("Fetch.disable"); ws.removeEventListener("message", alMensaje); }
}
// Mientras corre fn, la consulta del estado de Zoom responde con un error 500.
async function conZoomCaido(fn) {
  erroresEsperados.push([/\/api\/jump-admin/, /status of 500/]);
  const alMensaje = (e) => {
    const m = JSON.parse(e.data);
    if (m.method !== "Fetch.requestPaused") return;
    const { requestId, request } = m.params;
    if (/zoom-estado/.test(request.postData || "")) send("Fetch.fulfillRequest", { requestId, responseCode: 500, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: bytes64('{"ok":false,"error":"x"}') });
    else send("Fetch.continueRequest", { requestId });
  };
  ws.addEventListener("message", alMensaje);
  await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/jump-admin*" }] });
  try { return await fn(); } finally { await send("Fetch.disable"); ws.removeEventListener("message", alMensaje); }
}
const abrirAjustes = async () => {
  await entrarEquipo();
  await ir("a/ajustes");
  await esperar(`!!document.querySelector("#zoomEstado")`);
};
const filaEquipo = (id, sel = "") => `[data-equipo="${id}"] ${sel}`.trim();
const adminNuevo = async (correo, nombres) => {
  const r = await apiAdmin("crear-cuenta", { rol: "admin", correo, nombres });
  if (r.status !== 201) throw new Error("no se creó el admin: " + JSON.stringify(r));
  return r.userId;
};

// PNG de verdad (RGB, sin transparencia) con un degradado y algo de ruido: pesa bastante en PNG y mucho menos en WebP.
function pngDePrueba(ancho, alto) {
  const fila = 1 + ancho * 3, crudo = Buffer.alloc(fila * alto);
  for (let y = 0; y < alto; y++) {
    const o = y * fila; // el byte de filtro queda en 0
    for (let x = 0; x < ancho; x++) {
      const i = o + 1 + x * 3;
      crudo[i] = (x * 255 / ancho) | 0; crudo[i + 1] = (y * 255 / alto) | 0; crudo[i + 2] = ((x ^ y) + ((x * 7 + y * 13) % 5)) & 255;
    }
  }
  const trozo = (tipo, datos) => {
    const t = Buffer.concat([Buffer.from(tipo), datos]);
    const lon = Buffer.alloc(4); lon.writeUInt32BE(datos.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(t) >>> 0);
    return Buffer.concat([lon, t, c]);
  };
  const cab = Buffer.alloc(13); cab.writeUInt32BE(ancho, 0); cab.writeUInt32BE(alto, 4); cab[8] = 8; cab[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", cab), trozo("IDAT", deflateSync(crudo, { level: 1 })), trozo("IEND", Buffer.alloc(0))]);
}

// ---------- escenarios ----------
const ESCENARIOS = {
  ingreso: {
    "ingreso-vacio": async () => {
      await abrir("ingreso");
      await clic("#loginForm [type=submit]");
      const n = await esperar(`document.querySelectorAll("#loginForm .err:not([hidden])").length`);
      await foto("ingreso-errores");
      return n === 2 || `errores de campo: ${n}`;
    },
    "ingreso-malo": async () => {
      await entrar(X.E, "clave-mala-1");
      await esperar(`!document.querySelector("#loginBanner").hidden`);
      const t = await texto("#loginBanner");
      return t.includes("Cédula o clave incorrecta") || t;
    },
    "ingreso-suspendida": async () => {
      await entrar(X.S);
      await esperar(`!document.querySelector("#loginBanner").hidden`);
      const t = await texto("#loginBanner");
      return t.includes("Tu cuenta está suspendida. Escríbele al equipo de JUMP.") || t;
    },
    "equipo-entra-con-correo": async () => {
      await abrir("ingreso");
      await clic('[data-act="lrole"][data-r="a"]');
      const campo = await ev(`(() => { const i = document.querySelector("#lgUser"); return { etiqueta: document.querySelector('label[for="lgUser"]').textContent.trim(), tipo: i.type }; })()`);
      if (campo.etiqueta !== "Correo" || campo.tipo !== "email") return JSON.stringify(campo);
      await escribir("#lgUser", "ana");
      await escribir("#lgPass", "clave-prueba-1");
      await clic("#loginForm [type=submit]");
      const err = await esperar(`!document.querySelector("#lgUserErr").hidden && document.querySelector("#lgUserErr").textContent`);
      if (!err.includes("Revisa tu correo")) return err;
      await foto("ingreso-equipo-correo");
      await escribir("#lgUser", "ana.torres@correo.test");
      await escribir("#lgPass", "clave-mala-1");
      await clic("#loginForm [type=submit]");
      await esperar(`!document.querySelector("#loginBanner").hidden`);
      const t = await texto("#loginBanner");
      if (!t.includes("Correo o clave incorrecta")) return t;
      // mayúsculas y espacios alrededor no estorban
      await escribir("#lgUser", "  ANA.Torres@Correo.TEST ");
      await escribir("#lgPass", "clave-prueba-1");
      await clic("#loginForm [type=submit]");
      await esperar(`location.hash === "#a/resumen"`);
      return true;
    },
    "primer-ingreso": async () => {
      await entrar(X.N);
      await esperar(`!!document.querySelector("#newPassForm")`);
      await escribir("#np1", "dulces2026");
      await escribir("#np2", "dulces2026");
      await clic("#newPassForm [type=submit]");
      await esperar(`!document.querySelector("#npPrivErr").hidden`);
      await foto("primer-ingreso-privacidad");
      if ((await ev("location.hash")) === "#e/inicio") return "entró sin aceptar la privacidad";
      await clic("#npPriv");
      await clic("#newPassForm [type=submit]");
      await esperar(`location.hash === "#e/inicio"`);
      const m = await fila("select debe_cambiar_clave, privacidad_version from jump_miembros where user_id = $1", [X.N.id]);
      return (!m.debe_cambiar_clave && m.privacidad_version === "2026-10-19") || JSON.stringify(m);
    },
    "admin-entra": async () => {
      await entrar({ correo: "ana.torres@correo.test" }, "clave-prueba-1", { equipo: true });
      await esperar(`location.hash === "#a/resumen" && !!document.querySelector(".shell")`);
      await foto("admin-entra");
      return true;
    },
    "ruta-ajena": async () => {
      await entrar(X.E);
      await esperar(`location.hash === "#e/inicio"`);
      await ir("a/resumen");
      await esperar(`location.hash === "#e/inicio"`);
      return true;
    },
    "sesion-separada": async () => {
      await entrar(X.E2);
      await esperar(`location.hash === "#e/inicio"`);
      const claves = await ev(`Object.keys(localStorage)`);
      return (claves.includes("jump-auth") && !claves.some((k) => /^sb-.*-auth-token$/.test(k))) || JSON.stringify(claves);
    },
    "salir": async () => {
      await entrar(X.E2);
      // la dirección cambia antes de que se dibuje el menú: se espera al botón, no solo a la ruta
      await esperar(`location.hash === "#e/inicio" && !!document.querySelector('.shell [data-act="salir"]')`);
      await clic('.shell [data-act="salir"]');
      await esperar(`location.hash === "#ingreso" && !!document.querySelector("#loginForm")`);
      return (await ev(`localStorage.getItem("jump-auth")`)) === null || "la sesión siguió guardada";
    },
    csp: async () => {
      const csp = consola.filter((c) => /Content Security Policy|Refused to/i.test(c));
      return csp.length === 0 || csp.join(" | ");
    },
  },

  emprendedor: {
    inicio: async () => {
      await entrar(X.E);
      await esperar(`location.hash === "#e/inicio" && !!document.querySelector(".page-head h1")`);
      const h = await texto(".page-head h1");
      if (h !== "Hola, María") return "saludo: " + h;
      const tarjetas = await ev(`document.querySelectorAll("#page .m-grid .m-card").length`);
      if (tarjetas !== 4) return "tarjetas en inicio: " + tarjetas;
      await foto("e-inicio");
      await ir("e/mentorias");
      const publicadas = (await fila("select count(*)::int n from public.jump_mentorias where estado = 'publicada'")).n;
      const n = await esperar(`location.hash === "#e/mentorias" && document.querySelectorAll("#page .m-grid .m-card").length`);
      return n === publicadas || `mentorías: ${n} de ${publicadas}`;
    },
    "aula-visto": async () => {
      await entrar(X.E);
      await esperar(`location.hash === "#e/inicio"`);
      await ir("e/m/" + X.P);
      await esperar(`!!document.querySelector('[data-act="visto"]')`);
      await ev(`(() => { window.__hopper = false; new MutationObserver(() => { if (document.querySelector(".hopper")) window.__hopper = true; }).observe(document.body, { childList: true }); return true; })()`);
      await clic('[data-act="visto"]');
      await esperar("window.__hopper === true", 4000);
      const r = await fila("select count(*)::int n from public.jump_progreso where user_id = $1 and modulo_id = $2", [X.E.id, X.P1]);
      if (r.n !== 1) return "sin fila en jump_progreso";
      await esperar(`location.hash === "#e/m/${X.P}/2"`);
      await foto("e-aula");
      return true;
    },
    "aula-video": async () => {
      await sql("update public.jump_modulos set video_url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' where id = $1", [X.P1]);
      await entrar(X.E);
      await esperar(`location.hash === "#e/inicio"`);
      await ir(`e/m/${X.P}/1`);
      await esperar(`!!document.querySelector('[data-act="reproducir"]')`);
      await clic('[data-act="reproducir"]');
      const src = await esperar(`document.querySelector(".player iframe")?.src`);
      return src.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ") || src;
    },
    "video-pendiente": async () => {
      await sql("update public.jump_modulos set video_url = null where id = $1", [X.P1]);
      await entrar(X.E);
      await esperar(`location.hash === "#e/inicio"`);
      await ir(`e/m/${X.P}/1`);
      const t = await esperar(`document.querySelector(".player")?.textContent`);
      return t.includes("Video pendiente: el equipo lo sube pronto") || t;
    },
    material: async () => {
      const ruta = `${X.P}/guia-ruc.pdf`;
      await sql("insert into storage.objects (bucket_id, name) values ('jump-material', $1) on conflict do nothing", [ruta]);
      sim.archivos.set("jump-material/" + ruta, { bytes: Buffer.from("%PDF-1.4 prueba"), tipo: "application/pdf" });
      const m = await fila("insert into public.jump_materiales (mentoria_id, nombre, tipo, ruta, bytes, mime) values ($1, 'Guía del RUC', 'archivo', $2, 15, 'application/pdf') returning id", [X.P, ruta]);
      await entrar(X.E);
      await esperar(`location.hash === "#e/inicio"`);
      await ir(`e/m/${X.P}/1`);
      const sel = `[data-act="material"][data-id="${m.id}"]`;
      await esperar(`!!document.querySelector('${sel}')`);
      await atraparAperturas();
      await clic(sel);
      const [u] = await esperar("window.__abiertas.length && window.__abiertas");
      return u.startsWith(sim.url + "/supa/storage/v1/object/sign/jump-material/") || u;
    },
    "clase-ventana": async () => {
      await sql("update public.jump_clases set inicia_en = now() + interval '5 minutes' where id = $1", [X.C1]);
      await entrar(X.E);
      await esperar(`location.hash === "#e/inicio"`);
      await ir("e/clases");
      const sel = `[data-act="zoom"][data-id="${X.C1}"]`;
      await esperar(`!!document.querySelector('${sel}')`);
      const b = await texto(sel);
      if (b !== "Entrar a Zoom") return "botón: " + b;
      await atraparAperturas();
      await clic(sel);
      const [u] = await esperar("window.__abiertas.length && window.__abiertas");
      await foto("e-clases");
      return u === "https://us02web.zoom.us/j/111" || u;
    },
    asistire: async () => {
      await entrar(X.E);
      await esperar(`location.hash === "#e/inicio"`);
      await ir("e/clases");
      const sel = `[data-act="asistire"][data-id="${X.C3}"]`;
      await esperar(`document.querySelector('${sel}')?.getAttribute("aria-pressed") === "false"`);
      await clic(sel);
      await esperar(`document.querySelector('${sel}')?.getAttribute("aria-pressed") === "true"`);
      const r = await fila("select confirmado_en from public.jump_asistencia where user_id = $1 and clase_id = $2", [X.E.id, X.C3]);
      return (!!r && !!r.confirmado_en) || "sin fila de asistencia";
    },
    "avisos-vistos": async () => {
      await entrar(X.E);
      await esperar(`location.hash === "#e/inicio"`);
      const antes = await esperar(`Number(document.querySelector('.side a[href="#e/avisos"] .nav-badge')?.firstChild?.textContent || 0)`);
      await ir("e/avisos");
      await esperar(`location.hash === "#e/avisos" && !document.querySelector(".nav-badge") && !document.querySelector(".tabbar .dot")`);
      const total = (await fila("select count(*)::int n from public.jump_avisos")).n;
      const vistos = (await fila("select count(*)::int n from public.jump_avisos_vistos where user_id = $1", [X.E.id])).n;
      return (antes > 0 && vistos === total) || `antes ${antes}, vistos ${vistos} de ${total}`;
    },
    perfil: async () => {
      await entrar(X.E);
      await esperar(`location.hash === "#e/inicio"`);
      await ir("e/perfil");
      await esperar(`!!document.querySelector("#pfWa")`);
      const ced = await texto("#pfCedula");
      if (ced !== "09••••5675") return "cédula: " + ced;
      await escribir("#pfWa", "+593 99 123 4567");
      await clic("#perfilForm [type=submit]");
      await esperar(`document.querySelector("#toast").classList.contains("show")`);
      const r = await fila("select whatsapp from public.jump_miembros where user_id = $1", [X.E.id]);
      await foto("e-perfil");
      return r.whatsapp === "0991234567" || "whatsapp: " + r.whatsapp;
    },
    "suspendida-en-uso": async () => {
      await entrar(X.E2);
      await esperar(`location.hash === "#e/inicio"`);
      const r = await apiAdmin("suspender", { userId: X.E2.id, motivo: "prueba" });
      if (r.status !== 200) return "no se suspendió: " + JSON.stringify(r);
      await ir("e/mentorias");
      await esperar(`location.hash === "#ingreso" && !document.querySelector("#loginBanner").hidden`);
      const t = await texto("#loginBanner");
      return t.includes("Tu cuenta está suspendida. Escríbele al equipo de JUMP.") || t;
    },
    "movil-sin-desborde": async () => {
      await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      try {
        await entrar(X.E);
        await esperar(`location.hash === "#e/inicio"`);
        const malas = [];
        for (const r of ["e/inicio", "e/mentorias", `e/m/${X.P}/1`, `e/m/${X.P}/2`, "e/clases", "e/avisos", "e/perfil"]) {
          await ir(r);
          await esperar(`location.hash === "#${r}" && !!document.querySelector("#page > *")`);
          await dormir(150);
          const d = await desborde();
          if (d !== 0) malas.push(`${r}: ${d}px`);
        }
        await foto("e-movil-perfil");
        return malas.length === 0 || malas.join(", ");
      } finally {
        await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: movil });
      }
    },
    csp: async () => {
      const csp = consola.filter((c) => /Content Security Policy|Refused to/i.test(c));
      return csp.length === 0 || csp.join(" | ");
    },
  },

  admin: {
    resumen: async () => {
      await entrarEquipo();
      await esperar(`!!document.querySelector(".cupos")`);
      const activas = (await fila("select count(*)::int n from public.jump_miembros where rol = 'emprendedor' and estado = 'activa'")).n;
      const t = await texto(".cupos p");
      await foto("a-resumen");
      return t.includes(`${activas} cuentas activas`) || t;
    },
    "crear-emprendedor": async () => {
      const ced = await cedulaNueva("091111111");
      await entrarEquipo();
      await ir("a/emprendedores");
      await esperar(`!!document.querySelector('[data-act="agregar"]')`);
      await clic('[data-act="agregar"]');
      await esperar(`document.querySelector("#dlgAdd")?.open`);
      await escribir("#adNombres", "Rosa Elena Quiñónez");
      await escribir("#adCedula", ced);
      await escribir("#adWa", "0987654321");
      await escribir("#adNegocio", "Empanadas Rosa");
      await foto("a-agregar");
      await dobleClic("#addForm [type=submit]");
      await esperar(`document.querySelector("#dlgClave")?.open`);
      const clave = await texto("#claveCodigo");
      const wa = await ev(`document.querySelector("#claveWa")?.href || ""`);
      await foto("a-clave");
      const n = (await fila("select count(*)::int n from public.jump_miembros where cedula = $1", [ced])).n;
      if (n !== 1) return "cuentas creadas: " + n;
      if (!/^JUMP-\d{4}-\d{4}$/.test(clave)) return "clave: " + clave;
      return wa.startsWith("https://wa.me/5939") || "whatsapp: " + wa;
    },
    "cedula-repetida": async () => {
      await entrarEquipo();
      await ir("a/emprendedores");
      await esperar(`!!document.querySelector('[data-act="agregar"]')`);
      await clic('[data-act="agregar"]');
      await esperar(`document.querySelector("#dlgAdd")?.open`);
      await escribir("#adNombres", "Otra Persona");
      await escribir("#adCedula", cedulaDe(X.E));
      await escribir("#adNegocio", "Otro negocio");
      await clic("#addForm [type=submit]");
      const t = await esperar(`!document.querySelector("#adCedulaErr").hidden && document.querySelector("#adCedulaErr").textContent`);
      return t.includes("Ya existe una cuenta con esa cédula") || t;
    },
    "suspender-reactivar": async () => {
      await entrarEquipo();
      await ir("a/emprendedores");
      const n = (f) => ev(`Number(document.querySelector('[data-act="efiltro"][data-f="${f}"] .n')?.textContent)`);
      await esperar(`!!document.querySelector('[data-act="suspender"][data-id="${X.E2.id}"]')`);
      const [a0, s0] = [await n("activos"), await n("susp")];
      await clic(`[data-act="suspender"][data-id="${X.E2.id}"]`);
      await esperar(`document.querySelector("#dlgSusp")?.open`);
      await escribir("#suspMotivo", "No vino a las clases");
      await clic("#suspForm [type=submit]");
      await esperar(`!!document.querySelector('[data-act="reactivar"][data-id="${X.E2.id}"]')`);
      const r1 = await fila("select estado, motivo_suspension from public.jump_miembros where user_id = $1", [X.E2.id]);
      if (r1.estado !== "suspendida" || r1.motivo_suspension !== "No vino a las clases") return JSON.stringify(r1);
      if ((await n("activos")) !== a0 - 1 || (await n("susp")) !== s0 + 1) return `contadores: ${await n("activos")}/${await n("susp")} (antes ${a0}/${s0})`;
      await clic(`[data-act="reactivar"][data-id="${X.E2.id}"]`);
      await esperar(`!!document.querySelector('[data-act="suspender"][data-id="${X.E2.id}"]')`);
      const r2 = await fila("select estado from public.jump_miembros where user_id = $1", [X.E2.id]);
      return r2.estado === "activa" || "estado: " + r2.estado;
    },
    "editor-errores": async () => {
      await entrarEquipo();
      await ir("a/editor/nueva");
      await esperar(`!!document.querySelector('[data-act="publicar"]')`);
      await clic('[data-act="publicar"]');
      await esperar(`!document.querySelector("#pubErr").hidden`);
      const t = await texto("#pubErr");
      if (!t.includes("Revisa 2 campos")) return "aviso: " + t;
      if (await ev(`document.querySelector("#edTituloErr").hidden`)) return "sin error en el título";
      if ((await ev(`document.querySelectorAll(".mod.has-err").length`)) !== 1) return "sin error en el módulo";
      await escribir('.mod[data-mi="0"] [data-mf="titulo"]', "Catálogo");
      await escribir('.mod[data-mi="0"] [data-mf="videoUrl"]', "https://example.com/video");
      await clic('[data-act="publicar"]');
      const e = await esperar(`document.querySelector(".mod.has-err .mod-err")?.textContent`);
      await foto("a-editor-errores");
      return e.includes("YouTube o Vimeo") || e;
    },
    "editor-nueva-publicar": async () => {
      await entrarEquipo();
      await ir("a/editor/nueva");
      await esperar(`!!document.querySelector("#edTitulo")`);
      await escribir("#edTitulo", "Vende por WhatsApp");
      await escribir('.mod[data-mi="0"] [data-mf="titulo"]', "Tu catálogo");
      await escribir('.mod[data-mi="0"] [data-mf="videoUrl"]', "https://youtu.be/dQw4w9WgXcQ");
      await clic('[data-act="addmod"][data-tipo="vivo"]');
      await esperar(`!!document.querySelector('.mod[data-mi="1"] [data-mf="fecha"]')`);
      await escribir('.mod[data-mi="1"] [data-mf="titulo"]', "Preguntas en vivo");
      await poner('.mod[data-mi="1"] [data-mf="fecha"]', fechaEn(3));
      await poner('.mod[data-mi="1"] [data-mf="hora"]', "19:00");
      await escribir('.mod[data-mi="1"] [data-mf="zoom"]', "https://zoom.us/j/555");
      await foto("a-editor");
      await clic('[data-act="publicar"]');
      await esperar(`location.hash === "#a/mentorias"`);
      const m = await fila("select id, estado from public.jump_mentorias where titulo = 'Vende por WhatsApp'");
      if (!m || m.estado !== "publicada") return "mentoría: " + JSON.stringify(m);
      const vivo = await fila("select clase_id from public.jump_modulos where mentoria_id = $1 and tipo = 'vivo'", [m.id]);
      const c = vivo?.clase_id && await fila("select c.mentoria_id, z.join_url from public.jump_clases c left join public.jump_clases_zoom z on z.clase_id = c.id where c.id = $1", [vivo.clase_id]);
      if (!c || c.mentoria_id !== m.id || c.join_url !== "https://zoom.us/j/555") return "clase: " + JSON.stringify(c);
      const av = await sql("select tipo from public.jump_avisos where mentoria_id = $1 or clase_id = $2 order by tipo", [m.id, vivo.clase_id]);
      if (av.rows.map((r) => r.tipo).join(",") !== "invitacion,mentoria") return "avisos: " + av.rows.map((r) => r.tipo).join(",");
      const visto = await restComo(X.E, `jump_mentorias?id=eq.${m.id}&select=id`);
      // El aviso mide lo que mide su texto (en el celular llegó a salir en cuatro líneas, estrechado a media pantalla).
      const altoAviso = await ev(`document.querySelector("#toast.show")?.getBoundingClientRect().height ?? null`);
      if (altoAviso === null || altoAviso > 90) return "aviso de la mentoría publicada: alto " + altoAviso;
      await foto("a-mentorias");
      return visto.length === 1 || "E no la ve";
    },
    // Guardar el borrador de una mentoría nueva: la dirección pasa a la de la mentoría y el panel de publicar se vuelve a dibujar.
    "editor-borrador-nueva": async () => {
      await entrarEquipo();
      await ir("a/editor/nueva");
      await esperar(`!!document.querySelector("#edTitulo")`);
      await escribir("#edTitulo", "Borrador de prueba UI");
      await escribir('.mod[data-mi="0"] [data-mf="titulo"]', "Primer paso");
      await clic('[data-act="borrador"]');
      await esperar(`/^#a\\/editor\\/[0-9a-f-]{36}$/.test(location.hash)`);
      // Recién guardada ya se puede borrar: el panel se dibujó de nuevo.
      await esperar(`!!document.querySelector('#pubPanel [data-act="borrarmentoria"]')`);
      const m = await fila("select estado from public.jump_mentorias where titulo = 'Borrador de prueba UI'");
      return m?.estado === "borrador" || "mentoría: " + JSON.stringify(m);
    },
    "subir-material": async () => {
      const dir = mkdtempSync(join(tmpdir(), "jump-pdf-"));
      const ruta = join(dir, "Guía precios.pdf");
      writeFileSync(ruta, Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(1024 - 9, 32)]));
      await entrarEquipo();
      await ir(`a/editor/${X.B}`);
      await esperar(`!!document.querySelector('input[data-cambio="material"]')`);
      const antes = await ev(`document.querySelectorAll("#edFiles li").length`);
      await subirArchivo('input[data-cambio="material"]', ruta);
      await esperar(`document.querySelectorAll("#edFiles li").length === ${antes + 1}`);
      const f = await fila("select ruta, nombre, bytes, mime from public.jump_materiales where mentoria_id = $1 and tipo = 'archivo'", [X.B]);
      rmSync(dir, { recursive: true, force: true });
      if (!f || f.nombre !== "Guía precios.pdf" || Number(f.bytes) !== 1024 || f.mime !== "application/pdf") return "fila: " + JSON.stringify(f);
      if (!new RegExp(`^${X.B}/[0-9a-f-]{36}-guia-precios\\.pdf$`).test(f.ruta)) return "ruta: " + f.ruta;
      return sim.archivos.has("jump-material/" + f.ruta) || "no quedó en Storage";
    },
    "subir-material-imagen": async () => {
      const dir = mkdtempSync(join(tmpdir(), "jump-img-"));
      const ruta = join(dir, "Foto del local.PNG");
      const original = pngDePrueba(2600, 1700);
      writeFileSync(ruta, original);
      await entrarEquipo();
      await ir(`a/editor/${X.B}`);
      await esperar(`!!document.querySelector('input[data-cambio="material"]')`);
      const antes = await ev(`document.querySelectorAll("#edFiles li").length`);
      await subirArchivo('input[data-cambio="material"]', ruta);
      await esperar(`document.querySelectorAll("#edFiles li").length === ${antes + 1}`);
      const f = await fila("select ruta, nombre, bytes, mime from public.jump_materiales where mentoria_id = $1 and tipo = 'archivo' and nombre like 'Foto del local%'", [X.B]);
      rmSync(dir, { recursive: true, force: true });
      if (!f) return "no se guardó la fila";
      if (f.mime !== "image/webp" || f.nombre !== "Foto del local.webp" || !/\.webp$/.test(f.ruta)) return "no quedó como WebP: " + JSON.stringify(f);
      if (!(Number(f.bytes) < original.length / 4)) return `no se redujo lo suficiente: ${f.bytes} de ${original.length} bytes`;
      const guardado = sim.archivos.get("jump-material/" + f.ruta);
      if (!guardado) return "no quedó en Storage";
      const n = guardado.bytes.length ?? guardado.bytes;
      return (n === Number(f.bytes)) || `bytes de la fila (${f.bytes}) ≠ archivo guardado (${n})`;
    },
    "programar-clase-manual": async () => {
      await entrarEquipo();
      await ir("a/clases");
      await esperar(`!!document.querySelector('[data-act="programar"]')`);
      await clic('[data-act="programar"]');
      await esperar(`!document.querySelector("#schedForm").hidden`);
      if (!(await ev(`document.querySelector('input[name="zoomModo"][value="crear"]').disabled`))) return "Crear en Zoom activo sin cuenta conectada";
      await escribir("#scTitulo", "Dudas de facturación");
      await poner("#scFecha", fechaEn(2));
      await poner("#scHora", "18:30");
      await poner('input[name="zoomModo"][value="manual"]', true);
      await escribir("#scEnlace", "https://example.com/reunion");
      await clic("#schedForm [type=submit]");
      await esperar(`!document.querySelector("#scEnlaceErr").hidden`);
      await foto("a-clases-error");
      await escribir("#scEnlace", "https://zoom.us/j/123");
      await clic("#schedForm [type=submit]");
      await esperar(`document.querySelector("#schedForm")?.hidden !== false`);
      const c = await fila(`select z.join_url, (select count(*)::int from public.jump_avisos a where a.clase_id = c.id and a.tipo = 'invitacion') inv
        from public.jump_clases c left join public.jump_clases_zoom z on z.clase_id = c.id where c.titulo = 'Dudas de facturación'`);
      await foto("a-clases");
      return (c && c.join_url === "https://zoom.us/j/123" && c.inv === 1) || "clase: " + JSON.stringify(c);
    },
    "programar-clase-zoom": async () => {
      await conectarZoom();
      await entrarEquipo();
      await ir("a/clases");
      await esperar(`!!document.querySelector('[data-act="programar"]')`);
      await clic('[data-act="programar"]');
      await esperar(`!document.querySelector("#schedForm").hidden && !document.querySelector('input[name="zoomModo"][value="crear"]').disabled`);
      await escribir("#scTitulo", "Clase con Zoom");
      await poner("#scFecha", fechaEn(4));
      await poner("#scHora", "10:00");
      await poner('input[name="zoomModo"][value="crear"]', true);
      await clic("#schedForm [type=submit]");
      await esperar(`document.querySelector("#schedForm")?.hidden !== false`);
      const c = await fila("select z.join_url, z.meeting_id from public.jump_clases c join public.jump_clases_zoom z on z.clase_id = c.id where c.titulo = 'Clase con Zoom'");
      return (c && /^https:\/\/us06web\.zoom\.us\/j\/8\d+/.test(c.join_url) && !!c.meeting_id) || "zoom: " + JSON.stringify(c);
    },
    aviso: async () => {
      await entrarEquipo();
      await ir("a/avisos");
      await esperar(`!!document.querySelector("#avTexto")`);
      await clic("#avisoForm [type=submit]");
      await esperar(`!document.querySelector("#avTextoErr").hidden`);
      await escribir("#avTexto", "Este sábado hay feria en el parque central.");
      await clic("#avisoForm [type=submit]");
      await esperar(`[...document.querySelectorAll("#avisosList .av-text")].some((p) => p.textContent.includes("feria en el parque"))`);
      const vis = await restComo(X.E, "jump_avisos?tipo=eq.aviso&select=texto");
      await foto("a-avisos");
      return vis.some((a) => a.texto === "Este sábado hay feria en el parque central.") || "E no lo ve";
    },
    "doble-publicar": async () => {
      const id = (await fila("insert into public.jump_mentorias (titulo) values ('Doble clic') returning id")).id;
      await sql("insert into public.jump_modulos (mentoria_id, orden, titulo, tipo, video_url) values ($1, 0, 'Único', 'video', 'https://youtu.be/dQw4w9WgXcQ')", [id]);
      await entrarEquipo();
      await ir(`a/editor/${id}`);
      await esperar(`!!document.querySelector('[data-act="publicar"]') && document.querySelector("#edTitulo").value === "Doble clic"`);
      await dobleClic('[data-act="publicar"]');
      await esperar(`location.hash === "#a/mentorias"`);
      await dormir(400);
      const n = (await fila("select count(*)::int n from public.jump_avisos where mentoria_id = $1 and tipo = 'mentoria'", [id])).n;
      return n === 1 || "avisos: " + n;
    },
    "tabla-sin-desborde": async () => {
      await send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
      try {
        await entrarEquipo();
        const malas = [];
        for (const r of ["a/mentorias", "a/emprendedores"]) {
          await ir(r);
          await esperar(`location.hash === "#${r}" && !!document.querySelector(".table-wrap table")`);
          await dormir(150);
          const t = await ev(`(() => { const w = document.querySelector(".table-wrap"); return w.scrollWidth - w.clientWidth; })()`);
          if (t > 0) malas.push(`${r}: tabla ${t}px`);
          const d = await desborde();
          if (d !== 0) malas.push(`${r}: página ${d}px`);
        }
        await foto("a-tabla-1024");
        return malas.length === 0 || malas.join(", ");
      } finally {
        await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: movil });
      }
    },
    "movil-sin-desborde": async () => {
      await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      try {
        await entrarEquipo();
        const malas = [];
        for (const r of ["a/resumen", "a/mentorias", "a/editor/nueva", `a/editor/${X.P}`, "a/clases", "a/emprendedores", "a/avisos"]) {
          await ir(r);
          await esperar(`location.hash === "#${r}" && !!document.querySelector("#page > *")`);
          await dormir(150);
          const d = await desborde();
          if (d !== 0) malas.push(`${r}: ${d}px`);
        }
        await foto("a-movil-avisos");
        return malas.length === 0 || malas.join(", ");
      } finally {
        await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: movil });
      }
    },
    csp: async () => {
      const csp = consola.filter((c) => /Content Security Policy|Refused to/i.test(c));
      return csp.length === 0 || csp.join(" | ");
    },
  },

  muro: {
    "muro-vacio": async () => {
      await abrirMuro(X.E);
      const t = await esperar(`document.querySelector("#muroLista .empty")?.textContent.trim()`);
      await foto("muro-vacio");
      return (t.includes("Todavía no hay publicaciones") && t.includes("Cuenta tu primer avance.")) || t;
    },
    "muro-publicar": async () => {
      await abrirMuro(X.E);
      await escribir("#muroTexto", "Hoy vendí 30 empanadas en la feria de La Aurora.");
      await elegirArchivo('input[data-cambio="muroFoto"]');
      await esperar(`!document.querySelector("#muroPrevia").hidden && document.querySelector("#muroPrevia img")?.naturalWidth > 0`);
      await dobleClic("#muroForm [type=submit]");
      await esperar(`[...document.querySelectorAll("#muroLista [data-post] .post-text")].some((p) => p.textContent.includes("30 empanadas"))`);
      await esperar(`(() => { const i = document.querySelector("#muroLista [data-post] .post-foto img"); return !!i && i.complete && i.naturalWidth > 0; })()`);
      await dormir(400); // por si un segundo envío llegara tarde
      const filas = (await sql("select texto, foto from public.jump_posts where autor_id = $1", [X.E.id])).rows;
      await foto("muro-publicado");
      if (filas.length !== 1) return `filas: ${filas.length}`;
      if (!new RegExp(`^${X.E.id}/[0-9a-f-]{36}\\.webp$`).test(filas[0].foto || "")) return "foto: " + filas[0].foto;
      if (!sim.archivos.has("jump-muro/" + filas[0].foto)) return "la foto no quedó en Storage";
      if (await ev(`!document.querySelector("#muroPrevia").hidden || document.querySelector("#muroTexto").value !== ""`)) return "el formulario no se limpió";
      return true;
    },
    "muro-comentar": async () => {
      const id = await sembrarPost(X.E, "¿Cómo ponen el precio a sus productos?");
      await abrirMuro(X.E2);
      await esperar(`!!document.querySelector('${enPost(id, ".com-form input")}')`);
      await escribir(enPost(id, ".com-form input"), "Yo sumo el costo y le pongo un 30 % encima.");
      await clic(enPost(id, ".com-form [type=submit]"));
      await esperar(`document.querySelector('${enPost(id)}').textContent.includes("un 30 % encima")`);
      const n = await fila("select count(*)::int n from public.jump_comentarios where post_id = $1 and autor_id = $2", [id, X.E2.id]);
      if (n.n !== 1) return "comentarios en la base: " + n.n;
      await abrirMuro(X.E);
      const t = await esperar(`document.querySelector('${enPost(id)}')?.textContent`);
      return (t.includes("un 30 % encima") && t.includes("Carlos M.") && t.includes("1 comentario")) || t.replace(/\s+/g, " ").slice(0, 300);
    },
    "muro-xss": async () => {
      const malo = "<img src=x onerror=alert(1)>";
      await abrirMuro(X.E2);
      await escribir("#muroTexto", malo);
      await clic("#muroForm [type=submit]");
      await esperar(`[...document.querySelectorAll(".post-text")].some((p) => p.textContent.includes(${JSON.stringify(malo)}))`);
      if (await ev(`!!document.querySelector('img[src="x"]')`)) return "se creó la imagen al publicar";
      await ir("e/inicio");
      await esperar(`location.hash === "#e/inicio" && !!document.querySelector(".page-head h1")`);
      await ir("e/muro");
      await esperar(`[...document.querySelectorAll(".post-text")].some((p) => p.textContent.includes(${JSON.stringify(malo)}))`);
      return !(await ev(`!!document.querySelector('img[src="x"]')`)) || "se creó la imagen al volver a cargar";
    },
    "muro-foto-ilegible": async () => {
      await abrirMuro(X.E2);
      const antes = [...sim.archivos.keys()].filter((k) => k.startsWith("jump-muro/")).length;
      const postsAntes = (await fila("select count(*)::int n from public.jump_posts")).n;
      await elegirArchivo('input[data-cambio="muroFoto"]', { nombre: "foto.jpg", tipo: "image/jpeg", contenido: "esto no es una foto, es texto" });
      const t = await esperar(`(() => { const e = document.querySelector("#muroErr"); return e && !e.hidden && e.textContent.trim(); })()`);
      await clic("#muroForm [type=submit]");
      await dormir(500);
      const despues = [...sim.archivos.keys()].filter((k) => k.startsWith("jump-muro/")).length;
      const postsDespues = (await fila("select count(*)::int n from public.jump_posts")).n;
      if (!t.includes("Esa foto no se pudo leer. Prueba con otra o toma una captura de pantalla.")) return "mensaje: " + t;
      if (await ev(`!document.querySelector("#muroPrevia").hidden`)) return "quedó la vista previa";
      return (despues === antes && postsDespues === postsAntes) || `subió algo: archivos ${antes}→${despues}, publicaciones ${postsAntes}→${postsDespues}`;
    },
    "muro-ocultar": async () => {
      const id = await sembrarPost(X.E, "Vendo canguil en la esquina de la cancha.");
      await abrirMuro(X.A, { equipo: true });
      await esperar(`!!document.querySelector('${enPost(id, '[data-act="muroOcultar"]')}')`);
      await clic(enPost(id, '[data-act="muroOcultar"]'));
      await esperar(`document.querySelector('${enPost(id)}')?.textContent.includes("Oculto por el equipo")`);
      // Oculta y sin comentarios: no queda un bloque de comentarios vacío (una raya y un hueco al pie de la tarjeta).
      if (await ev(`!!document.querySelector('${enPost(id, ".post-coms")}')`)) return "la publicación oculta dibuja un bloque de comentarios vacío";
      await foto("muro-oculto-equipo");
      const f = await fila("select oculto_en, oculto_por from public.jump_posts where id = $1", [id]);
      if (!f.oculto_en || f.oculto_por !== X.A.id) return "en la base: " + JSON.stringify(f);
      await abrirMuro(X.E2);
      await esperar(`!document.querySelector("#muroLista .is-loading")`);
      if (await ev(`!!document.querySelector('${enPost(id)}')`)) return "E2 todavía la ve";
      await abrirMuro(X.E);
      const t = await esperar(`document.querySelector('${enPost(id)}')?.textContent`);
      await foto("muro-oculto-autor");
      return t.includes("El equipo ocultó esta publicación") || t.replace(/\s+/g, " ").slice(0, 200);
    },
    "muro-limite": async () => {
      const ya = (await fila("select count(*)::int n from public.jump_posts where autor_id = $1 and creado_en > now() - interval '24 hours'", [X.E2.id])).n;
      for (let i = ya; i < 10; i++) await sembrarPost(X.E2, `Publicación de relleno ${i + 1}`);
      await abrirMuro(X.E2);
      await escribir("#muroTexto", "La número once.");
      erroresEsperados = [[/\/rest\/v1\/jump_posts\?select=\*$/, /status of 400/]]; // la base rechaza la 11.ª (trigger)
      let t;
      try {
        await clic("#muroForm [type=submit]");
        t = await esperar(`(() => { const e = document.querySelector("#muroErr"); return e && !e.hidden && e.textContent.trim(); })()`);
        await dormir(300); // que llegue el registro del 400 mientras se acepta
      } finally { erroresEsperados = []; }
      const n = (await fila("select count(*)::int n from public.jump_posts where autor_id = $1 and creado_en > now() - interval '24 hours'", [X.E2.id])).n;
      if (n !== 10) return "publicaciones: " + n;
      return t.includes("Llegaste al límite de 10 publicaciones por día.") || "mensaje: " + t;
    },
    "muro-borrar": async () => {
      await abrirMuro(X.E);
      await escribir("#muroTexto", "Esta la voy a borrar.");
      await elegirArchivo('input[data-cambio="muroFoto"]');
      await esperar(`!document.querySelector("#muroPrevia").hidden`);
      await clic("#muroForm [type=submit]");
      const f = await esperar(`(() => { const t = [...document.querySelectorAll("#muroLista [data-post]")].find((a) => a.textContent.includes("Esta la voy a borrar.")); return t && t.dataset.post; })()`);
      const p = await fila("select foto from public.jump_posts where id = $1", [f]);
      if (!p?.foto || !sim.archivos.has("jump-muro/" + p.foto)) return "no se subió la foto";
      await clic(enPost(f, '[data-act="muroBorrar"]'));
      await esperar(`!!document.querySelector("#dlgBorrarPost[open]")`);
      await foto("muro-borrar-confirmar");
      await clic("#borrarPostForm [type=submit]");
      await esperar(`!document.querySelector('${enPost(f)}')`);
      const sigue = await fila("select id from public.jump_posts where id = $1", [f]);
      if (sigue) return "la fila sigue en la base";
      return !sim.archivos.has("jump-muro/" + p.foto) || "la foto sigue en Storage";
    },
    "muro-movil": async () => {
      await sembrarPost(X.E, "Palabra-larguísima-sin-espacios-".repeat(8) + " para ver que no desborda."); // E2 ya llegó al límite
      await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      try {
        await abrirMuro(X.E);
        await esperar(`document.querySelectorAll("#muroLista [data-post]").length > 0`);
        await dormir(200);
        const e = await desborde();
        await foto("muro-390");
        await abrirMuro(X.A, { equipo: true });
        await esperar(`document.querySelectorAll("#muroLista [data-post]").length > 0`);
        await dormir(200);
        const a = await desborde();
        return (e === 0 && a === 0) || `desborde: emprendedor ${e}px, equipo ${a}px`;
      } finally {
        await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: movil });
      }
    },
    csp: async () => {
      const csp = consola.filter((c) => /Content Security Policy|Refused to/i.test(c));
      return csp.length === 0 || csp.join(" | ");
    },
  },

  ajustes: {
    "espacio-material": async () => {
      await sql("delete from public.jump_materiales where tipo = 'archivo'");
      await abrirAjustes();
      await esperar(`!!document.querySelector("#espacioEstado")`);
      const vacio = await texto("#espacioEstado");
      if (!vacio.includes("0 MB de 1 GB") || !vacio.includes("0 archivos")) return "sin archivos: " + vacio;
      if (await ev(`!!document.querySelector("#espacioAviso")`)) return "avisa sin haber usado nada";
      const mb = (n) => n * 1024 * 1024;
      await sql(`insert into public.jump_materiales (mentoria_id, nombre, tipo, ruta, bytes, mime) values
        ($1, 'Guía grande.pdf', 'archivo', $2, $3, 'application/pdf'), ($1, 'Plantilla.xlsx', 'archivo', $4, $5, 'application/vnd.ms-excel')`,
        [X.P, `${X.P}/a-guia.pdf`, mb(700), `${X.P}/b-plantilla.xlsx`, mb(50)]);
      try {
        await ir("a/mentorias"); await ir("a/ajustes"); // otra visita: vuelve a cargar los datos
        await send("Page.reload");
        await esperar(`!!document.querySelector("#espacioEstado")`);
        const medio = await texto("#espacioEstado");
        const barra = await ev(`document.querySelector("#espacioEstado").closest(".aj-body").querySelector(".bar").className`);
        const aviso = await ev(`document.querySelector("#espacioAviso")?.textContent.trim() ?? null`);
        await foto("ajustes-espacio-atencion");
        return (medio.includes("750,0 MB de 1 GB") && medio.includes("2 archivos") && /\batencion\b/.test(barra) && !!aviso && aviso.includes("buena parte"))
          || JSON.stringify({ medio, barra, aviso });
      } finally {
        await sql("delete from public.jump_materiales where tipo = 'archivo'");
      }
    },
    "zoom-conectar": async () => {
      await asegurarZoom(false);
      await abrirAjustes();
      const antes = await texto("#zoomEstado");
      await foto("ajustes-zoom-sin-conectar");
      const urls = [];
      await atraparZoomWeb(urls, async () => {
        await clic('[data-act="zoomconectar"]');
        await esperar(`location.hostname === "zoom.us"`);
      });
      const u = new URL(urls[0]);
      if (u.pathname !== "/oauth/authorize" || u.searchParams.get("client_id") !== "zoom-id") return "autorización: " + urls[0];
      // Zoom devuelve a la persona al callback con el código y el mismo state.
      await send("Page.navigate", { url: sim.url + "/api/jump-zoom-callback?" + new URLSearchParams({ code: "codigo-ui", state: u.searchParams.get("state") }) });
      await esperar(`location.pathname === "/jump/comunidad/" && !!document.querySelector('[data-act="zoomdesconectar"]')`);
      await esperar(`location.hash === "#a/ajustes"`); // se limpió ?zoom=aviso
      const t = await texto("#zoomEstado");
      const aviso = await esperar(`document.querySelector("#toast.show")?.textContent.trim()`);
      await foto("ajustes-zoom-conectada");
      return (antes.includes("Sin conectar") && t.includes("Conectada como") && t.includes("jump@zoom.test") && aviso.includes("Zoom quedó conectado")) || JSON.stringify({ antes, t, aviso });
    },
    "zoom-desconectar": async () => {
      await asegurarZoom(true);
      await abrirAjustes();
      await esperar(`!!document.querySelector('[data-act="zoomdesconectar"]')`);
      await clic('[data-act="zoomdesconectar"]');
      await esperar(`document.querySelector("#dlgZoomOff")?.open`);
      await foto("ajustes-zoom-desconectar");
      await clic('#dlgZoomOff [data-act="cerrar"]');
      if (!(await apiAdmin("zoom-estado")).conectada) return "Cancelar desconectó la cuenta";
      await clic('[data-act="zoomdesconectar"]');
      await esperar(`document.querySelector("#dlgZoomOff")?.open`);
      await clic("#zoomOffForm [type=submit]");
      await esperar(`!document.querySelector("#dlgZoomOff")?.open && !document.querySelector('[data-act="zoomdesconectar"]')`);
      const t = await texto("#zoomEstado");
      const z = await apiAdmin("zoom-estado");
      return (!z.conectada && t.includes("Sin conectar")) || JSON.stringify({ t, z });
    },
    "zoom-no-configurado": async () => {
      const guardado = { id: process.env.ZOOM_CLIENT_ID, secreto: process.env.ZOOM_CLIENT_SECRET };
      delete process.env.ZOOM_CLIENT_ID;
      delete process.env.ZOOM_CLIENT_SECRET;
      try {
        await abrirAjustes();
        const t = await texto("#zoomEstado");
        const boton = await ev(`!!document.querySelector('[data-act="zoomconectar"]')`);
        await foto("ajustes-zoom-no-configurado");
        return (t.includes("todavía no está configurado") && !boton) || JSON.stringify({ t, boton });
      } finally {
        process.env.ZOOM_CLIENT_ID = guardado.id;
        process.env.ZOOM_CLIENT_SECRET = guardado.secreto;
      }
    },
    "zoom-sin-respuesta": async () => {
      let t;
      await conZoomCaido(async () => {
        await abrirAjustes();
        t = await texto("#zoomEstado");
        if (!(await ev(`!!document.querySelector('[data-act="zoomreintentar"]')`))) throw new Error("sin botón para reintentar");
      });
      await foto("ajustes-zoom-sin-respuesta");
      await clic('[data-act="zoomreintentar"]');
      await esperar(`/Sin conectar|Conectada/.test(document.querySelector("#zoomEstado")?.textContent || "")`);
      return t.includes("No se pudo consultar") || t;
    },
    "equipo-agregar": async () => {
      await abrirAjustes();
      await esperar(`!!document.querySelector('[data-act="equipoagregar"]')`);
      const propia = await ev(`(() => { const f = document.querySelector('[data-equipo="${X.A.id}"]'); return f ? { tu: f.textContent.includes("Tú"), suspender: !!f.querySelector('[data-act="suspender"]') } : null; })()`);
      if (!propia || !propia.tu || propia.suspender) return "la fila propia: " + JSON.stringify(propia);
      await clic('[data-act="equipoagregar"]');
      await esperar(`document.querySelector("#dlgEquipo")?.open`);
      await clic("#equipoForm [type=submit]");
      const vacios = await ev(`document.querySelectorAll("#equipoForm .err:not([hidden])").length`);
      if (vacios !== 2) return "errores con el formulario vacío: " + vacios;
      await escribir("#eqCorreo", "Ana.Torres@Correo.test");
      await escribir("#eqNombres", "Otra Persona");
      await clic("#equipoForm [type=submit]");
      const rep = await esperar(`!document.querySelector("#eqCorreoErr").hidden && document.querySelector("#eqCorreoErr").textContent`);
      if (!rep.includes("Ya existe una cuenta con ese correo")) return rep;
      await escribir("#eqCorreo", "no vale ñ");
      await clic("#equipoForm [type=submit]");
      const malo = await esperar(`!document.querySelector("#eqCorreoErr").hidden && document.querySelector("#eqCorreoErr").textContent`);
      if (!malo.includes("Revisa el correo")) return malo;
      await escribir("#eqCorreo", "luis.equipo@gmail.com");
      await escribir("#eqNombres", "Luis Alberto Mora");
      await foto("ajustes-equipo-agregar");
      await dobleClic("#equipoForm [type=submit]");
      await esperar(`document.querySelector("#dlgClave")?.open`);
      const clave = await texto("#claveCodigo"), titulo = await texto("#claveTitulo"), detalle = await texto("#claveTexto");
      const sinWa = await ev(`document.querySelector("#claveWa").hidden`);
      await foto("ajustes-equipo-clave");
      const filas = (await sql("select user_id, rol, debe_cambiar_clave from public.jump_miembros where correo = 'luis.equipo@gmail.com'")).rows;
      if (filas.length !== 1 || filas[0].rol !== "admin" || !filas[0].debe_cambiar_clave) return "cuentas creadas: " + JSON.stringify(filas);
      if (!/^JUMP-\d{4}-\d{4}$/.test(clave)) return "clave: " + clave;
      if (!titulo.includes("Cuenta creada para Luis") || !detalle.includes("luis.equipo@gmail.com") || detalle.includes("cédula") || !sinWa) return JSON.stringify({ titulo, detalle, sinWa });
      await clic('#dlgClave [data-act="cerrar"]');
      const N = filas[0].user_id;
      await esperar(`!!document.querySelector('${filaEquipo(N)}')`);
      // suspender y reactivar a la persona nueva
      await clic(filaEquipo(N, '[data-act="suspender"]'));
      await esperar(`document.querySelector("#dlgSusp")?.open`);
      await clic("#suspForm [type=submit]");
      await esperar(`!!document.querySelector('${filaEquipo(N, '[data-act="reactivar"]')}')`);
      const s = await fila("select estado from public.jump_miembros where user_id = $1", [N]);
      if (s.estado !== "suspendida") return "estado: " + s.estado;
      await clic(filaEquipo(N, '[data-act="reactivar"]'));
      await esperar(`!!document.querySelector('${filaEquipo(N, '[data-act="suspender"]')}')`);
      // clave nueva
      await clic(filaEquipo(N, '[data-act="clavenueva"]'));
      await esperar(`document.querySelector("#dlgReset")?.open`);
      await clic("#resetForm [type=submit]");
      await esperar(`document.querySelector("#dlgClave")?.open`);
      const nueva = await texto("#claveCodigo"), t2 = await texto("#claveTexto");
      if (!/^JUMP-\d{4}-\d{4}$/.test(nueva) || nueva === clave || !t2.includes("luis.equipo@gmail.com")) return JSON.stringify({ nueva, t2 });
      await clic('#dlgClave [data-act="cerrar"]');
      // lo que dice el servidor de la cuenta propia
      const r = await apiAdmin("suspender", { userId: X.A.id });
      return (r.status === 400 && r.error === "No puedes suspender tu propia cuenta.") || JSON.stringify(r);
    },
    "equipo-rechazo": async () => {
      erroresEsperados.push([/jump-admin/, /status of 404/]); // el rechazo de este escenario es a propósito
      const N = await adminNuevo("prueba.rechazo@gmail.com", "Prueba Rechazo");
      await abrirAjustes();
      await esperar(`!!document.querySelector('${filaEquipo(N)}')`);
      // la cuenta desaparece del servidor mientras la página la sigue mostrando
      await sql("delete from public.jump_miembros where user_id = $1", [N]);
      await clic(filaEquipo(N, '[data-act="suspender"]'));
      await esperar(`document.querySelector("#dlgSusp")?.open`);
      await clic("#suspForm [type=submit]");
      // el aviso del servidor se ve fuera de la ventana (detrás de una ventana modal no se vería)
      const aviso = await esperar(`!document.querySelector("#dlgSusp").open && document.querySelector("#toast.show")?.textContent.trim()`);
      await esperar(`!document.querySelector('${filaEquipo(N)}')`); // la lista se vuelve a pedir
      return aviso.includes("No encontramos esa cuenta") || aviso;
    },
    "ejemplos-cargar": async () => {
      if ((await apiAdmin("ejemplos-contar")).cargados) return "ya había ejemplos";
      await entrarEquipo();
      await esperar(`!!document.querySelector(".cupos")`);
      if (await ev(`!!document.querySelector("#franjaEjemplos")`)) return "la franja aparece sin ejemplos";
      await ir("a/ajustes");
      await esperar(`!!document.querySelector('[data-act="ejemploscargar"]')`);
      const antes = await texto("#ejemplosEstado");
      await foto("ajustes-ejemplos-vacio");
      await clic('[data-act="ejemploscargar"]');
      await esperar(`!!document.querySelector('[data-act="ejemplosborrar"]')`);
      const despues = await texto("#ejemplosEstado");
      const n = (await fila("select count(*)::int n from public.jump_miembros where es_ejemplo")).n;
      await ir("a/resumen");
      await esperar(`!!document.querySelector("#franjaEjemplos")`);
      const franja = await texto("#franjaEjemplos");
      await foto("ajustes-franja-ejemplos");
      return (antes.includes("No hay") && despues.includes("Cargados") && n > 0 && franja.includes("Hay datos de ejemplo cargados") && franja.includes("Borrar ejemplos")) || JSON.stringify({ antes, despues, n, franja });
    },
    "ejemplos-borrar": async () => {
      // una persona real comentó en una publicación de ejemplo: ese comentario también se va
      const post = (await fila("select id from public.jump_posts where es_ejemplo order by creado_en limit 1")).id;
      await sql("insert into public.jump_comentarios (post_id, autor_id, texto) values ($1, $2, 'Comentario real sobre un ejemplo')", [post, X.E.id]);
      await entrarEquipo();
      await esperar(`!!document.querySelector("#franjaEjemplos")`);
      await clic('#franjaEjemplos [data-act="ejemplosborrar"]');
      await esperar(`document.querySelector("#dlgBorrarEj")?.open`);
      const aviso = await texto("#borrarEjAviso");
      const dis = () => ev(`document.querySelector("#borrarEjForm [type=submit]").disabled`);
      if (!(await dis())) return "el botón rojo está activo sin escribir nada";
      await escribir("#borrarEjTexto", "borrar");
      if (!(await dis())) return "el botón se activó con minúsculas";
      await escribir("#borrarEjTexto", "BORRAR");
      if (await dis()) return "el botón sigue apagado con BORRAR";
      await foto("ajustes-ejemplos-borrar");
      await clic("#borrarEjForm [type=submit]");
      await esperar(`!document.querySelector("#dlgBorrarEj").open && !document.querySelector("#franjaEjemplos")`);
      const tablas = ["jump_miembros", "jump_mentorias", "jump_modulos", "jump_materiales", "jump_clases", "jump_avisos", "jump_posts", "jump_comentarios"];
      let quedan = 0;
      for (const t of tablas) quedan += (await fila(`select count(*)::int n from public.${t} where es_ejemplo`)).n;
      const real = await fila("select count(*)::int n from public.jump_comentarios where texto = 'Comentario real sobre un ejemplo'");
      const e = await fila("select count(*)::int n from public.jump_miembros where user_id = $1", [X.E.id]);
      if (quedan || real.n || e.n !== 1) return JSON.stringify({ quedan, comentarioRealSigue: real.n, emprendedorReal: e.n });
      return aviso.includes("1 comentario real") || aviso;
    },
    "ajustes-sin-desborde": async () => {
      await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      try {
        await asegurarZoom(true);
        await abrirAjustes();
        await esperar(`!!document.querySelector('[data-act="zoomdesconectar"]') && document.querySelectorAll("[data-equipo]").length > 1`);
        await dormir(200);
        const pagina = await desborde();
        await foto("ajustes-390");
        const caben = {};
        for (const [abrirDlg, id] of [['[data-act="equipoagregar"]', "dlgEquipo"], ['[data-act="zoomdesconectar"]', "dlgZoomOff"]]) {
          await clic(abrirDlg);
          await esperar(`document.querySelector("#${id}")?.open`);
          caben[id] = await ev(`(() => { const r = document.querySelector("#${id}").getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()`);
          await foto("ajustes-390-" + id);
          await clic(`#${id} [data-act="cerrar"]`);
        }
        return (pagina === 0 && Object.values(caben).every(Boolean)) || JSON.stringify({ pagina, caben });
      } finally {
        await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: movil });
      }
    },
    csp: async () => {
      const csp = consola.filter((c) => /Content Security Policy|Refused to/i.test(c));
      return csp.length === 0 || csp.join(" | ");
    },
  },
  postulaciones: {
    "landing-postula": async () => {
      await abrirLanding();
      const ingresar = await ev(`document.querySelector('a[href="/jump/comunidad/"]')?.textContent.trim() || ""`);
      if (ingresar !== "Ingresar") return "botón Ingresar: " + ingresar;
      if (await ev(`/Mockup para revisión|Demo del formulario|no envía datos/i.test(document.body.textContent)`)) return "quedó texto de demo";
      const trampa = await ev(`(() => { const r = document.querySelector('input[name="sitio"]').getBoundingClientRect(); return r.right <= 0 || r.width <= 1; })()`);
      if (!trampa) return "el campo trampa se ve";
      await clic("#sendBtn");
      const err = await esperar(`document.querySelector("#e-nombre").textContent`);
      if (!err.includes("nombre")) return "error con el formulario vacío: " + err;
      await llenarPostula({ nombre: "Marta Quiñónez", wa: "099 555 1234", negocio: "Postres Marta", sector: "La Aurora, etapa 2" });
      await foto("landing-postula-lleno");
      await clic("#sendBtn");
      await esperar(`document.querySelector("#form").classList.contains("done")`);
      const f = await fila("select * from public.jump_postulaciones where whatsapp = '0995551234'");
      if (!f || f.nombres !== "Marta Quiñónez" || f.negocio !== "Postres Marta" || f.rubro !== "Comida y bebidas" || f.ruc !== "no" || f.estado !== "nueva") return JSON.stringify(f);
      const ok = await texto("#okTitulo");
      await foto("landing-postula-enviada");
      if (!ok.includes("recibida")) return "aviso: " + ok;
      // El mismo número otra vez (escrito distinto): no se duplica y se le dice que ya la tenemos.
      await abrirLanding();
      await llenarPostula({ nombre: "Marta Q.", wa: "+593 99 555 1234", negocio: "Postres Marta", sector: "Etapa 2" });
      await clic("#sendBtn");
      await esperar(`document.querySelector("#form").classList.contains("done")`);
      const otra = await texto("#okTitulo");
      const n = (await fila("select count(*)::int n from public.jump_postulaciones where whatsapp = '0995551234'")).n;
      return (otra.includes("Ya teníamos") && n === 1) || JSON.stringify({ otra, n });
    },
    "landing-limite": async () => {
      // Cinco envíos de hoy desde la misma conexión: el sexto se frena y se avisa sin perder lo escrito.
      const { huellaIp } = await import("../../../api/_jump/secretos.js");
      const h = await huellaIp(""); // el simulador no pasa X-Forwarded-For: todo el navegador es la misma conexión
      await sql(`insert into public.jump_postulaciones (nombres, whatsapp, negocio, rubro, sector, ruc, ip_hash)
        select 'Prueba ' || i, '09800000' || lpad(i::text, 2, '0'), 'Negocio', 'Otro', 'Etapa 1', 'no', $1 from generate_series(1, 5) i`, [h]);
      try {
        await abrirLanding();
        await llenarPostula({ nombre: "Jorge Mora", wa: "0991110000", negocio: "Jugos Jorge", sector: "Etapa 4" });
        await clic("#sendBtn");
        const aviso = await esperar(`document.querySelector("#e-form").textContent`);
        const estado = await ev(`({ hecho: document.querySelector("#form").classList.contains("done"), boton: document.querySelector("#sendBtn").disabled, nombre: document.querySelector("#f-nombre").value })`);
        await foto("landing-limite");
        const n = (await fila("select count(*)::int n from public.jump_postulaciones where whatsapp = '0991110000'")).n;
        return (aviso.includes("varias postulaciones") && !estado.hecho && !estado.boton && estado.nombre === "Jorge Mora" && n === 0) || JSON.stringify({ aviso, estado, n });
      } finally {
        await sql("delete from public.jump_postulaciones where ip_hash = $1 and nombres like 'Prueba %'", [h]);
      }
    },
    "panel-lista": async () => {
      await sql(`insert into public.jump_postulaciones (nombres, whatsapp, negocio, rubro, sector, ruc, estado, creado_en) values
        ('Luis Andrade', '0981112233', 'Llaveros Luis', 'Artesanías y decoración', 'Etapa 3', 'tramite', 'nueva', now() - interval '2 days'),
        ('Carla Vera', '0972223344', 'Uñas Carla', 'Belleza y cuidado personal', 'Etapa 1', 'si', 'contactada', now() - interval '3 days'),
        ('Pedro Mite', '0963334455', 'Prueba', 'Otro', 'Ninguno', 'no', 'descartada', now() - interval '4 days')`);
      await entrarEquipo();
      const insignia = await esperar(`document.querySelector('.side a[href="#a/postulaciones"] .nav-badge')?.textContent.trim()`);
      if (!insignia.startsWith("2")) return "insignia: " + insignia;
      const pendiente = await esperar(`document.querySelector('.todo a[href="#a/postulaciones"]')?.closest("li").textContent`);
      if (!pendiente.includes("2 postulaciones nuevas")) return "resumen: " + pendiente;
      await ir("a/postulaciones");
      // Por defecto, solo las nuevas y de la más nueva a la más vieja.
      await esperar(`document.querySelectorAll("[data-post]").length === 2`);
      const nombres = await ev(`[...document.querySelectorAll("[data-post] .who b")].map((b) => b.textContent.trim())`);
      if (nombres.join("|") !== "Marta Quiñónez|Luis Andrade") return "orden: " + nombres.join("|");
      const wa = await ev(`document.querySelector('[data-post] a[href^="https://wa.me/593995551234"]')?.target || ""`);
      if (wa !== "_blank") return "sin enlace de WhatsApp";
      await foto("a-postulaciones");
      await clic('[data-act="pfiltro"][data-f="todas"]');
      await esperar(`document.querySelectorAll("[data-post]").length === 4`);
      await escribir("#postQ", "uñas");
      await esperar(`document.querySelectorAll("[data-post]").length === 1`);
      const sola = await texto("[data-post] .who b");
      await ev(`(() => { const i = document.querySelector("#postQ"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
      await esperar(`document.querySelectorAll("[data-post]").length === 4`);
      const pagina = await desborde();
      // .table-panel recorta lo que se sale: se revisa que filtros y botones de cada fila quepan dentro de él.
      const fuera = await ev(`(() => { const p = document.querySelector(".table-panel").getBoundingClientRect();
        return [...document.querySelectorAll(".table-panel .seg button, .table-panel .row-actions .btn")].filter((b) => { const r = b.getBoundingClientRect(); return r.right > p.right + 0.5 || r.left < p.left - 0.5; }).map((b) => b.textContent.trim()); })()`);
      return (sola === "Carla Vera" && pagina === 0 && !fuera.length) || JSON.stringify({ sola, pagina, fuera });
    },
    "panel-estados": async () => {
      const luis = await fila("select id from public.jump_postulaciones where whatsapp = '0981112233'");
      await entrarEquipo();
      await ir("a/postulaciones");
      await esperar(`!!document.querySelector('[data-act="pcontactada"][data-id="${luis.id}"]')`);
      await clic(`[data-act="pcontactada"][data-id="${luis.id}"]`);
      const aviso = await esperar(`document.querySelector("#toast.show")?.textContent.trim()`);
      await esperar(`!document.querySelector('[data-post="${luis.id}"]')`); // sale de «Nuevas»
      const e1 = (await fila("select estado from public.jump_postulaciones where id = $1", [luis.id])).estado;
      // Deshacer la devuelve a nuevas.
      await clic("#toast.show button");
      await esperar(`!!document.querySelector('[data-post="${luis.id}"]')`);
      const e2 = (await fila("select estado from public.jump_postulaciones where id = $1", [luis.id])).estado;
      await clic(`[data-act="pdescartar"][data-id="${luis.id}"]`);
      await esperar(`!document.querySelector('[data-post="${luis.id}"]')`);
      const e3 = (await fila("select estado from public.jump_postulaciones where id = $1", [luis.id])).estado;
      await clic('[data-act="pfiltro"][data-f="descartada"]');
      await esperar(`!!document.querySelector('[data-act="pnueva"][data-id="${luis.id}"]')`);
      await clic(`[data-act="pnueva"][data-id="${luis.id}"]`);
      await esperar(`!document.querySelector('[data-post="${luis.id}"]')`);
      const e4 = (await fila("select estado from public.jump_postulaciones where id = $1", [luis.id])).estado;
      return (aviso.includes("contactada") && [e1, e2, e3, e4].join() === "contactada,nueva,descartada,nueva") || JSON.stringify({ aviso, e: [e1, e2, e3, e4] });
    },
    "panel-borrar": async () => {
      const pedro = await fila("select id from public.jump_postulaciones where whatsapp = '0963334455'");
      await entrarEquipo();
      await ir("a/postulaciones");
      await esperar(`!!document.querySelector('[data-act="pfiltro"]')`);
      await clic('[data-act="pfiltro"][data-f="descartada"]');
      await esperar(`!!document.querySelector('[data-act="pborrar"][data-id="${pedro.id}"]')`);
      await clic(`[data-act="pborrar"][data-id="${pedro.id}"]`);
      await esperar(`document.querySelector("#dlgBorrarPostu")?.open`);
      const quien = await texto("#borrarPostuNombre");
      await foto("a-postulaciones-borrar");
      // Cancelar no borra nada.
      await clic('#dlgBorrarPostu [data-act="cerrar"]');
      if ((await fila("select count(*)::int n from public.jump_postulaciones where id = $1", [pedro.id])).n !== 1) return "se borró al cancelar";
      await clic(`[data-act="pborrar"][data-id="${pedro.id}"]`);
      await esperar(`document.querySelector("#dlgBorrarPostu")?.open`);
      await clic("#borrarPostuForm [type=submit]");
      await esperar(`!document.querySelector("#dlgBorrarPostu").open && !document.querySelector('[data-post="${pedro.id}"]')`);
      const n = (await fila("select count(*)::int n from public.jump_postulaciones where id = $1", [pedro.id])).n;
      return (quien === "Pedro Mite" && n === 0) || JSON.stringify({ quien, n });
    },
    "panel-crear-cuenta": async () => {
      const carla = await fila("select id from public.jump_postulaciones where whatsapp = '0972223344'");
      const ced = await cedulaNueva("092222222");
      await entrarEquipo();
      await ir("a/postulaciones");
      await esperar(`!!document.querySelector('[data-act="pfiltro"]')`);
      await clic('[data-act="pfiltro"][data-f="contactada"]');
      await esperar(`!!document.querySelector('[data-act="pcuenta"][data-id="${carla.id}"]')`);
      await clic(`[data-act="pcuenta"][data-id="${carla.id}"]`);
      await esperar(`document.querySelector("#dlgAdd")?.open`);
      const llenos = await ev(`({ n: document.querySelector("#adNombres").value, w: document.querySelector("#adWa").value, ne: document.querySelector("#adNegocio").value,
        c: document.querySelector("#adCedula").value, foco: document.activeElement?.id })`);
      if (llenos.n !== "Carla Vera" || llenos.w !== "0972223344" || llenos.ne !== "Uñas Carla" || llenos.c !== "" || llenos.foco !== "adCedula") return JSON.stringify(llenos);
      await escribir("#adCedula", ced);
      await clic("#addForm [type=submit]");
      await esperar(`document.querySelector("#dlgClave")?.open`);
      await clic('#dlgClave [data-act="cerrar"]');
      const m = await fila("select nombres, negocio, whatsapp from public.jump_miembros where cedula = $1", [ced]);
      if (!m || m.whatsapp !== "0972223344" || m.negocio !== "Uñas Carla") return "cuenta: " + JSON.stringify(m);
      // La fila ahora dice que ya tiene cuenta y no ofrece crearla otra vez.
      const t = await esperar(`!document.querySelector('[data-act="pcuenta"][data-id="${carla.id}"]') && document.querySelector('[data-post="${carla.id}"]')?.textContent`);
      await foto("a-postulaciones-cuenta");
      return t.includes("Tiene cuenta") || t;
    },
    "sin-migracion": async () => {
      // Si la base todavía no tiene la tabla (no se corrió la migración 0002), el panel sigue funcionando y lo explica.
      erroresEsperados.push([/jump_postulaciones/, /404/]);
      await sql("drop table public.jump_postulaciones");
      await entrarEquipo();
      await esperar(`!!document.querySelector(".cupos")`);
      if (await ev(`!!document.querySelector('.todo a[href="#a/postulaciones"]')`)) return "el resumen avisa postulaciones sin tabla";
      await ir("a/postulaciones");
      const t = await esperar(`document.querySelector("#page .empty")?.textContent`);
      return t.includes("todavía no están activadas") || t;
    },
    csp: async () => {
      const csp = consola.filter((c) => /Content Security Policy|Refused to/i.test(c));
      return csp.length === 0 || csp.join(" | ");
    },
  },
  jc: {
    // ---------- landing: encuesta real ----------
    "landing-encuesta-real": async () => {
      const e = await sembrarEncuesta();
      await landing("encuestas");
      const estado = await ev(`document.querySelector("#poll").dataset.estado`);
      const q = await texto("#pollQ");
      if (estado !== "abierta" || q !== "¿Qué taller quieres para diciembre?") return JSON.stringify({ estado, q });
      const b = await barras();
      const esperado = [["Fotos de producto con el celular", "75 %"], ["Cómo sacar el RUC sin enredos", "25 %"], ["Vender por WhatsApp Business", "0 %"]];
      if (JSON.stringify(b.map((x) => [x.t, x.pct])) !== JSON.stringify(esperado) || b.some((x) => x.mia || x.off) || b[0].id !== e.o[0]) return "barras: " + JSON.stringify(b);
      const votos = await texto("#votes");
      if (votos !== "Toca una opción para votar") return "votos: " + votos;
      // Las barras suben hasta su porcentaje al verse la tarjeta (en el celular queda debajo del texto de la sección).
      await ev(`document.querySelector("#poll").scrollIntoView({ block: "center", behavior: "instant" }), true`);
      await esperar(`document.querySelector("#opts .opt .fill").getBoundingClientRect().width > document.querySelector("#opts .opt").getBoundingClientRect().width * .7`);
      await foto("landing-encuesta");
      return true;
    },
    "landing-voto-cambia": async () => {
      const e = await sembrarEncuesta();
      await landing("encuestas");
      await clic(`#opts .opt[data-id="${e.o[1]}"]`);
      await esperar(`document.querySelector("#opts .opt.mine")?.dataset.id === ${JSON.stringify(e.o[1])}`);
      let b = await barras();
      if (JSON.stringify(b.map((x) => x.pct)) !== JSON.stringify(["60 %", "40 %", "0 %"])) return "después de votar: " + JSON.stringify(b);
      if ((await texto("#votes")) !== "Ya votaste · puedes cambiar tu voto") return "votos: " + (await texto("#votes"));
      if ((await votosPublicos(e.id)) !== 4) return "votos públicos: " + (await votosPublicos(e.id));
      const guardado = await ev(`({ voto: localStorage.getItem("jump.voto.${e.id}"), aparato: localStorage.getItem("jump.dispositivo") })`);
      if (guardado.voto !== e.o[1] || !/^[A-Za-z0-9_-]{16,64}$/.test(guardado.aparato || "")) return "guardado: " + JSON.stringify(guardado);
      await foto("landing-voto");
      // Al volver, la página recuerda el voto y lo muestra contado (sin caché vieja); cambiarlo no suma otro.
      await landing("encuestas", { limpiar: false });
      if ((await ev(`document.querySelector("#opts .opt.mine")?.dataset.id`)) !== e.o[1]) return "no recordó el voto";
      if (JSON.stringify((await barras()).map((x) => x.pct)) !== JSON.stringify(["60 %", "40 %", "0 %"])) return "al recargar: " + JSON.stringify(await barras());
      await clic(`#opts .opt[data-id="${e.o[2]}"]`);
      await esperar(`document.querySelector("#opts .opt.mine")?.dataset.id === ${JSON.stringify(e.o[2])}`);
      b = await barras();
      const n = await votosPublicos(e.id);
      const mio = await fila("select opcion_id from public.jump_encuesta_votos where encuesta_id = $1 and origen = 'publico' and dispositivo_hash not like 'semilla-%'", [e.id]);
      return (JSON.stringify(b.map((x) => x.pct)) === JSON.stringify(["60 %", "20 %", "20 %"]) && n === 4 && mio.opcion_id === e.o[2]) || JSON.stringify({ b, n, mio });
    },
    "landing-voto-tope": async () => {
      // Treinta aparatos ya votaron desde esta conexión: el siguiente se frena con un aviso y nada se marca como suyo.
      const { huellaIp } = await import("../../../api/_jump/secretos.js");
      const h = await huellaIp(""); // el simulador no pasa X-Forwarded-For: todo el navegador es la misma conexión
      const e = await sembrarEncuesta();
      await sql("insert into public.jump_encuesta_votos (encuesta_id, opcion_id, origen, dispositivo_hash, ip_hash) select $1, $2, 'publico', 'tope-' || i, $3 from generate_series(1, 30) i", [e.id, e.o[2], h]);
      await landing("encuestas");
      await clic(`#opts .opt[data-id="${e.o[1]}"]`);
      const m = await esperar(`document.querySelector("#pollMsg.err")?.textContent`);
      const estado = await ev(`({ mia: !!document.querySelector("#opts .opt.mine"), off: [...document.querySelectorAll("#opts .opt")].some((b) => b.disabled), guardado: localStorage.getItem("jump.voto.${e.id}") })`);
      return (m === "Ya llegaron muchos votos desde esta conexión. Intenta más tarde." && !estado.mia && !estado.off && !estado.guardado) || JSON.stringify({ m, estado });
    },
    "landing-ver-todas": async () => {
      // Con más de 8 opciones se ven las 8 más votadas y un botón «Ver todas».
      const e = await sembrarEncuesta();
      for (let i = 0; i < 7; i++) {
        const { id } = await fila("insert into public.jump_encuesta_opciones (encuesta_id, texto, orden) values ($1, $2, $3) returning id", [e.id, `Idea extra número ${i + 1}`, 10 + i]);
        if (i < 6) await sql("insert into public.jump_encuesta_votos (encuesta_id, opcion_id, origen, dispositivo_hash, ip_hash) values ($1, $2, 'publico', $3, 'ip-semilla')", [e.id, id, "extra-" + i]);
      }
      // Sin votos quedan «Vender por WhatsApp Business» y la idea 7: son las que no entran.
      await landing("encuestas");
      let b = await barras();
      const boton = await texto("#pollMas");
      if (b.length !== 8 || b.some((x) => x.t === "Vender por WhatsApp Business" || x.t === "Idea extra número 7")) return "8 más votadas: " + JSON.stringify(b.map((x) => x.t));
      if (!/^Ver todas/.test(boton || "")) return "botón: " + boton;
      await clic("#pollMas");
      b = await barras();
      return (b.length === 10 && !(await ev(`!!document.querySelector("#pollMas:not([hidden])")`))) || JSON.stringify(b.map((x) => x.t));
    },
    "landing-sin-encuesta": async () => {
      await sql("delete from public.jump_encuestas");
      await landing("encuestas");
      const vacia = await ev(`({ estado: document.querySelector("#poll").dataset.estado, q: document.querySelector("#pollQ").textContent.trim(), n: document.querySelectorAll("#opts .opt").length, votos: document.querySelector("#votes").textContent.trim() })`);
      if (vacia.estado !== "vacia" || vacia.q !== "Pronto abriremos la primera encuesta" || vacia.n || vacia.votos) return "sin encuesta: " + JSON.stringify(vacia);
      await foto("landing-sin-encuesta");
      // Sin encuesta abierta se ve el resultado de la última cerrada, sin poder votar.
      const e = await sembrarEncuesta("cerrada");
      await landing("encuestas", { limpiar: false });
      const b = await barras();
      const votos = await texto("#votes");
      if (JSON.stringify(b.map((x) => x.pct)) !== JSON.stringify(["75 %", "25 %", "0 %"]) || !b.every((x) => x.off) || votos !== "Encuesta cerrada") return JSON.stringify({ b, votos });
      await clic(`#opts .opt[data-id="${e.o[2]}"]`);
      await dormir(400);
      return (await votosPublicos(e.id)) === 3 || "votó en una cerrada";
    },
    "landing-textos": async () => {
      await landing("encuestas");
      const t = await ev(`(() => {
        const s = document.querySelector("#encuestas"), q = (x) => s.querySelector(x);
        const faq = [...document.querySelectorAll("#preguntas details")].find((d) => d.querySelector("summary").textContent.includes("propongo"));
        return {
          pill: q(".pill-lock")?.textContent.trim(), candado: !!q(".pill-lock svg"), lead: q(".enc-copy .lead")?.textContent.trim(),
          pasos: [...s.querySelectorAll(".how li")].map((li) => li.querySelector("b").textContent.trim() + " — " + li.querySelector("span").textContent.trim()),
          demo: !!(q(".demo-tag") || q(".poll-note") || q("#propose")) || /Vista de ejemplo|no guarda nada|\\(demo\\)/.test(s.textContent),
          invita: q(".poll-invita")?.textContent.trim(), enlace: q(".poll-invita a")?.getAttribute("href"),
          faq: faq?.querySelector("p").textContent.trim(),
          css: [...document.styleSheets].some((x) => (x.href || "").endsWith("/jump/jc/jc.css")),
        };
      })()`);
      const esperado = {
        pill: "Vota aunque no estés inscrito", candado: false,
        lead: "Cualquiera puede votar por el taller que le serviría más. Los inscritos, además, proponen cursos nuevos. Con eso, JUMP sabe qué talleres abrir.",
        pasos: ["Propones — Los inscritos escriben, desde la Comunidad JUMP, el curso que les haría falta.",
          "Todos votan — Cualquiera puede votar aquí mismo, un voto por persona.",
          "Se abre el taller — Lo más pedido se convierte en el próximo taller de JUMP."],
        demo: false,
        invita: "¿Tienes una idea de curso? Inscríbete y proponla en la Comunidad JUMP.", enlace: "#postula",
        faq: "Cuando estés inscrito, entras a la Comunidad JUMP y propones tu curso en la Encuesta del mes. Para votar no necesitas cuenta: hazlo aquí mismo, en Encuestas.",
        css: true,
      };
      const malos = Object.keys(esperado).filter((k) => JSON.stringify(t[k]) !== JSON.stringify(esperado[k]));
      return !malos.length || malos.map((k) => `${k}: ${JSON.stringify(t[k])}`).join(" | ");
    },
    // ---------- landing: JC ----------
    "landing-jc-saluda": async () => {
      await landing();
      await esperar(`!!document.querySelector(".jc-escena:not(.entrando)")`);
      if (movil) {
        // En el celular la portada no deja ver su sitio al entrar: espera en la esquina, callado, hasta que bajas a la foto.
        await dormir(1500);
        const antes = { modo: await modoJC(), globo: await globoJC() };
        if (antes.modo !== "esquina" || antes.globo) return "al entrar: " + JSON.stringify(antes);
        await ev(`document.querySelector(".jc-sitio").scrollIntoView({ block: "center", behavior: "instant" }), true`);
      }
      const t = await esperar(`document.querySelector(".jc-globo.visible")?.textContent`, 9000);
      if (t !== "¡Hola, soy JC! Te acompaño mientras conoces JUMP.") return "saludo: " + t;
      if ((await modoJC()) !== "grande") return "modo: " + (await modoJC());
      await esperar(jcQuieto);
      const tapa = await tapaPortada();
      if (tapa) return tapa;
      await foto("landing-jc-saluda");
      // La segunda visita ya no saluda: anuncia la próxima clase (C1, «Dudas del RUC», es hoy).
      await landing("", { limpiar: false });
      if (movil) await ev(`document.querySelector(".jc-sitio").scrollIntoView({ block: "center", behavior: "instant" }), true`);
      const t2 = await esperar(`document.querySelector(".jc-globo.visible")?.textContent`, 9000);
      if (!t2.includes("«Dudas del RUC»") || t2.includes("Hola")) return "segunda visita: " + t2;
      await esperar(jcQuieto);
      const tapa2 = await tapaPortada();
      if (tapa2) return "con la clase: " + tapa2;
      // Al tocarlo salta y dice otra cosa.
      await clic(".jc-toque");
      const t3 = await esperar(`(() => { const g = document.querySelector(".jc-globo.visible")?.textContent; return g && g !== ${JSON.stringify(t2)} ? g : null; })()`, 9000);
      return !!t3 || "al tocarlo no cambió";
    },
    "landing-jc-esquina": async () => {
      // Sin clase que anunciar y con el saludo ya dicho: al llegar a Encuestas, JC (en la esquina) habla de la encuesta.
      await sql("update public.jump_clases set es_ejemplo = true");
      try {
        await landing();
        await ev(`localStorage.setItem("jc.dichos", JSON.stringify({ "saludo:landing": Date.now() })), true`);
        await landing("encuestas", { limpiar: false });
        const { FRASES } = await import("../../../jump/jc/frases.js");
        const t = await esperar(`document.querySelector(".jc-globo.visible")?.textContent`, 9000);
        if (!FRASES.landing.encuestas.some((f) => f.texto === t)) return "en Encuestas dijo: " + t;
        await esperar(jcQuieto);
        const r = await ev(`(() => { const j = document.querySelector(".jc").getBoundingClientRect(); return { modo: document.querySelector(".jc-escena").dataset.modo, der: Math.round(innerWidth - j.right), abajo: Math.round(innerHeight - j.bottom), alto: Math.round(j.height) }; })()`);
        const borde = movil ? 12 : 16;
        if (r.modo !== "esquina" || Math.abs(r.der - borde) > 2 || Math.abs(r.abajo - borde) > 2 || r.alto !== (movil ? 84 : 120)) return "esquina: " + JSON.stringify(r);
        await foto("landing-jc-esquina");
        // De vuelta arriba regresa a la portada (en el celular, cuando se ve su sitio junto a Josué).
        await ev(`scrollTo({ top: 0, behavior: "instant" }), true`);
        if (movil) {
          await dormir(600);
          if ((await modoJC()) !== "esquina") return "en el celular, arriba sin ver su sitio: " + (await modoJC());
          await ev(`document.querySelector(".jc-sitio").scrollIntoView({ block: "center", behavior: "instant" }), true`);
        }
        await esperar(`document.querySelector(".jc-escena").dataset.modo === "grande"`);
        await esperar(jcQuieto);
        const sitio = await ev(`(() => { const j = document.querySelector(".jc").getBoundingClientRect(), s = document.querySelector(".jc-sitio").getBoundingClientRect();
          return { dx: Math.round((j.left + j.right) / 2 - (s.left + s.right) / 2), dy: Math.round(j.bottom - s.bottom) }; })()`);
        return (Math.abs(sitio.dx) <= 2 && Math.abs(sitio.dy) <= 2) || "de vuelta en la portada: " + JSON.stringify(sitio);
      } finally {
        await sql("update public.jump_clases set es_ejemplo = false");
      }
    },
    "landing-jc-esconder": async () => {
      await landing();
      await esperar(`!!document.querySelector(".jc-escena:not(.entrando)")`);
      await clic(".jc-esconder");
      const e1 = await ev(`({ esc: document.querySelector(".jc-escena").classList.contains("escondido"), volver: !document.querySelector(".jc-volver").hidden, mem: localStorage.getItem("jc.escondido") })`);
      if (!e1.esc || !e1.volver || e1.mem !== "true") return "al esconderlo: " + JSON.stringify(e1);
      // Al volver sigue escondido (y callado) hasta que lo traen con la burbuja.
      await landing("", { limpiar: false });
      await esperar(`!!document.querySelector(".jc-escena")`);
      await dormir(1500);
      const e2 = await ev(`({ esc: document.querySelector(".jc-escena").classList.contains("escondido"), volver: !document.querySelector(".jc-volver").hidden, globo: !!document.querySelector(".jc-globo.visible") })`);
      if (!e2.esc || !e2.volver || e2.globo) return "al volver: " + JSON.stringify(e2);
      await foto("landing-jc-escondido");
      await clic(".jc-volver");
      const e3 = await ev(`({ esc: document.querySelector(".jc-escena").classList.contains("escondido"), volver: !document.querySelector(".jc-volver").hidden, mem: localStorage.getItem("jc.escondido") })`);
      return (!e3.esc && !e3.volver && e3.mem === "false") || "al traerlo: " + JSON.stringify(e3);
    },
    desborde: async () => {
      // Ni JC ni su globo ensanchan la página.
      await landing();
      await esperar(`!!document.querySelector(".jc-escena:not(.entrando)")`);
      await dormir(400);
      const d = await desborde();
      return d <= 0 || "desborde: " + d;
    },
    csp: async () => {
      const csp = consola.filter((c) => /Content Security Policy|Refused to/i.test(c));
      return csp.length === 0 || csp.join(" | ");
    },
  },
};

// Preparación por grupo (una vez, antes de sus escenarios).
const PREPARAR = {
  admin: async () => {
    const r = await apiAdmin("ejemplos-cargar");
    if (r.status !== 201 && r.status !== 200) throw new Error("no se cargaron los ejemplos: " + JSON.stringify(r));
  },
  postulaciones: async () => {
    // Los logos de Consalva Law vienen de su sitio: sin red no cargan y no es un error de la app.
    // El límite diario de la landing responde 429 a propósito.
    erroresEsperados.push([/consalvalaw\.com/, /./], [/\/api\/jump-postular$/, /429/]);
  },
  jc: async () => {
    // Los logos de Consalva Law vienen de su sitio. El tope de votos por conexión responde 429 a propósito.
    erroresEsperados.push([/consalvalaw\.com/, /./], [/\/api\/jump-publico$/, /429/]);
  },
  emprendedor: async () => {
    const r = await apiAdmin("ejemplos-cargar");
    if (r.status !== 201 && r.status !== 200) throw new Error("no se cargaron los ejemplos: " + JSON.stringify(r));
    await sql("update public.jump_miembros set whatsapp = null where user_id = $1", [X.E.id]);
  },
};

// ---------- correr ----------
const resultados = {};
const lista = ESCENARIOS[grupo];
if (lista && PREPARAR[grupo]) await PREPARAR[grupo]();
if (!lista) { console.error(`Grupo desconocido: ${grupo}. Hay: ${Object.keys(ESCENARIOS).join(", ")}`); process.exitCode = 2; }
for (const [nombre, fn] of Object.entries(lista || {})) {
  try {
    const r = await Promise.race([fn(), dormir(30000).then(() => "tiempo agotado")]);
    resultados[nombre] = r === true ? "ok" : String(r);
  } catch (e) {
    resultados[nombre] = "error: " + e.message;
    await foto("fallo-" + nombre).catch(() => {});
  }
}
console.log(JSON.stringify({ grupo, movil, resultados, consola }, null, 2));
if (Object.values(resultados).some((r) => r !== "ok") || consola.length) process.exitCode = 1;

ws.close();
chrome.kill();
await sim.cerrar();
await dormir(300);
try { rmSync(perfil, { recursive: true, force: true }); } catch {}
