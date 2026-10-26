// Encuesta del mes en la comunidad: la tarjeta del emprendedor (en su Inicio y fijada arriba en el muro).
// Vota y cambia su voto con un toque; propone un curso (uno por encuesta) y su idea entra a la lista con su voto.
// Solo se ven porcentajes, nunca quién votó. El panel del equipo (a/encuestas) vive más abajo.
import { $, esc, ic, plural, toast, fieldErr, ocupado, asegurarDialogo } from "./ui.js";
import * as datos from "./datos.js";
import { texto as normTexto } from "./normalizar.js";
import { haceCuanto } from "./fechas.js";
import { vacio } from "./piezas.js";
import { estado, refrescar } from "./app.js";
import { cargar as cargarAdmin } from "./vistas-admin.js";

const MAX = 8; // con más opciones se ven las 8 más votadas (y la mía) y «Ver todas»
const tick = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12.5 4 4 8-9"/></svg>';

let E = null;          // la encuesta que está en pantalla
let todas = false;     // «Ver todas» abierto
let enviando = false;

export function limpiar() { E = null; todas = false; enviando = false; L = null; editando = null; enfocar = null; }

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

const accionesMiembro = {
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

const enviosMiembro = {
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

// ---------- panel del equipo (a/encuestas) ----------
// Lista con la abierta arriba, luego borradores y cerradas. Cada una con los votos por origen y quién propuso cada
// idea. El editor (pregunta y opciones) se abre en el lugar de la tarjeta; lo escrito vive en `editando`.
let L = null;          // EncuestaAdmin[] | "sin_tabla"
let editando = null;   // { id, abierta, pregunta, opciones: [{ id, texto, votos }] }
let enfocar = null;    // qué enfocar al terminar de dibujar
let nombres = new Map();

const ESTADO_ENC = { abierta: ["Abierta", "pill-ok"], borrador: ["Borrador", "pill-white"], cerrada: ["Cerrada", "pill-draft"] };
const votosDe = (o) => o.publico + o.inscritos;
const perderan = (n) => (n === 1 ? "Se perderá 1 voto." : `Se perderán ${n} votos.`);
const cuando = (iso) => { const h = haceCuanto(iso); return /^(ahora|hace|ayer)/.test(h) ? h : "el " + h; };
const deL = (id) => (Array.isArray(L) ? L.find((e) => e.id === id) : null);
const opcionDe = (id) => (Array.isArray(L) ? L.flatMap((e) => e.opciones).find((o) => o.id === id) : null);
const peso = (e) => (e.estado === "abierta" ? 0 : e.estado === "borrador" ? 1 : 2);
const ordenadas = () => [...L].sort((a, b) => peso(a) - peso(b)
  || Date.parse(b.cerradaEn || b.creadaEn) - Date.parse(a.cerradaEn || a.creadaEn));

const DLG_ENC = () => `<dialog id="dlgEnc" aria-labelledby="dlgEncTitulo">
  <form id="encConfirmForm" novalidate>
    <div class="dlg-body">
      <div class="dlg-head"><span class="dlg-ic" id="dlgEncIc"></span><h2 id="dlgEncTitulo"></h2></div>
      <p id="dlgEncTexto"></p>
    </div>
    <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-act="cerrar">Cancelar</button><button class="btn btn-danger" type="submit" id="dlgEncOk"></button></div>
  </form>
</dialog>`;

// Pregunta antes de algo que no se deshace fácil. Resuelve true si se confirma (Cancelar o Esc: false).
// Solo hay una pregunta a la vez: si quedó otra sin responder, se da por cancelada, y un «close» atrasado de la anterior se ignora.
let pendiente = null;
function confirmar({ titulo, texto, boton, peligro = true, icono = "trash" }) {
  asegurarDialogo("dlgEnc", DLG_ENC());
  const d = $("#dlgEnc"), ok = $("#dlgEncOk");
  pendiente?.(false);
  $("#dlgEncTitulo").textContent = titulo;
  $("#dlgEncTexto").textContent = texto;
  $("#dlgEncIc").className = `dlg-ic${peligro ? "" : " info"}`;
  $("#dlgEncIc").innerHTML = ic(icono);
  ok.className = `btn ${peligro ? "btn-danger" : "btn-primary"}`;
  ok.textContent = boton;
  d.returnValue = "";
  d.showModal();
  return new Promise((r) => {
    const fin = (v) => { d.removeEventListener("close", alCerrar); if (pendiente === fin) pendiente = null; r(v); };
    const alCerrar = () => { if (!d.open) fin(d.returnValue === "ok"); };
    pendiente = fin;
    d.addEventListener("close", alCerrar);
  });
}

function tarjetaAdmin(e) {
  const [etiqueta, clase] = ESTADO_ENC[e.estado] || ESTADO_ENC.borrador;
  const total = e.opciones.reduce((s, o) => s + votosDe(o), 0);
  const pub = e.opciones.reduce((s, o) => s + o.publico, 0);
  const meta = e.estado === "abierta" && e.abiertaEn ? `Abierta ${cuando(e.abiertaEn)}`
    : e.estado === "cerrada" && e.cerradaEn ? `Cerrada ${cuando(e.cerradaEn)}` : `Creada ${cuando(e.creadaEn)}`;
  const q = esc(e.pregunta);
  const boton = (act, icono, txt, cls = "btn-ghost") => `<button type="button" class="btn ${cls} btn-sm" data-act="${act}" data-id="${e.id}">${ic(icono)}${txt}<span class="vh">: ${q}</span></button>`;
  const acciones = (e.estado === "abierta" ? boton("enc-cerrar", "lock", "Cerrar")
    : boton("enc-abrir", "chart", e.estado === "cerrada" ? "Volver a abrir" : "Abrir", e.estado === "borrador" ? "btn-primary" : "btn-ghost"))
    + boton("enc-editar", "pencil", "Editar")
    + `<button type="button" class="btn btn-ghost btn-sm btn-warn" data-act="enc-borrar" data-id="${e.id}" title="Borrar">${ic("trash")}<span class="vh">Borrar la encuesta ${q}</span></button>`;
  const fila = (o) => {
    const v = votosDe(o), p = total ? Math.round((100 * v) / total) : 0, t = esc(o.texto);
    const quien = o.propuestaPor ? `<span class="enc-res-quien">Propuesta por ${esc(nombres.get(o.propuestaPor) || "un emprendedor")}</span>` : "";
    return `<li class="enc-res" data-op-id="${o.id}">
      <div class="enc-res-top"><span class="enc-res-t">${t}</span><span class="enc-res-pct">${p} %</span></div>
      <div class="enc-res-bar" aria-hidden="true"><i style="width:${p}%"></i></div>
      <div class="enc-res-pie"><span class="enc-res-n">público ${o.publico} · inscritos ${o.inscritos}</span>${quien}
        <button type="button" class="icon-btn" data-act="enc-op-borrar" data-id="${o.id}" title="Borrar idea">${ic("trash")}<span class="vh">Borrar la idea ${t}</span></button></div></li>`;
  };
  return `<article class="panel enc-adm" data-enc-admin="${e.id}" aria-labelledby="enc-t-${e.id}">
    <header class="enc-adm-head"><div>
        <p class="enc-adm-meta"><span class="pill ${clase}">${etiqueta}</span>${e.esEjemplo ? '<span class="tag">Ejemplo</span>' : ""}<span>${meta}</span></p>
        <h2 id="enc-t-${e.id}">${q}</h2></div>
      <div class="enc-adm-acts">${acciones}</div></header>
    ${e.opciones.length ? `<ol class="enc-res-lista">${e.opciones.map(fila).join("")}</ol>` : `<p class="hint">Todavía no tiene opciones. Edítala para agregarlas.</p>`}
    <p class="enc-adm-total">${plural(total, "voto", "votos")}${total ? ` · ${pub} del público y ${total - pub} de inscritos` : ""}</p>
  </article>`;
}

function opsEditor() {
  const n = editando.opciones.length;
  return editando.opciones.map((o, i) => `<li class="enc-ed-op" data-i="${i}">
      <input class="input" data-entrada="enc-op" maxlength="80" value="${esc(o.texto)}" placeholder="Opción ${i + 1}" aria-label="Opción ${i + 1}">
      ${o.votos ? `<span class="enc-ed-votos">${plural(o.votos, "voto", "votos")}</span>` : ""}
      <button type="button" class="icon-btn" data-act="enc-op-subir" title="Subir"${i === 0 ? " disabled" : ""}>${ic("up")}<span class="vh">Subir la opción ${i + 1}</span></button>
      <button type="button" class="icon-btn" data-act="enc-op-bajar" title="Bajar"${i === n - 1 ? " disabled" : ""}>${ic("down")}<span class="vh">Bajar la opción ${i + 1}</span></button>
      <button type="button" class="icon-btn" data-act="enc-op-quitar" title="Quitar">${ic("x")}<span class="vh">Quitar la opción ${i + 1}</span></button></li>`).join("");
}

function editor() {
  const nueva = !editando.id;
  return `<form class="panel enc-editor" id="encForm" novalidate aria-labelledby="encEdTit">
    <h2 id="encEdTit">${nueva ? "Nueva encuesta" : "Editar encuesta"}</h2>
    <div class="field"><label class="label" for="encPregunta">Pregunta</label>
      <input class="input" id="encPregunta" maxlength="160" value="${esc(editando.pregunta)}" placeholder="Ej.: ¿Qué taller te serviría más ahora?" autocomplete="off" aria-describedby="encPreguntaErr">
      <p class="err" id="encPreguntaErr" hidden></p></div>
    <fieldset class="enc-ed-campo"><legend class="label">Opciones</legend>
      <ol class="enc-ed-ops" id="encOps">${opsEditor()}</ol>
      <p class="err" id="encOpsErr" hidden></p>
      <button type="button" class="btn btn-ghost btn-sm enc-ed-mas" data-act="enc-op-agregar">${ic("plus")}Agregar opción</button></fieldset>
    ${editando.abierta ? '<p class="hint">Está abierta: lo que cambies se ve enseguida en la comunidad y en la página de JUMP. Si quitas una opción, sus votos se borran al guardar.</p>'
      : nueva ? '<p class="hint">Se guarda como borrador. Nadie la ve hasta que la abras.</p>' : ""}
    <div class="enc-ed-pie"><button type="button" class="btn btn-ghost" data-act="enc-cancelar">Cancelar</button><button class="btn btn-primary" type="submit">Guardar</button></div>
  </form>`;
}

function listaPanel() {
  const nueva = editando && !editando.id ? editor() : "";
  if (!L.length && !nueva)
    return vacio("Todavía no hay encuestas", "Crea la primera: escribe la pregunta y las opciones, y ábrela cuando esté lista. Los emprendedores votan y proponen cursos en la comunidad; cualquier visitante vota en la página de JUMP.");
  return nueva + ordenadas().map((e) => (editando?.id === e.id ? editor() : tarjetaAdmin(e))).join("");
}

function pintarPanel(foco) {
  const el = $("#encLista");
  if (!el) return;
  el.innerHTML = listaPanel();
  if (foco) $(foco)?.focus();
}

function pintarOps(foco) {
  $("#encOps").innerHTML = opsEditor();
  if (foco) $(foco)?.focus();
}

function errOps(msg) {
  const p = $("#encOpsErr");
  if (p) { p.hidden = !msg; p.innerHTML = msg ? ic("alert") + esc(msg) : ""; }
}

async function vEncuestas() {
  const [A, l] = await Promise.all([cargarAdmin(), datos.listarEncuestas()]);
  L = l;
  nombres = new Map(A.miembros.map((m) => [m.userId, m.nombres]));
  const cabeza = (botones) => `<div class="page-head"><div><h1>Encuestas</h1><p class="sub">La Encuesta del mes: los emprendedores votan y proponen cursos en la comunidad, y cualquier visitante vota en la página de JUMP. Solo una puede estar abierta a la vez.</p></div>${botones}</div>`;
  if (L === "sin_tabla") {
    editando = null;
    return { titulo: "Encuestas", html: cabeza("") + vacio("Las encuestas todavía no están activadas", "Falta aplicar la migración 0003 en Supabase para usar las encuestas. Avísale a quien administra el sitio.") };
  }
  if (editando?.id && !deL(editando.id)) editando = null; // la borraron mientras tanto
  return {
    titulo: "Encuestas",
    html: cabeza(`<div class="head-actions"><a class="btn btn-ghost" href="/jump/#encuestas" target="_blank" rel="noopener">${ic("link")}Ver en la página</a>
        <button type="button" class="btn btn-primary" data-act="enc-nueva">${ic("plus")}Nueva encuesta</button></div>`)
      + `<div class="enc-lista" id="encLista">${listaPanel()}</div>`,
    despues: () => { asegurarDialogo("dlgEnc", DLG_ENC()); if (enfocar) { $(enfocar)?.focus(); enfocar = null; } },
  };
}

// Después de cambiar algo en la base: vuelve a pedir la lista y dibuja la página.
const recargarPanel = (foco = null) => { enfocar = foco; return refrescar(); };

function mover(b, paso) {
  const i = +b.closest(".enc-ed-op").dataset.i, j = i + paso, ops = editando.opciones;
  if (j < 0 || j >= ops.length) return;
  [ops[i], ops[j]] = [ops[j], ops[i]];
  // el foco sigue a la opción; si llegó al extremo (botón apagado), pasa a su campo
  const fila = `.enc-ed-op:nth-child(${j + 1})`;
  pintarOps();
  ($(`${fila} [data-act="${paso < 0 ? "enc-op-subir" : "enc-op-bajar"}"]:not([disabled])`) || $(`${fila} input`)).focus();
}

const accionesPanel = {
  "enc-nueva": () => {
    if (editando && !editando.id) return $("#encPregunta")?.focus();
    editando = { id: null, abierta: false, pregunta: "", opciones: [{ id: null, texto: "", votos: 0 }, { id: null, texto: "", votos: 0 }] };
    pintarPanel("#encPregunta");
  },
  "enc-editar": (b) => {
    const e = deL(b.dataset.id);
    if (!e) return;
    editando = { id: e.id, abierta: e.estado === "abierta", pregunta: e.pregunta, opciones: e.opciones.map((o) => ({ id: o.id, texto: o.texto, votos: votosDe(o) })) };
    pintarPanel("#encPregunta");
  },
  "enc-cancelar": () => {
    const id = editando?.id;
    editando = null;
    pintarPanel(id ? `[data-act="enc-editar"][data-id="${id}"]` : '[data-act="enc-nueva"]');
  },
  "enc-op-agregar": () => {
    editando.opciones.push({ id: null, texto: "", votos: 0 });
    pintarOps(".enc-ed-op:last-child input");
  },
  "enc-op-subir": (b) => mover(b, -1),
  "enc-op-bajar": (b) => mover(b, 1),
  "enc-op-quitar": async (b) => {
    const i = +b.closest(".enc-ed-op").dataset.i, o = editando.opciones[i];
    if (o.votos && !(await confirmar({ titulo: `¿Quitar “${o.texto || `la opción ${i + 1}`}”?`, texto: perderan(o.votos), boton: "Quitar opción" }))) return;
    editando.opciones.splice(i, 1);
    pintarOps(editando.opciones.length ? `.enc-ed-op:nth-child(${Math.min(i + 1, editando.opciones.length)}) input` : '[data-act="enc-op-agregar"]');
  },
  "enc-abrir": async (b) => {
    const e = deL(b.dataset.id);
    if (!e) return;
    if (e.opciones.length < 2) return toast("Agrega al menos 2 opciones antes de abrirla.");
    const otra = L.find((x) => x.estado === "abierta" && x.id !== e.id);
    if (otra && !(await confirmar({ titulo: `¿Abrir “${e.pregunta}”?`, texto: `Se cerrará “${otra.pregunta}”.`, boton: "Abrir", peligro: false, icono: "chart" }))) return;
    await ocupado(b, datos.abrirEncuesta(e.id));
    await recargarPanel(`[data-act="enc-cerrar"][data-id="${e.id}"]`);
    toast("Encuesta abierta: ya se puede votar en la comunidad y en la página de JUMP.");
  },
  "enc-cerrar": async (b) => {
    await ocupado(b, datos.cerrarEncuesta(b.dataset.id));
    await recargarPanel(`[data-act="enc-abrir"][data-id="${b.dataset.id}"]`);
    toast("Encuesta cerrada: su resultado sigue a la vista con la marca «Encuesta cerrada».");
  },
  "enc-borrar": async (b) => {
    const e = deL(b.dataset.id);
    if (!e) return;
    const v = e.opciones.reduce((s, o) => s + votosDe(o), 0);
    const texto = `Se borran ${plural(e.opciones.length, "opción", "opciones")}${v ? ` y ${plural(v, "voto", "votos")}` : ""}. No se puede deshacer.`;
    if (!(await confirmar({ titulo: `¿Borrar “${e.pregunta}”?`, texto, boton: "Borrar encuesta" }))) return;
    await datos.borrarEncuesta(e.id);
    if (editando?.id === e.id) editando = null;
    await recargarPanel('[data-act="enc-nueva"]');
    toast("Se borró la encuesta.");
  },
  "enc-op-borrar": async (b) => {
    const o = opcionDe(b.dataset.id);
    if (!o) return;
    const v = votosDe(o);
    if (!(await confirmar({ titulo: `¿Borrar “${o.texto}”?`, texto: v ? perderan(v) : "Nadie votó por ella todavía.", boton: "Borrar idea" }))) return;
    await datos.borrarOpcion(o.id);
    await recargarPanel();
    toast("Se borró la idea.");
  },
};

const limpio = (s, max) => normTexto(s, max).replace(/\s+/g, " ");

async function guardarEditor(f, btn) {
  const pregunta = limpio(editando.pregunta, 300);
  const ops = editando.opciones.map((o) => ({ ...o, texto: limpio(o.texto, 200) }));
  const p = $("#encPregunta");
  const errP = pregunta.length < 5 || pregunta.length > 160 ? "Escribe la pregunta (de 5 a 160 caracteres)." : "";
  fieldErr(p, errP);
  const llenas = ops.filter((o) => o.texto || o.id);
  const vistas = new Set();
  const repetida = llenas.find((o) => { const k = clave(o.texto); if (vistas.has(k)) return true; vistas.add(k); return false; });
  const errO = llenas.some((o) => !o.texto) ? "Escribe el texto de cada opción o quítala."
    : llenas.length < 2 ? "Agrega al menos 2 opciones."
    : llenas.some((o) => o.texto.length < 2 || o.texto.length > 80) ? "Cada opción va de 2 a 80 caracteres."
    : repetida ? `“${repetida.texto}” está dos veces.` : "";
  errOps(errO);
  if (errP) return p.focus();
  if (errO) return $("#encOps input")?.focus();
  try {
    const nueva = !editando.id;
    const id = await ocupado(btn, datos.guardarEncuesta({ id: editando.id, pregunta, opciones: llenas.map((o) => ({ id: o.id, texto: o.texto })) }));
    editando = null;
    await recargarPanel(`[data-act="enc-editar"][data-id="${id}"]`);
    toast(nueva ? "Encuesta guardada como borrador. Ábrela cuando esté lista." : "Cambios guardados.");
  } catch (e) {
    if (e?.codigo !== "opcion_repetida") throw e;
    errOps(e.mensaje);
  }
}

// ---------- registro ----------
export const rutas = [{ patron: "a/encuestas", titulo: "Encuestas", vista: vEncuestas }];
export const acciones = { ...accionesMiembro, ...accionesPanel };
export const envios = { ...enviosMiembro, encForm: guardarEditor, encConfirmForm: (f) => f.closest("dialog").close("ok") };
export const entradas = {
  encPregunta: (el) => { if (editando) editando.pregunta = el.value; },
  "enc-op": (el) => { const o = editando?.opciones[+el.closest(".enc-ed-op").dataset.i]; if (o) o.texto = el.value; },
};
