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
  await entrar({ usuario: "ana.admin" }, "clave-prueba-1", { equipo: true });
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
};

// Preparación por grupo (una vez, antes de sus escenarios).
const PREPARAR = {
  admin: async () => {
    const r = await apiAdmin("ejemplos-cargar");
    if (r.status !== 201 && r.status !== 200) throw new Error("no se cargaron los ejemplos: " + JSON.stringify(r));
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
