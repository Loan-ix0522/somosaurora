// Pruebas de interfaz de la Comunidad JUMP en Chrome real (CDP), contra el Supabase simulado.
//
//   node tests/jump/ui/cdp.mjs <grupo> [--movil] [--fotos <carpeta>]
//
// Grupos: los de ESCENARIOS (abajo). Imprime un JSON { resultados: {escenario: "ok" | detalle}, consola: [...] }
// y sale con código 1 si algo falla. Necesita Chrome y red (supabase-js viene de jsDelivr, como en producción).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { iniciarSim } from "../sim/servidor.mjs";
import { crearEscenario } from "../sim/escenario.mjs";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const args = process.argv.slice(2);
const grupo = args[0] || "ingreso";
const movil = args.includes("--movil");
const fotos = args.includes("--fotos") ? args[args.indexOf("--fotos") + 1] : null;
const [W, H] = movil ? [390, 844] : [1366, 900];
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
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") consola.push("EXC " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consola.push("CON " + m.params.args.map((a) => a.value ?? a.description).join(" "));
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
    const url = m.params.entry.url || "";
    // Las fuentes de Google pueden fallar sin red; no son de la app.
    // Una clave mala o una cuenta baneada es un 400 de Auth que el navegador registra solo; la app lo maneja.
    const esperado = /fonts\.(googleapis|gstatic)\.com/.test(url) || (/\/auth\/v1\/token\?grant_type=password$/.test(url) && /status of 400/.test(m.params.entry.text));
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
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(fotos, `${movil ? "movil" : "escritorio"}-${nombre}.png`), Buffer.from(r.result.data, "base64"));
}
async function entrar(p, clave = "clave-prueba-1", { equipo = false } = {}) {
  await abrir("ingreso");
  if (equipo) { await clic('[data-act="lrole"][data-r="a"]'); await escribir("#lgUser", p.usuario); }
  else await escribir("#lgUser", cedulaDe(p));
  await escribir("#lgPass", clave);
  await clic("#loginForm [type=submit]");
}
const fila = async (sql, p) => (await sim.db.query(sql, p)).rows[0];
const sql = (q, p) => sim.db.query(q, p);
// La API real, como el equipo (A): para sembrar ejemplos o suspender a alguien mientras otro navega.
async function apiAdmin(accion, cuerpo = {}) {
  const t = await (await fetch(sim.url + "/supa/auth/v1/token?grant_type=password", { method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA }, body: JSON.stringify({ email: X.A.email, password: "clave-prueba-1" }) })).json();
  const r = await fetch(sim.url + "/api/jump-admin", { method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA, Origin: sim.url, Authorization: "Bearer " + t.access_token },
    body: JSON.stringify({ accion, ...cuerpo }) });
  return { status: r.status, ...(await r.json()) };
}
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
      await entrar({ usuario: "ana.admin" }, "clave-prueba-1", { equipo: true });
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
      await esperar(`location.hash === "#e/inicio"`);
      await clic('[data-act="salir"]');
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
};

// Preparación por grupo (una vez, antes de sus escenarios).
const PREPARAR = {
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
