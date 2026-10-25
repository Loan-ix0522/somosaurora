// Comunidad JUMP — arranque, rutas, menú y eventos.
// Rutas: #ingreso · #e/… (emprendedor) · #a/… (equipo). Cada módulo de vistas aporta rutas, acciones y envíos.
import { $, esc, ic, logo, fig, iniciales, toast } from "./ui.js";
import * as datos from "./datos.js";
import * as ingreso from "./vistas-ingreso.js";
import * as emprendedor from "./vistas-emprendedor.js";
import * as admin from "./vistas-admin.js";
import * as editor from "./vistas-editor.js";
import * as muro from "./vistas-muro.js";
import * as ajustes from "./vistas-ajustes.js";
import * as postulaciones from "./vistas-postulaciones.js";
import * as encuestas from "./vistas-encuestas.js";

export const estado = { yo: null, avisosNuevos: 0, postulacionesNuevas: 0, mensajeIngreso: "" };
const ACT = {}, ENVIOS = {}, ENTRADAS = {}, CAMBIOS = {}, RUTAS = [];
// Cada módulo de vistas aporta { rutas, acciones, envios, entradas, cambios, limpiar }.
const MODULOS = [ingreso, emprendedor, admin, editor, muro, ajustes, postulaciones, encuestas];
const MSG_SUSPENDIDA = "Tu cuenta está suspendida. Escríbele al equipo de JUMP.";
const MSG_SESION = "Tu sesión venció. Vuelve a entrar.";

export function registrar(acciones) { Object.assign(ACT, acciones); }
export function registrarEnvios(envios) { Object.assign(ENVIOS, envios); }
export function registrarEntradas(entradas) { Object.assign(ENTRADAS, entradas); }
export function registrarCambios(cambios) { Object.assign(CAMBIOS, cambios); }
// patron: "e/inicio" o RegExp sobre la ruta; vista: async ({ partes, query, path }) => html | { html, titulo, despues }
export function registrarRuta({ patron, activo, titulo, vista }) { RUTAS.push({ patron, activo, titulo, vista }); }

export const inicioDe = (m) => (m && m.rol === "admin" ? "a/resumen" : "e/inicio");
export function ir(hash) { if (location.hash === "#" + hash) render(); else location.hash = hash; }
export async function cerrarSesion(mensaje = "") {
  estado.yo = null;
  estado.avisosNuevos = 0;
  estado.postulacionesNuevas = 0;
  for (const m of MODULOS) m.limpiar?.(); // nada de lo cargado queda para la próxima persona
  await datos.salir();
  estado.mensajeIngreso = mensaje;
  ir("ingreso");
}
// Vuelve a dibujar la ruta actual (después de guardar algo).
export const refrescar = () => render();

// [ruta, ícono, nombre, nombre corto en la barra de abajo (null: va arriba, junto a "Salir")]
const MENU = {
  e: [["e/inicio", "home", "Inicio", "Inicio"], ["e/mentorias", "play", "Mentorías", "Mentorías"], ["e/clases", "video", "Clases en vivo", "Clases"],
    ["e/muro", "chat", "Comunidad", "Comunidad"], ["e/avisos", "mega", "Avisos", "Avisos"], ["e/perfil", "user", "Mi perfil", null]],
  a: [["a/resumen", "grid", "Resumen", "Resumen"], ["a/mentorias", "play", "Mentorías", "Mentorías"], ["a/clases", "video", "Clases en vivo", "Clases"],
    ["a/emprendedores", "users", "Emprendedores", "Personas"], ["a/postulaciones", "mail", "Postulaciones", null], ["a/muro", "chat", "Comunidad", "Comunidad"],
    ["a/avisos", "mega", "Avisos", null], ["a/ajustes", "gear", "Ajustes", null]],
};

export function shell(rol, activo, contenido) {
  const items = MENU[rol], yo = estado.yo || {};
  const home = rol === "e" ? "e/inicio" : "a/resumen";
  const nuevos = (h) => (h === "e/avisos" ? estado.avisosNuevos : h === "a/postulaciones" ? estado.postulacionesNuevas : 0);
  const actual = (h) => (activo === h ? 'aria-current="page"' : "");
  const quien = `<span class="ava">${esc(iniciales(yo.nombres) || "EJ")}</span><div class="sf-who"><b>${esc(yo.nombres || "Equipo JUMP")}</b><small>${esc(rol === "e" ? yo.negocio || "" : "Equipo JUMP")}</small></div>`;
  const salir = (cls) => `<button type="button" class="icon-btn ${cls}" data-act="salir" aria-label="Salir" title="Salir">${ic("logout")}</button>`;
  return `<div class="shell">
      <nav class="side" aria-label="Menú principal">
        <a class="side-logo" href="#${home}" aria-label="JUMP, inicio">${logo()}<span>${rol === "e" ? "Comunidad" : "Equipo"}<br>JUMP</span></a>
        ${items.map(([h, i, l]) => `<a class="nav-link" href="#${h}" ${actual(h)}>${ic(i)}<span>${l}</span>${nuevos(h) ? `<span class="nav-badge">${nuevos(h)}<span class="vh"> nuevos</span></span>` : ""}</a>`).join("")}
        <div class="side-foot">${quien}${salir("on-navy")}</div>
      </nav>
      <div class="main">
        <header class="mtop"><a class="mtop-l" href="#${home}" aria-label="JUMP, inicio">${logo()}<span>${rol === "e" ? "Comunidad" : "Equipo"}</span></a>
          <div class="mtop-r">${items.filter((x) => !x[3]).map(([h, i, l]) => `<a class="icon-btn" href="#${h}" aria-label="${l}" title="${l}" ${actual(h)}>${ic(i)}</a>`).join("")}${salir("")}</div></header>
        <main class="page" id="page" tabindex="-1">${contenido}</main>
      </div>
      <nav class="tabbar" aria-label="Menú">
        ${items.filter((x) => x[3]).map(([h, i, , c]) => `<a href="#${h}" ${actual(h)}><span class="ic-pill">${ic(i)}</span>${c}${nuevos(h) ? '<span class="dot" aria-hidden="true"></span>' : ""}</a>`).join("")}
      </nav>
    </div>`;
}

const noExiste = (rol) => `<div class="panel empty">${fig()}<h3>Esta página no existe</h3><p>Puede que el enlace esté mal escrito.</p>
  <a class="btn btn-primary" href="#${rol === "a" ? "a/resumen" : "e/inicio"}">Volver al inicio</a></div>`;
const errorCarga = (e) => `<div class="panel empty">${fig()}<h3>${e.codigo === "red" ? "No hay conexión" : "No se pudo cargar"}</h3>
  <p>${e.codigo === "red" ? "Revisa tu internet e intenta de nuevo." : "Algo salió mal de nuestro lado. Intenta de nuevo en un momento."}</p>
  <button type="button" class="btn btn-primary" data-act="reintentar">Intentar de nuevo</button></div>`;

// En cada cambio de página se pregunta a la base por la cuenta: si el equipo la suspendió mientras navegaba,
// se cierra la sesión. No frena el dibujo de la página (lo que ya está en pantalla lo tenía igual).
let vigilando = null;
function vigilarCuenta() {
  if (vigilando) return;
  vigilando = datos.yo()
    .then((m) => {
      if (!estado.yo) return;
      if (!m) return cerrarSesion();
      if (m.estado !== "activa") return cerrarSesion(MSG_SUSPENDIDA);
      estado.yo = { ...estado.yo, ...m };
    })
    .catch((e) => { if (e.codigo === "sesion") cerrarSesion(MSG_SESION); })
    .finally(() => { vigilando = null; });
}

let nRender = 0, ultima = "";
function pintar(n, path, titulo, html, despues) {
  if (n !== nRender) return;
  $("#app").innerHTML = html;
  document.title = `${titulo || "Comunidad JUMP"} · Comunidad JUMP`;
  if (path !== ultima) { window.scrollTo(0, 0); const pg = $("#page"); if (pg && ultima) pg.focus({ preventScroll: true }); }
  ultima = path;
  despues?.();
}

async function render() {
  const n = ++nRender;
  let raw = location.hash.slice(1);
  try { raw = decodeURIComponent(raw); } catch { /* hash mal formado */ }
  const [path, query = ""] = (raw || "ingreso").split("?");
  const partes = path.split("/");
  const yo = estado.yo;
  const listo = !!yo && yo.estado === "activa" && !yo.debeCambiarClave;

  if (path === "ingreso") {
    if (listo) return ir(inicioDe(yo));
    const v = ingreso.vista();
    return pintar(n, path, "Ingreso", v.html, v.despues);
  }
  if (partes[0] !== "e" && partes[0] !== "a") return ir(listo ? inicioDe(yo) : "ingreso");
  if (!listo) return ir("ingreso");
  if (partes[0] === "a" && yo.rol !== "admin") return ir("e/inicio");
  if (partes[0] === "e" && yo.rol === "admin") return ir("a/resumen");
  vigilarCuenta();

  const r = RUTAS.find((x) => (typeof x.patron === "string" ? x.patron === path : x.patron.test(path)));
  if (!r) return pintar(n, path, "Página no encontrada", shell(partes[0], "", noExiste(partes[0])));
  let out;
  try {
    out = await r.vista({ partes, query: new URLSearchParams(query), path });
  } catch (e) {
    if (n !== nRender) return;
    if (e.codigo === "sesion") return cerrarSesion(MSG_SESION);
    if (e.codigo === "suspendida") return cerrarSesion(MSG_SUSPENDIDA);
    if (e.codigo === "sin_acceso") return cerrarSesion("Esta cuenta no tiene acceso a la Comunidad JUMP.");
    console.warn("[jump] vista", path, e.codigo || e.message);
    return pintar(n, path, r.titulo, shell(partes[0], r.activo || path, errorCarga(e)));
  }
  const v = typeof out === "string" ? { html: out } : out;
  pintar(n, path, v.titulo || r.titulo, shell(partes[0], r.activo || path, v.html), v.despues);
}

// ---------- eventos (delegados) ----------
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]");
  if (!t || t.closest("[disabled]") || t.disabled) return;
  const fn = ACT[t.dataset.act];
  if (!fn) return;
  if (t.tagName === "A") e.preventDefault();
  fn(t, e);
});
document.addEventListener("submit", (e) => {
  e.preventDefault();
  // Por id; los formularios que se repiten (uno por fila) van por data-envio.
  const f = e.target, fn = ENVIOS[f.id] || ENVIOS[f.dataset.envio];
  if (fn) fn(f, f.querySelector("[type=submit]"), e);
});
document.addEventListener("input", (e) => {
  const fn = ENTRADAS[e.target.id] || ENTRADAS[e.target.dataset?.entrada];
  if (fn) fn(e.target, e);
});
// Archivos elegidos (y otros campos que solo avisan al cambiar): por data-cambio.
document.addEventListener("change", (e) => {
  const fn = CAMBIOS[e.target.dataset?.cambio];
  if (fn) fn(e.target, e);
});
// Red de seguridad: un error sin atender no deja la pantalla colgada.
addEventListener("unhandledrejection", (e) => {
  const err = e.reason;
  if (err instanceof datos.ErrorJump) {
    e.preventDefault();
    if (err.codigo === "sesion") return cerrarSesion(MSG_SESION);
    if (err.codigo === "suspendida") return cerrarSesion(MSG_SUSPENDIDA);
    // Un mensaje técnico de la base no se muestra tal cual.
    toast(err.codigo === "red" ? "No se pudo conectar. Revisa tu internet."
      : err.codigo === "servidor" ? "No se pudo completar. Intenta de nuevo."
      : err.mensaje || "No se pudo completar. Intenta de nuevo.");
  }
});

registrar({ salir: () => cerrarSesion(), reintentar: () => { for (const m of MODULOS) m.limpiar?.(); render(); } });
for (const m of MODULOS) {
  registrar(m.acciones || {});
  registrarEnvios(m.envios || {});
  registrarEntradas(m.entradas || {});
  registrarCambios(m.cambios || {});
  for (const r of m.rutas || []) registrarRuta(r);
}

async function arrancar() {
  try {
    await datos.iniciar();
    const m = await datos.yo();
    if (m && m.estado !== "activa") {
      await datos.salir();
      estado.mensajeIngreso = MSG_SUSPENDIDA;
    } else estado.yo = m;
  } catch (e) {
    if (e.codigo === "red") {
      $("#app").innerHTML = `<div class="login-panel">${errorCarga(e)}</div>`;
      registrar({ reintentar: () => location.reload() });
      return;
    }
    await datos.salir(); // sesión vieja o inválida: se empieza de cero
  }
  addEventListener("hashchange", render);
  render();
}

arrancar();
