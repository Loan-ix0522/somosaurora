// Encuesta del mes en la comunidad: la tarjeta del emprendedor (en su Inicio y fijada arriba en el muro).
// Vota y cambia su voto con un toque; propone un curso (uno por encuesta) y su idea entra a la lista con su voto.
// Solo se ven porcentajes, nunca quién votó. El panel del equipo (a/encuestas) vive más abajo.
import { esc, toast, fieldErr } from "./ui.js";
import * as datos from "./datos.js";
import { texto as normTexto } from "./normalizar.js";
import { estado } from "./app.js";

const MAX = 8; // con más opciones se ven las 8 más votadas (y la mía) y «Ver todas»
const tick = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12.5 4 4 8-9"/></svg>';

let E = null;          // la encuesta que está en pantalla
let todas = false;     // «Ver todas» abierto
let enviando = false;

export function limpiar() { E = null; todas = false; enviando = false; }

// La misma idea, sin importar mayúsculas ni espacios (como la revisa la base).
const clave = (s) => normTexto(s, 200).replace(/\s+/g, " ").toLocaleLowerCase("es");

function visibles(e) {
  const ops = e.opciones;
  if (todas || ops.length <= MAX) return ops;
  const top = [...ops].sort((a, b) => b.porcentaje - a.porcentaje).slice(0, MAX);
  if (e.miVoto && !top.some((o) => o.id === e.miVoto)) top[MAX - 1] = ops.find((o) => o.id === e.miVoto);
  const ids = new Set(top.map((o) => o.id));
  return ops.filter((o) => ids.has(o.id));
}

export function tarjetaEncuesta(e) {
  E = e;
  const abierta = e.estado === "abierta", lista = visibles(e), yo = estado.yo?.userId;
  const nota = !abierta ? "Encuesta cerrada" : e.miVoto ? "Ya votaste · puedes cambiar tu voto" : "Toca una opción para votar";
  const opcion = (o) => {
    const mia = o.id === e.miVoto;
    return `<button type="button" class="enc-opt${mia ? " mine" : ""}" data-act="votar-encuesta" data-id="${esc(o.id)}" aria-pressed="${mia}"${abierta ? "" : " disabled"}>
      <span class="enc-fill" style="transform:scaleX(${o.porcentaje / 100})"></span>
      <span class="enc-lbl"><span class="enc-tick" aria-hidden="true">${tick}</span><span class="enc-t">${esc(o.texto)}</span>${yo && o.propuestaPor === yo ? '<span class="tag">Tu idea</span>' : ""}</span>
      <span class="enc-pct">${o.porcentaje} %</span></button>`;
  };
  let pie = "";
  if (abierta && e.yaPropuse) pie = `<p class="enc-ya">Ya propusiste un curso en esta encuesta.</p>`;
  else if (abierta) pie = `<form class="enc-prop" id="proponerForm" novalidate>
      <label class="label" for="propIdea">Propón otro curso</label>
      <div class="enc-prop-fila"><input class="input" id="propIdea" maxlength="80" autocomplete="off" placeholder="Ej.: Cómo poner precio a mis productos" aria-describedby="propIdeaAyuda propIdeaErr">
        <button class="btn btn-primary" type="submit">Proponer</button></div>
      <p class="hint" id="propIdeaAyuda">Una idea por encuesta. Al proponerla, tu voto pasa a ella.</p><p class="err" id="propIdeaErr" hidden></p></form>`;
  return `<div class="panel encuesta" data-encuesta="${esc(e.id)}" data-estado="${e.estado}">
    <div><h3 class="enc-q">${esc(e.pregunta)}</h3><p class="enc-sub">Nadie ve por quién votas: solo se muestran porcentajes.</p></div>
    <div class="enc-opts" role="group" aria-label="Opciones">${lista.map(opcion).join("")}</div>
    <div class="enc-pie"><p class="enc-nota">${nota}</p>${lista.length < e.opciones.length ? `<button type="button" class="btn-link" data-act="encuesta-todas">Ver todas (${e.opciones.length})</button>` : ""}</div>
    ${pie}</div>`;
}

// Inicio y muro la ponen con su título; sin encuesta (o sin la migración 0003), nada.
export function seccionEncuesta(e, clase = "") {
  todas = false;
  if (!e) { E = null; return ""; }
  return `<section class="enc-sec ${clase}" aria-labelledby="t-enc"><div class="sec-head"><h2 id="t-enc">Encuesta del mes</h2></div>${tarjetaEncuesta(e)}</section>`;
}

// Redibuja solo la tarjeta. Cada barra arranca desde su ancho anterior para que el cambio se vea continuo.
function redibujar(foco) {
  const el = document.querySelector("#page [data-encuesta]");
  if (!el) return;
  if (!E) { el.closest(".enc-sec")?.remove(); return; }
  const antes = new Map([...el.querySelectorAll(".enc-opt")].map((b) => [b.dataset.id, b.querySelector(".enc-fill").style.transform]));
  el.outerHTML = tarjetaEncuesta(E);
  const nuevo = document.querySelector("#page [data-encuesta]");
  nuevo.querySelectorAll(".enc-opt").forEach((b) => {
    const f = b.querySelector(".enc-fill"), t = antes.get(b.dataset.id) ?? "scaleX(0)", fin = f.style.transform;
    if (t === fin) return;
    f.style.transition = "none";
    f.style.transform = t;
    void f.offsetWidth; // fija el ancho de partida
    f.style.transition = "";
    f.style.transform = fin;
  });
  if (foco) (nuevo.querySelector(`.enc-opt[data-id="${CSS.escape(foco)}"]`) || nuevo.querySelector(".enc-opt"))?.focus({ preventScroll: true });
}

// Vuelve a pedir la encuesta (porcentajes al día, ideas nuevas de otros) y avisa a quien la use (Inicio, JC).
async function recargar(foco) {
  E = await datos.cargarEncuesta().catch(() => E);
  redibujar(foco);
  document.dispatchEvent(new CustomEvent("jump:encuesta", { detail: E }));
}

async function cerrada(err, foco) {
  if (err?.codigo !== "encuesta_cerrada") throw err;
  toast(err.mensaje);
  await recargar(foco);
}

export const acciones = {
  "votar-encuesta": async (b) => {
    const id = b.dataset.id, card = b.closest("[data-encuesta]");
    if (enviando || !E || E.estado !== "abierta" || id === E.miVoto) return;
    enviando = true;
    card.setAttribute("aria-busy", "true");
    try {
      await datos.votarEncuesta(id);
      await recargar(id);
      toast("Listo: tu voto quedó guardado.");
    } catch (err) {
      await cerrada(err, id);
    } finally {
      enviando = false;
      document.querySelector("#page [data-encuesta]")?.removeAttribute("aria-busy");
    }
  },
  "encuesta-todas": () => {
    if (!E) return;
    const antes = new Set([...document.querySelectorAll("#page .enc-opt")].map((b) => b.dataset.id));
    todas = true;
    redibujar();
    [...document.querySelectorAll("#page .enc-opt")].find((b) => !antes.has(b.dataset.id))?.focus({ preventScroll: true });
  },
};

export const envios = {
  proponerForm: async (f, btn) => {
    const input = f.querySelector("#propIdea"), idea = normTexto(input.value, 200).replace(/\s+/g, " ");
    if (enviando || !E) return;
    if (idea.length < 4) { fieldErr(input, "Escribe el curso que te haría falta (al menos 4 letras)."); input.focus(); return; }
    if (E.opciones.some((o) => clave(o.texto) === clave(idea))) { fieldErr(input, datos.MSG_ENCUESTA.idea_repetida); input.focus(); return; }
    fieldErr(input, "");
    enviando = true;
    btn.disabled = true;
    btn.classList.add("is-loading");
    try {
      const id = await datos.proponerCurso(E.id, idea);
      await recargar(id);
      toast("Listo: tu idea ya está en la lista, con tu voto.");
    } catch (err) {
      if (err?.codigo === "idea_repetida") { fieldErr(input, err.mensaje); input.focus(); }
      else if (err?.codigo === "ya_propuso") await recargar();
      else await cerrada(err);
    } finally {
      enviando = false;
      if (btn.isConnected) { btn.disabled = false; btn.classList.remove("is-loading"); }
    }
  },
};
