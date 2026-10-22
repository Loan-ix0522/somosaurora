// Ingreso (cédula o correo + clave) y primer ingreso (clave nueva + aviso de privacidad).
import { $, esc, ic, logo, fieldErr, ocupado, toast } from "./ui.js";
import { cedulaValida, limpiarCedula, correoValido } from "./cedula.js";
import * as datos from "./datos.js";
import { estado, ir, inicioDe, cerrarSesion } from "./app.js";

let rolIngreso = "e";

const MENSAJES = {
  suspendida: "Tu cuenta está suspendida. Escríbele al equipo de JUMP.",
  sin_acceso: "Esta cuenta no tiene acceso a la Comunidad JUMP.",
  limite: "Hiciste muchos intentos seguidos. Espera unos minutos e intenta de nuevo.",
  red: "No se pudo conectar. Revisa tu internet e intenta de nuevo.",
};

function formIngreso() {
  const e = rolIngreso === "e";
  return `<form class="login-form" id="loginForm" novalidate>
      <div><h2>Entra a tu cuenta</h2></div>
      <p class="sub hint">Usa los datos que te dio el equipo de JUMP.</p>
      <div class="seg seg-block" role="group" aria-label="Tipo de cuenta">
        <button type="button" data-act="lrole" data-r="e" aria-pressed="${e}">Soy emprendedor(a)</button>
        <button type="button" data-act="lrole" data-r="a" aria-pressed="${!e}">Equipo JUMP</button>
      </div>
      <div class="banner banner-bad" id="loginBanner" role="alert" hidden></div>
      <div class="field"><label for="lgUser" class="label">${e ? "Cédula" : "Correo"}</label>
        <input class="input" id="lgUser" name="user" ${e ? 'inputmode="numeric" maxlength="13" placeholder="10 números"' : 'type="email" inputmode="email" maxlength="120" placeholder="tucorreo@gmail.com" autocapitalize="none" spellcheck="false"'} autocomplete="username" aria-describedby="lgUserErr">
        <p class="err" id="lgUserErr" hidden></p></div>
      <div class="field"><label for="lgPass" class="label">Clave</label>
        <span class="pw"><input class="input" id="lgPass" name="pass" type="password" maxlength="72" autocomplete="current-password" aria-describedby="lgPassErr">
        <button type="button" class="icon-btn" data-act="pw" aria-label="Mostrar clave" aria-controls="lgPass">${ic("eye")}</button></span>
        <p class="err" id="lgPassErr" hidden></p></div>
      <button class="btn btn-primary btn-block" type="submit">${ic("arrow")}Entrar</button>
      <p class="hint">¿Olvidaste tu clave? Escríbele al equipo de JUMP por WhatsApp y te dan una nueva.</p>
    </form>`;
}

function formClaveNueva() {
  return `<form class="login-form" id="newPassForm" novalidate>
      <h2>Crea tu clave nueva</h2>
      <p class="sub hint">Es tu primera vez en la Comunidad JUMP. Cambia la clave temporal por una que solo tú sepas.</p>
      <div class="banner banner-bad" id="npBanner" role="alert" hidden></div>
      <div class="field"><label for="np1" class="label">Clave nueva</label>
        <span class="pw"><input class="input" id="np1" type="password" maxlength="72" autocomplete="new-password" aria-describedby="npRules np1Err">
        <button type="button" class="icon-btn" data-act="pw" aria-label="Mostrar clave" aria-controls="np1">${ic("eye")}</button></span>
        <p class="err" id="np1Err" hidden></p></div>
      <ul class="rules" id="npRules"><li data-rule="len">${ic("check")}Al menos 8 caracteres</li><li data-rule="num">${ic("check")}Al menos un número</li></ul>
      <div class="field"><label for="np2" class="label">Repite la clave</label>
        <input class="input" id="np2" type="password" maxlength="72" autocomplete="new-password" aria-describedby="np2Err">
        <p class="err" id="np2Err" hidden></p></div>
      <div class="field">
        <label class="check"><input type="checkbox" id="npPriv" aria-describedby="npPrivErr"><span>Leí y acepto el <a href="/jump/comunidad/privacidad.html" target="_blank" rel="noopener">aviso de privacidad</a> de la Comunidad JUMP.</span></label>
        <p class="err" id="npPrivErr" hidden></p></div>
      <button class="btn btn-primary btn-block" type="submit">${ic("check")}Guardar y entrar</button>
      <p class="hint">¿No es tu cuenta? <a href="#ingreso" data-act="salir">Salir</a></p>
    </form>`;
}

export function vista() {
  const yo = estado.yo;
  const aviso = estado.mensajeIngreso;
  estado.mensajeIngreso = "";
  rolIngreso = "e";
  const caja = yo && yo.debeCambiarClave ? formClaveNueva() : formIngreso();
  return {
    html: `<div class="login">
      <div class="login-art">
        <img src="/jump/comunidad/assets/josue-charla.webp" alt="">
        <div class="login-art-top">${logo()}</div>
        <div class="login-art-copy"><h1>Comunidad JUMP</h1><p>Mentorías, clases en vivo y material para los emprendedores de La Aurora.</p></div>
      </div>
      <div class="login-panel"><div class="login-box" id="loginBox">${caja}</div></div>
    </div>`,
    despues: () => {
      if (aviso) mostrarBanner(yo && yo.debeCambiarClave ? "#npBanner" : "#loginBanner", aviso);
    },
  };
}

function mostrarBanner(sel, msg) {
  const b = $(sel);
  if (!b) return;
  b.hidden = false;
  b.innerHTML = `${ic("lock")}<span>${esc(msg)}</span>`;
}

export const acciones = {
  lrole: (b) => { rolIngreso = b.dataset.r; $("#loginBox").innerHTML = formIngreso(); $("#lgUser").focus(); },
  pw: (b) => {
    const inp = document.getElementById(b.getAttribute("aria-controls"));
    const ver = inp.type === "password";
    inp.type = ver ? "text" : "password";
    b.setAttribute("aria-label", ver ? "Ocultar clave" : "Mostrar clave");
    b.innerHTML = ic(ver ? "eye-off" : "eye");
  },
};

export const entradas = {
  np1: (el) => {
    $('[data-rule="len"]')?.classList.toggle("ok", el.value.length >= 8);
    $('[data-rule="num"]')?.classList.toggle("ok", /\d/.test(el.value));
  },
};

// Las mismas reglas que /api/jump-clave (errorDeClave): 8 a 72 caracteres, un número y distinta a la temporal.
export function errorClaveNueva(v) {
  if (v.length < 8 || !/\d/.test(v)) return "La clave debe tener al menos 8 caracteres y un número.";
  if (v.length > 72) return "La clave puede tener hasta 72 caracteres.";
  if (/^JUMP-\d{4}-\d{4}$/i.test(v)) return "Elige una clave distinta a la temporal.";
  return "";
}

async function enviarIngreso(f, btn) {
  const u = $("#lgUser"), p = $("#lgPass"), banner = $("#loginBanner");
  banner.hidden = true;
  let mu;
  if (rolIngreso === "e") {
    const v = limpiarCedula(u.value);
    mu = !v ? "Escribe tu cédula." : v.length !== 10 ? "La cédula tiene 10 números." : !cedulaValida(v) ? "Revisa tu cédula: no parece correcta." : "";
  } else mu = !u.value.trim() ? "Escribe tu correo." : !correoValido(u.value.trim()) ? "Revisa tu correo: debe ser como nombre@gmail.com." : "";
  fieldErr(u, mu);
  const mp = p.value ? "" : "Escribe tu clave.";
  fieldErr(p, mp);
  if (mu || mp) { f.querySelector('[aria-invalid="true"]').focus(); return; }
  try {
    const m = await ocupado(btn, datos.entrar({ tipo: rolIngreso === "e" ? "cedula" : "correo", id: u.value, clave: p.value }));
    estado.yo = m;
    if (m.debeCambiarClave) { $("#loginBox").innerHTML = formClaveNueva(); $("#np1").focus(); return; }
    ir(inicioDe(m));
  } catch (e) {
    const msg = e.codigo === "credenciales" ? (rolIngreso === "e" ? "Cédula o clave incorrecta." : "Correo o clave incorrecta.") : MENSAJES[e.codigo] || MENSAJES.red;
    mostrarBanner("#loginBanner", msg);
    p.value = "";
    if (e.codigo === "credenciales") p.focus();
  }
}

async function enviarClaveNueva(f, btn) {
  const a = $("#np1"), b = $("#np2"), priv = $("#npPriv");
  $("#npBanner").hidden = true;
  const v = a.value;
  const ma = errorClaveNueva(v);
  fieldErr(a, ma);
  fieldErr(b, !ma && b.value !== v ? "Las dos claves no son iguales." : "");
  fieldErr(priv, priv.checked ? "" : "Para continuar, acepta el aviso de privacidad.");
  const malo = f.querySelector('[aria-invalid="true"]');
  if (malo) { malo.focus(); return; }
  try {
    await ocupado(btn, datos.cambiarClave({ nueva: v, aceptaPrivacidad: true, versionPrivacidad: datos.VERSION_PRIVACIDAD }));
    estado.yo = { ...estado.yo, debeCambiarClave: false };
    ir(inicioDe(estado.yo));
    toast("Tu clave nueva quedó guardada");
  } catch (e) {
    if (e.codigo === "sesion") return cerrarSesion("Tu sesión venció. Vuelve a entrar.");
    if (e.campo === "nueva") { fieldErr(a, e.mensaje); a.focus(); return; }
    if (e.campo === "privacidad") { fieldErr(priv, e.mensaje); priv.focus(); return; }
    mostrarBanner("#npBanner", e.codigo === "red" ? MENSAJES.red : e.mensaje || MENSAJES.red);
  }
}

export const envios = { loginForm: enviarIngreso, newPassForm: enviarClaveNueva };
