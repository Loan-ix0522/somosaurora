// Equipo JUMP: resumen, mentorías, clases en vivo, emprendedores y avisos (mockup "El aula", con datos reales).
import { $, $$, esc, ic, fig, iniciales, plural, toast, copiar, fieldErr, ocupado } from "./ui.js";
import * as datos from "./datos.js";
import { haceCuanto, fechaCorta, rango, estadoClase, aISO } from "./fechas.js";
import { dateTile, whenText, nowPill, vacio, mMeta } from "./piezas.js";
import { limpiarCedula, cedulaValida } from "./cedula.js";
import { whatsapp as normWhatsapp, texto as normTexto, nombre as normNombre } from "./normalizar.js";
import { estado, refrescar } from "./app.js";

// Lo cargado de la base. Se vuelve a pedir después de cada cambio, al reintentar y al volver a la pestaña después de 5 min.
// invalidar() solo lo marca como viejo: lo que se dibuja justo después del cambio (avisos, el panel del editor) sigue
// leyendo la copia anterior hasta que la próxima vista lo pida de nuevo.
let A = null;
let filtroE = "todos", buscarE = "", filaNueva = null, claseNueva = null, objetivo = null;
const RECARGA_MS = 5 * 60e3;

export function limpiar() {
  A = null; filtroE = "todos"; buscarE = ""; filaNueva = null; claseNueva = null; objetivo = null;
  for (const d of $$("dialog[open]")) d.close();
}
export const invalidar = () => { if (A) A.viejo = true; };
export async function cargar() {
  if (!A || A.viejo || A.yo.userId !== estado.yo?.userId) {
    A = await datos.cargarAdmin();
    estado.yo = { ...estado.yo, ...A.yo };
  }
  return A;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && A && Date.now() - A.cargadoEn > RECARGA_MS && /^#a\/(?!editor)/.test(location.hash)) {
    invalidar();
    refrescar();
  }
});

// ---------- ayudas ----------
const emprendedores = () => A.miembros.filter((m) => m.rol === "emprendedor");
export const activas = () => emprendedores().filter((m) => m.estado === "activa");
const suspendidas = () => emprendedores().filter((m) => m.estado === "suspendida");
const nuncaEntraron = () => activas().filter((m) => !m.ultimoIngreso);
const publicadas = () => A.mentorias.filter((m) => m.estado === "publicada");
const mentoriaDe = (id) => A.mentorias.find((m) => m.id === id);
const claseDe = (id) => A.clases.find((c) => c.id === id);
const miembroDe = (id) => A.miembros.find((m) => m.userId === id);
const proximas = () => A.clases.filter((c) => estadoClase(c) !== "terminada");
const pasadas = () => A.clases.filter((c) => estadoClase(c) === "terminada").reverse();
const mask = (c) => (c ? c.slice(0, 2) + "••••" + c.slice(-4) : "");
const primerNombre = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const corto = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const ejemplo = (x) => (x.esEjemplo ? ' <span class="tag">Ejemplo</span>' : "");
const archivos = (m) => m.materiales.length + m.modulos.reduce((n, x) => n + x.materiales.length, 0);
// Avance promedio: módulos vistos sobre (módulos × emprendedores activos). Los borradores no tienen.
function avance(m) {
  const n = m.modulos.length * activas().length;
  return m.estado === "publicada" && n ? Math.min(100, Math.round((m.vistos / n) * 100)) : null;
}
const tono = (id) => parseInt(String(id).slice(-2), 16) % 4;

// Diálogos: viven fuera de #app (no se borran al volver a dibujar la página).
export function asegurarDialogo(id, html) {
  if (document.getElementById(id)) return;
  document.body.insertAdjacentHTML("beforeend", html);
  const d = document.getElementById(id);
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
}

// ---------- resumen ----------
const todo = (icono, aviso, html, href, enlace) =>
  `<li><span class="ic-wrap ${aviso ? "warn" : ""}">${ic(icono)}</span><div class="grow">${html}<br><a class="btn-link" href="${href}">${enlace}</a></div></li>`;

function claseCard(c) {
  const vivo = estadoClase(c) === "en-vivo", a = activas().length;
  const pct = a ? Math.min(100, Math.round((c.confirmados / a) * 100)) : 0;
  return `<article class="live on-dark">${fig("live-deco")}
    <div class="live-top">${dateTile(c, vivo ? "now" : "on-navy")}<div>${vivo ? nowPill : ""}<h3>${esc(c.titulo)}</h3><p class="live-meta">${ic("clock")}<span>${whenText(c)} · Zoom</span></p></div></div>
    <div class="sent"><span>Invitación para ${plural(a, "emprendedor activo", "emprendedores activos")} · <b style="color:#fff">${plural(c.confirmados, "confirmó", "confirmaron")}</b></span><div class="bar"><i style="width:${pct}%"></i></div></div>
    <div class="live-actions"><button type="button" class="btn btn-white" data-act="recordar" data-id="${c.id}">${ic("send")}Reenviar recordatorio</button>${c.joinUrl
      ? `<button type="button" class="btn btn-dark" data-act="copiarzoom" data-id="${c.id}">${ic("copy")}Copiar enlace de Zoom</button>`
      : `<a class="btn btn-dark" href="#a/clases">${ic("link")}Agregar enlace de Zoom</a>`}</div>
  </article>`;
}

function actividad() {
  const nombreDe = (id) => esc(miembroDe(id)?.nombres || "una cuenta");
  const tituloClase = (id) => esc(claseDe(id)?.titulo || "una clase");
  const B = {
    "crear-cuenta": (b) => ["user", `Se creó la cuenta de <b>${nombreDe(b.objetivo)}</b>.`],
    "clave-nueva": (b) => ["key", `Se dio una clave nueva a <b>${nombreDe(b.objetivo)}</b>.`],
    suspender: (b) => ["ban", `Se suspendió la cuenta de <b>${nombreDe(b.objetivo)}</b>.`],
    reactivar: (b) => ["check", `Se reactivó la cuenta de <b>${nombreDe(b.objetivo)}</b>.`],
    "zoom-reunion": (b) => ["video", `Se creó la reunión de Zoom de <b>“${tituloClase(b.objetivo)}”</b>.`],
    "zoom-conectar": () => ["link", "Se conectó la cuenta de Zoom."],
    "zoom-desconectar": () => ["link", "Se desconectó la cuenta de Zoom."],
    "ejemplos-cargar": () => ["grid", "Se cargaron los datos de ejemplo."],
    "ejemplos-borrar": () => ["trash", "Se borraron los datos de ejemplo."],
  };
  const items = A.bitacora.filter((b) => B[b.accion]).map((b) => ({ t: b.creadoEn, f: B[b.accion](b) }));
  for (const a of A.avisos.slice(0, 12)) {
    if (a.tipo === "mentoria") items.push({ t: a.creadoEn, f: ["play", `Se publicó <b>“${esc(mentoriaDe(a.mentoriaId)?.titulo || "una mentoría")}”</b> y se avisó a la comunidad.`] });
    else if (a.tipo === "invitacion") items.push({ t: a.creadoEn, f: ["calendar", `Se publicó la invitación a <b>“${tituloClase(a.claseId)}”</b>.`] });
    else items.push({ t: a.creadoEn, f: ["mega", `Se publicó un aviso: “${esc(corto(a.texto, 80))}”.`] });
  }
  items.sort((x, y) => Date.parse(y.t) - Date.parse(x.t));
  return items.slice(0, 6).map(({ t, f: [i, h] }) => `<li><span class="ic-wrap">${ic(i)}</span><div class="grow">${h}<time datetime="${esc(t)}">${esc(haceCuanto(t))}</time></div></li>`).join("");
}

async function vResumen() {
  await cargar();
  const a = activas().length, s = suspendidas().length, nunca = nuncaEntraron(), c = proximas()[0];
  const pend = [];
  for (const m of A.mentorias.filter((x) => x.estado === "borrador").slice(0, 2))
    pend.push(todo("pencil", true, `<b>${esc(m.titulo)}</b> sigue en borrador.`, `#a/editor/${m.id}`, "Terminar y publicar"));
  if (nunca.length)
    pend.push(todo("user", true, `<b>${plural(nunca.length, "persona", "personas")}</b> no ha${nunca.length > 1 ? "n" : ""} entrado nunca a la comunidad.`, "#a/emprendedores", "Ver quién"));
  for (const x of proximas().filter((y) => !y.joinUrl).slice(0, 2))
    pend.push(todo("video", true, `La clase <b>“${esc(x.titulo)}”</b> del ${esc(fechaCorta(x.iniciaEn).toLowerCase())} no tiene enlace de Zoom.`, "#a/clases", "Agregar enlace"));
  for (const x of pasadas().filter((y) => !y.grabacionUrl).slice(0, 2))
    pend.push(todo("video", false, `La clase del <b>${esc(fechaCorta(x.iniciaEn).toLowerCase())}</b> no tiene grabación.`, "#a/clases", "Agregar grabación"));
  if (A.zoom.configurada && !A.zoom.conectada)
    pend.push(todo("link", false, "Conecta la cuenta de Zoom para crear las reuniones desde el panel.", "#a/ajustes", "Ir a Ajustes"));
  const feed = actividad();
  return {
    titulo: "Resumen",
    html: `<div class="page-head"><div><h1>Resumen</h1><p class="sub">Primera edición de JUMP.</p></div>
      <div class="head-actions"><a class="btn btn-ghost" href="#a/clases?nueva">${ic("video")}Programar clase</a><a class="btn btn-primary" href="#a/editor/nueva">${ic("plus")}Nueva mentoría</a></div></div>
    <section class="panel cupos" aria-labelledby="t-cup">
      <div><h2 id="t-cup">Emprendedores</h2><p><b>${a}</b> ${a === 1 ? "cuenta activa" : "cuentas activas"} · <b>${s}</b> ${s === 1 ? "suspendida" : "suspendidas"}${nunca.length ? ` · <b>${nunca.length}</b> sin entrar todavía` : ""}</p></div>
      <div class="meter" role="img" aria-label="${a} activas, ${s} suspendidas">${a + s ? `<i class="m-act" style="flex:${a}"></i><i class="m-sus" style="flex:${s}"></i>` : '<i class="m-free" style="flex:1"></i>'}</div>
      <a class="btn-link" href="#a/emprendedores">Ver emprendedores${ic("arrow")}</a>
    </section>
    <div class="res-grid">
      <section aria-labelledby="t-pc"><h2 class="sec-title" id="t-pc">Próxima clase en vivo</h2>
        ${c ? claseCard(c) : vacio("No hay clases programadas", "Programa una y la invitación les llega a todos dentro de la comunidad.", `<a class="btn btn-primary" href="#a/clases?nueva">${ic("plus")}Programar clase</a>`)}</section>
      <section aria-labelledby="t-pend"><h2 class="sec-title" id="t-pend">Pendientes</h2>
        <ul class="panel todo">${pend.join("") || `<li><span class="ic-wrap">${ic("check")}</span><div class="grow">Todo al día. No hay nada pendiente.</div></li>`}</ul></section>
    </div>
    <section class="block" aria-labelledby="t-act"><h2 class="sec-title" id="t-act">Actividad reciente</h2>
      <ul class="panel feed">${feed || `<li><span class="ic-wrap">${ic("grid")}</span><div class="grow">Aquí vas a ver lo que pase en la comunidad.</div></li>`}</ul></section>`,
  };
}

// ---------- mentorías ----------
async function vMentorias() {
  await cargar();
  const filas = A.mentorias.map((m) => {
    const av = avance(m);
    return `<tr>
      <td class="c-who"><div class="who"><img class="thumb" src="${esc(m.portada)}" alt=""><div><b>${esc(m.titulo)}</b>${m.mentor ? `<span class="m-meta">Con ${esc(m.mentor)}</span>` : ""}</div></div></td>
      <td data-l="Contenido">${mMeta(m)} · ${plural(archivos(m), "archivo", "archivos")}</td>
      <td>${m.estado === "publicada" ? '<span class="pill pill-ok">Publicada</span>' : '<span class="pill pill-draft">Borrador</span>'}${ejemplo(m)}</td>
      <td class="td-prog c-hide">${av == null ? '<span class="m-meta">—</span>' : `<div class="prog"><div class="bar"><i style="width:${av}%"></i></div><span>${av} %</span></div>`}</td>
      <td data-l="Actualizada" class="c-hide">${esc(cap(haceCuanto(m.actualizadaEn)))}</td>
      <td class="c-act"><div class="row-actions"><a class="btn btn-ghost btn-sm" href="#a/editor/${m.id}">${ic("pencil")}Editar<span class="vh"> ${esc(m.titulo)}</span></a></div></td></tr>`;
  }).join("");
  return {
    titulo: "Mentorías",
    html: `<div class="page-head"><div><h1>Mentorías</h1><p class="sub">Las publicadas las ven todos los emprendedores activos. Los borradores solo los ve el equipo.</p></div>
      <div class="head-actions"><a class="btn btn-primary" href="#a/editor/nueva">${ic("plus")}Nueva mentoría</a></div></div>
    ${A.mentorias.length ? `<div class="panel table-panel"><div class="table-wrap"><table class="rtable">
      <thead><tr><th>Mentoría</th><th>Contenido</th><th>Estado</th><th class="c-hide">Avance promedio</th><th class="c-hide">Actualizada</th><th><span class="vh">Acciones</span></th></tr></thead>
      <tbody>${filas}</tbody></table></div></div>`
      : vacio("Todavía no hay mentorías", "Crea la primera: agrega sus módulos en video o en vivo y el material que quieras compartir.", `<a class="btn btn-primary" href="#a/editor/nueva">${ic("plus")}Nueva mentoría</a>`)}`,
  };
}

// ---------- clases ----------
const MENSAJE = "Te invitamos a una clase en vivo de JUMP. Entra con el botón “Entrar a Zoom” desde la Comunidad JUMP a la hora indicada.";

function formProgramar() {
  const z = A.zoom, crear = !!z.conectada;
  const porQue = z.configurada
    ? `Para crear la reunión desde aquí, conecta la cuenta de Zoom en <a href="#a/ajustes">Ajustes</a>.`
    : "La conexión con Zoom todavía no está configurada. Pega el enlace o agrégalo después.";
  return `<form class="panel sched" id="schedForm" novalidate hidden aria-labelledby="t-sch">
    <h2 id="t-sch">Programar clase en vivo</h2>
    <div class="grid2">
      <div class="field"><label class="label" for="scTitulo">Tema de la clase</label><input class="input" id="scTitulo" maxlength="120" placeholder="Ej.: Dudas sobre facturación" aria-describedby="scTituloErr"><p class="err" id="scTituloErr" hidden></p></div>
      <div class="field"><label class="label" for="scMentoria">Mentoría <span class="opt">(opcional)</span></label><select class="select" id="scMentoria"><option value="">Ninguna</option>${publicadas().map((m) => `<option value="${m.id}">${esc(m.titulo)}</option>`).join("")}</select></div>
    </div>
    <div class="grid3">
      <div class="field"><label class="label" for="scFecha">Fecha</label><input class="input" type="date" id="scFecha" aria-describedby="scFechaErr"><p class="err" id="scFechaErr" hidden></p></div>
      <div class="field"><label class="label" for="scHora">Hora</label><input class="input" type="time" id="scHora" value="19:00" aria-describedby="scHoraErr"><p class="err" id="scHoraErr" hidden></p></div>
      <div class="field"><label class="label" for="scDuracion">Duración</label><select class="select" id="scDuracion">${[60, 90, 120].map((v) => `<option value="${v}">${v} min</option>`).join("")}</select></div>
    </div>
    <fieldset class="zoom-modo"><legend class="label">Enlace de Zoom</legend>
      <label class="check"><input type="radio" name="zoomModo" value="crear" data-cambio="zoommodo" ${crear ? "checked" : "disabled"}><span>Crear la reunión en Zoom${crear && z.email ? ` <span class="m-meta">(${esc(z.email)})</span>` : ""}</span></label>
      ${crear ? "" : `<p class="hint">${porQue}</p>`}
      <label class="check"><input type="radio" name="zoomModo" value="manual" data-cambio="zoommodo" ${crear ? "" : "checked"}><span>Pegar enlace</span></label>
      <div class="field" id="scEnlaceCampo" ${crear ? "hidden" : ""}><input class="input" id="scEnlace" inputmode="url" placeholder="https://zoom.us/j/…" aria-label="Enlace de Zoom" aria-describedby="scEnlaceErr"><p class="err" id="scEnlaceErr" hidden></p></div>
      <label class="check"><input type="radio" name="zoomModo" value="despues" data-cambio="zoommodo"><span>Agregar después</span></label>
    </fieldset>
    <div class="field"><label class="label" for="scMensaje">Mensaje de la invitación</label><textarea class="textarea" id="scMensaje" rows="3" maxlength="500">${MENSAJE}</textarea></div>
    <div class="channels"><span class="label">Se publicará como invitación en la Comunidad JUMP para ${plural(activas().length, "emprendedor activo", "emprendedores activos")}.</span></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn btn-ghost" data-act="programar">Cancelar</button><button class="btn btn-primary" type="submit">${ic("send")}Programar y enviar invitación</button></div>
  </form>`;
}

function filaClase(c) {
  const m = c.mentoriaId && mentoriaDe(c.mentoriaId), vivo = estadoClase(c) === "en-vivo";
  const acciones = c.joinUrl
    ? `<button type="button" class="btn btn-ghost btn-sm" data-act="copiarzoom" data-id="${c.id}">${ic("copy")}Copiar enlace</button>`
    : `${A.zoom.conectada ? `<button type="button" class="btn btn-primary btn-sm" data-act="zoomcrear" data-id="${c.id}">${ic("video")}Crear reunión</button>` : ""}<button type="button" class="btn btn-ghost btn-sm" data-act="zoompegar" data-id="${c.id}">${ic("link")}Pegar enlace</button>`;
  return `<article class="panel class-row ${c.id === claseNueva ? "is-new" : ""}">${dateTile(c, vivo ? "now" : "")}
    <div class="grow">${vivo ? `<span>${nowPill}</span>` : ""}<b>${esc(c.titulo)}</b>
      <span class="m-meta">${ic("clock")}${rango(c.iniciaEn, c.duracionMin)} · Zoom${m ? ` · ${esc(m.titulo)}` : ""}${ejemplo(c)}</span>
      <span class="reach">${ic("check")}Invitación en la comunidad · ${plural(c.confirmados, "confirmó", "confirmaron")}</span>
      ${c.joinUrl ? "" : `<span class="m-meta" style="color:var(--amber-text);font-weight:600">${ic("alert")}Todavía no tiene enlace de Zoom</span>`}
      <form class="zoom-row" data-envio="zoomManual" data-id="${c.id}" novalidate hidden>
        <input class="input" name="url" inputmode="url" placeholder="https://zoom.us/j/…" aria-label="Enlace de Zoom de ${esc(c.titulo)}" aria-describedby="zm-${c.id}Err">
        <button class="btn btn-primary btn-sm" type="submit">Guardar</button></form>
      <p class="err" id="zm-${c.id}Err" hidden></p>
    </div>
    <div class="class-actions">${acciones}<button type="button" class="btn btn-ghost btn-sm" data-act="recordar" data-id="${c.id}">${ic("send")}Reenviar recordatorio</button></div></article>`;
}

function filaPasada(c) {
  return `<article class="panel class-row">${dateTile(c)}
    <div class="grow"><b>${esc(c.titulo)}</b><span class="m-meta">${c.grabacionUrl ? "Grabación publicada" : "Sin grabación todavía"} · ${plural(c.entraron, "persona entró", "personas entraron")}${ejemplo(c)}</span>
      <form class="zoom-row" data-envio="grabacion" data-id="${c.id}" novalidate hidden>
        <input class="input" name="url" inputmode="url" value="${esc(c.grabacionUrl || "")}" placeholder="https://youtube.com/… (puede ser “no listado”)" aria-label="Enlace de la grabación de ${esc(c.titulo)}" aria-describedby="gr-${c.id}Err">
        <button class="btn btn-primary btn-sm" type="submit">Guardar</button></form>
      <p class="err" id="gr-${c.id}Err" hidden></p>
    </div>
    <div class="class-actions">${c.grabacionUrl
      ? `<a class="btn btn-ghost btn-sm" href="${esc(c.grabacionUrl)}" target="_blank" rel="noopener noreferrer">${ic("play")}Ver grabación</a><button type="button" class="btn btn-ghost btn-sm" data-act="grabar" data-id="${c.id}">${ic("pencil")}Cambiar</button>`
      : `<button type="button" class="btn btn-primary btn-sm" data-act="grabar" data-id="${c.id}">${ic("upload")}Agregar grabación</button>`}</div></article>`;
}

async function vClases({ query }) {
  await cargar();
  const prox = proximas(), pas = pasadas().slice(0, 12);
  return {
    titulo: "Clases en vivo",
    html: `<div class="page-head"><div><h1>Clases en vivo</h1><p class="sub">Programa una clase y la invitación con el enlace de Zoom les llega a todos los emprendedores activos dentro de la Comunidad JUMP.</p></div>
      <div class="head-actions"><button type="button" class="btn btn-primary" data-act="programar" aria-expanded="false" aria-controls="schedForm">${ic("plus")}Programar clase</button></div></div>
    ${formProgramar()}
    <section aria-labelledby="t-aprox"><h2 class="sec-title" id="t-aprox">Próximas</h2>
      ${prox.length ? `<div class="class-list">${prox.map(filaClase).join("")}</div>` : vacio("No hay clases programadas", "Usa “Programar clase” y la invitación les llega a todos dentro de la comunidad.")}</section>
    ${pas.length ? `<section class="block" aria-labelledby="t-apas"><h2 class="sec-title" id="t-apas">Pasadas</h2><div class="class-list">${pas.map(filaPasada).join("")}</div></section>` : ""}`,
    despues: () => { claseNueva = null; if (query.has("nueva")) abrirProgramar(true); },
  };
}

function abrirProgramar(forzar) {
  const f = $("#schedForm");
  if (!f) return;
  const abrir = forzar ?? f.hidden;
  f.hidden = !abrir;
  $$('[data-act="programar"][aria-controls]').forEach((b) => b.setAttribute("aria-expanded", String(abrir)));
  if (abrir) { f.scrollIntoView({ block: "start" }); $("#scTitulo")?.focus({ preventScroll: true }); }
}

async function enviarProgramar(f, btn) {
  const t = $("#scTitulo"), d = $("#scFecha"), h = $("#scHora"), en = $("#scEnlace");
  const modo = f.querySelector('input[name="zoomModo"]:checked')?.value || "despues";
  const titulo = t.value.trim(), enlace = en.value.trim();
  fieldErr(t, titulo.length >= 3 ? "" : "Escribe el tema de la clase (al menos 3 letras).");
  fieldErr(d, d.value ? "" : "Elige la fecha.");
  fieldErr(h, /^\d{2}:\d{2}$/.test(h.value) ? "" : "Elige la hora.");
  if (d.value && /^\d{2}:\d{2}$/.test(h.value)) {
    let ini = NaN;
    try { ini = Date.parse(aISO(d.value, h.value)); } catch { /* fecha imposible */ }
    if (!(ini > Date.now())) fieldErr(d, "Elige una fecha y hora que todavía no hayan pasado.");
  }
  fieldErr(en, modo !== "manual" ? "" : !enlace ? "Pega el enlace de Zoom." : datos.RE_ZOOM.test(enlace) ? "" : "El enlace debe ser de Zoom: empieza con https://zoom.us/ o con tu subdominio de Zoom.");
  const malo = f.querySelector('[aria-invalid="true"]');
  if (malo) return malo.focus();
  let clase, zoomFallo = null;
  try {
    clase = await ocupado(btn, datos.programarClase({
      titulo, mentoriaId: $("#scMentoria").value || null, fecha: d.value, hora: h.value, duracionMin: $("#scDuracion").value,
      mensaje: $("#scMensaje").value, zoom: modo, enlace,
    }));
  } catch (e) {
    if (!e.clase) throw e;
    clase = e.clase;
    zoomFallo = e;
  }
  claseNueva = clase.id;
  invalidar();
  refrescar();
  if (zoomFallo) toast("La clase quedó programada, pero no se pudo crear la reunión en Zoom. Usa “Crear reunión” o pega el enlace.");
  else toast(`Invitación publicada para ${plural(activas().length, "emprendedor activo", "emprendedores activos")}`);
}

// Formularios por fila (enlace de Zoom a mano y grabación).
function filaForm(id, envio) {
  const f = document.querySelector(`form[data-envio="${envio}"][data-id="${id}"]`);
  if (!f) return;
  f.hidden = !f.hidden;
  if (!f.hidden) f.querySelector("input").focus();
}

async function enviarZoomManual(f, btn) {
  const inp = f.elements.url, url = inp.value.trim();
  fieldErr(inp, !url ? "Pega el enlace de Zoom." : datos.RE_ZOOM.test(url) ? "" : "El enlace debe ser de Zoom: empieza con https://zoom.us/ o con tu subdominio de Zoom.");
  if (inp.getAttribute("aria-invalid") === "true") return inp.focus();
  await ocupado(btn, datos.guardarZoomManual(f.dataset.id, url));
  invalidar();
  refrescar();
  toast("Enlace de Zoom guardado");
}

async function enviarGrabacion(f, btn) {
  const inp = f.elements.url, url = inp.value.trim();
  fieldErr(inp, /^https:\/\/\S+\.\S+/.test(url) ? "" : "Pega el enlace de la grabación (empieza con https://).");
  if (inp.getAttribute("aria-invalid") === "true") return inp.focus();
  await ocupado(btn, datos.guardarGrabacion(f.dataset.id, url));
  invalidar();
  refrescar();
  toast("Grabación guardada. Ya la pueden ver en la clase.");
}

// ---------- emprendedores ----------
const DIALOGOS = {
  dlgAdd: () => `<dialog class="drawer" id="dlgAdd" aria-labelledby="addTitulo">
  <form id="addForm" novalidate>
    <div class="dr-head"><h2 id="addTitulo">Agregar emprendedor</h2><button type="button" class="icon-btn" data-act="cerrar" aria-label="Cerrar">${ic("x")}</button></div>
    <div class="dr-body">
      <div class="field"><label class="label" for="adNombres">Nombres y apellidos</label><input class="input" id="adNombres" maxlength="80" autocomplete="off" aria-describedby="adNombresErr"><p class="err" id="adNombresErr" hidden></p></div>
      <div class="field"><label class="label" for="adCedula">Cédula</label><input class="input" id="adCedula" inputmode="numeric" maxlength="13" placeholder="10 números" autocomplete="off" aria-describedby="adCedulaHint adCedulaErr"><p class="hint" id="adCedulaHint">Es el usuario con el que va a entrar.</p><p class="err" id="adCedulaErr" hidden></p></div>
      <div class="grid2">
        <div class="field"><label class="label" for="adWa">WhatsApp <span class="opt">(opcional)</span></label><input class="input" id="adWa" inputmode="tel" maxlength="20" placeholder="09…" autocomplete="off" aria-describedby="adWaErr"><p class="err" id="adWaErr" hidden></p></div>
        <div class="field"><label class="label" for="adCorreo">Correo <span class="opt">(opcional)</span></label><input class="input" id="adCorreo" type="email" maxlength="120" autocomplete="off" aria-describedby="adCorreoErr"><p class="err" id="adCorreoErr" hidden></p></div>
      </div>
      <div class="field"><label class="label" for="adNegocio">Nombre del negocio</label><input class="input" id="adNegocio" maxlength="80" autocomplete="off" placeholder="Ej.: Empanadas Doña Rosa" aria-describedby="adNegocioErr"><p class="err" id="adNegocioErr" hidden></p></div>
      <p class="hint">Al crear la cuenta te mostramos su clave temporal para que se la envíes. La primera vez que entre le pediremos crear su propia clave.</p>
    </div>
    <div class="dr-foot"><button type="button" class="btn btn-ghost" data-act="cerrar">Cancelar</button><button class="btn btn-primary" type="submit">${ic("plus")}Crear cuenta</button></div>
  </form>
</dialog>`,
  dlgSusp: () => `<dialog id="dlgSusp" aria-labelledby="suspTitulo">
  <form id="suspForm" novalidate>
    <div class="dlg-body">
      <div class="dlg-head"><span class="dlg-ic">${ic("ban")}</span><h2 id="suspTitulo">¿Suspender a <span id="suspNombre"></span>?</h2></div>
      <p>No podrá entrar a la Comunidad JUMP ni verá las invitaciones a clases. Su avance se guarda y puedes reactivar su cuenta cuando quieras.</p>
      <div class="field"><label class="label" for="suspMotivo">Motivo <span class="opt">(opcional, solo lo ve el equipo)</span></label><textarea class="textarea" id="suspMotivo" rows="3" maxlength="200"></textarea></div>
    </div>
    <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-act="cerrar">Cancelar</button><button class="btn btn-danger" type="submit">Suspender</button></div>
  </form>
</dialog>`,
  dlgReset: () => `<dialog id="dlgReset" aria-labelledby="resetTitulo">
  <form id="resetForm" novalidate>
    <div class="dlg-body">
      <div class="dlg-head"><span class="dlg-ic info">${ic("key")}</span><h2 id="resetTitulo">¿Clave nueva para <span id="resetNombre"></span>?</h2></div>
      <p>Su clave actual deja de funcionar. Te mostramos una clave temporal para que se la envíes; al entrar le pediremos crear una propia.</p>
    </div>
    <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-act="cerrar">Cancelar</button><button class="btn btn-primary" type="submit">${ic("key")}Crear clave nueva</button></div>
  </form>
</dialog>`,
  dlgClave: () => `<dialog id="dlgClave" aria-labelledby="claveTitulo">
  <div class="dlg-body">
    <div class="dlg-head"><span class="dlg-ic info">${ic("key")}</span><h2 id="claveTitulo"></h2></div>
    <p id="claveTexto"></p>
    <div class="temp"><span class="label">Clave temporal</span>
      <div class="temp-row"><span class="temp-code" id="claveCodigo"></span><button type="button" class="btn btn-ghost btn-sm" data-act="copiarclave">${ic("copy")}Copiar</button></div>
      <p class="hint">Vence en 7 días. La primera vez que entre le pediremos crear su propia clave.</p></div>
    <p class="hint" id="claveSinWa" hidden>No tiene WhatsApp registrado: copia la clave y envíasela tú.</p>
  </div>
  <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-act="cerrar">Listo</button><a class="btn btn-primary" id="claveWa" target="_blank" rel="noopener noreferrer">${ic("send")}Enviar por WhatsApp</a></div>
</dialog>`,
};

function prepararDialogos() {
  for (const [id, html] of Object.entries(DIALOGOS)) asegurarDialogo(id, html());
  // La clave temporal se muestra una sola vez: al cerrar la ventana se borra de la página.
  const d = $("#dlgClave");
  if (!d.dataset.listo) {
    d.dataset.listo = "1";
    d.addEventListener("close", () => { $("#claveCodigo").textContent = ""; $("#claveWa").removeAttribute("href"); });
  }
}

function tablaEmp() {
  const q = buscarE.trim().toLowerCase(), qd = q.replace(/\D/g, "");
  const todos = emprendedores();
  const filas = todos.filter((e) => (filtroE === "todos" || (filtroE === "activos" && e.estado === "activa") || (filtroE === "susp" && e.estado === "suspendida"))
    && (!q || e.nombres.toLowerCase().includes(q) || (e.negocio || "").toLowerCase().includes(q) || (qd.length >= 3 && (e.cedula || "").includes(qd))));
  const total = filtroE === "todos" ? todos.length : filtroE === "activos" ? activas().length : suspendidas().length;
  const tm = publicadas().reduce((n, m) => n + m.modulos.length, 0);
  if (!filas.length) {
    if (q) return `<div class="empty">${fig()}<h3>No encontramos a nadie con “${esc(buscarE)}”</h3><p>Revisa el nombre o prueba con los últimos números de la cédula.</p><button type="button" class="btn btn-ghost" data-act="agregar">${ic("plus")}Agregar emprendedor</button></div>`;
    if (filtroE === "susp") return `<div class="empty">${fig()}<h3>No hay cuentas suspendidas</h3><p>Cuando suspendas una cuenta, aparecerá aquí para que puedas reactivarla.</p></div>`;
    return `<div class="empty">${fig()}<h3>Todavía no hay emprendedores</h3><p>Agrega la primera cuenta y envíale su clave temporal por WhatsApp.</p><button type="button" class="btn btn-primary" data-act="agregar">${ic("plus")}Agregar emprendedor</button></div>`;
  }
  return `<div class="table-wrap"><table class="rtable">
    <thead><tr><th>Emprendedor</th><th>Cédula y WhatsApp</th><th class="c-hide">Avance</th><th>Último ingreso</th><th>Cuenta</th><th><span class="vh">Acciones</span></th></tr></thead>
    <tbody>${filas.map((e) => {
      const susp = e.estado === "suspendida", pct = tm ? Math.round((Math.min(e.hechos, tm) / tm) * 100) : 0;
      return `<tr class="${susp ? "is-susp" : ""} ${e.userId === filaNueva ? "is-new" : ""}">
      <td class="c-who"><div class="who"><span class="ava ${tono(e.userId) ? "k" + tono(e.userId) : ""}">${esc(iniciales(e.nombres))}</span><div><b>${esc(e.nombres)}</b><span class="m-meta">${esc(e.negocio || "Sin negocio registrado")}${ejemplo(e)}</span></div></div></td>
      <td data-l="Cédula">${esc(mask(e.cedula))}<span class="m-meta c-hide" style="display:block">${esc(e.whatsapp || "Sin WhatsApp")}</span></td>
      <td class="td-prog c-hide"><div class="prog"><div class="bar"><i style="width:${pct}%"></i></div><span>${Math.min(e.hechos, tm)}/${tm}</span></div></td>
      <td data-l="Último ingreso">${e.ultimoIngreso ? esc(cap(haceCuanto(e.ultimoIngreso))) : '<span style="color:var(--amber-text);font-weight:600">Nunca</span>'}</td>
      <td>${susp ? '<span class="pill pill-bad">Suspendida</span>' : '<span class="pill pill-ok">Activa</span>'}</td>
      <td class="c-act"><div class="row-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-act="clavenueva" data-id="${e.userId}">${ic("key")}<span class="lbl">Clave nueva</span><span class="vh"> para ${esc(e.nombres)}</span></button>
        ${susp
          ? `<button type="button" class="btn btn-ghost btn-sm btn-state" data-act="reactivar" data-id="${e.userId}">${ic("check")}Reactivar<span class="vh"> la cuenta de ${esc(e.nombres)}</span></button>`
          : `<button type="button" class="btn btn-ghost btn-sm btn-warn btn-state" data-act="suspender" data-id="${e.userId}">${ic("ban")}Suspender<span class="vh"> la cuenta de ${esc(e.nombres)}</span></button>`}
      </div></td></tr>`;
    }).join("")}</tbody></table></div>
    <div class="table-foot"><span>Mostrando ${filas.length} de ${total}</span>${todos.some((e) => e.esEjemplo) ? "<span>Incluye datos de ejemplo</span>" : ""}</div>`;
}

async function vEmprendedores() {
  await cargar();
  const a = activas().length, s = suspendidas().length;
  const opciones = [["todos", "Todas", a + s], ["activos", "Activas", a], ["susp", "Suspendidas", s]];
  return {
    titulo: "Emprendedores",
    html: `<div class="page-head"><div><h1>Emprendedores</h1><p class="sub">Cada emprendedor entra con su cédula. Aquí creas sus cuentas, les das una clave nueva o los suspendes.</p></div>
      <div class="head-actions"><button type="button" class="btn btn-primary" data-act="agregar">${ic("plus")}Agregar emprendedor</button></div></div>
    <div class="panel table-panel">
      <div class="toolbar">
        <div class="search">${ic("search")}<input class="input" type="search" id="empQ" value="${esc(buscarE)}" placeholder="Buscar por nombre, negocio o cédula" aria-label="Buscar emprendedores"></div>
        <div class="seg" role="group" aria-label="Filtrar cuentas por estado">${opciones.map(([k, l, n]) => `<button type="button" data-act="efiltro" data-f="${k}" aria-pressed="${filtroE === k}">${l} <span class="n">${n}</span></button>`).join("")}</div>
      </div>
      <div id="empTable">${tablaEmp()}</div>
    </div>`,
    despues: () => { prepararDialogos(); filaNueva = null; },
  };
}

function mostrarClave(persona, clave, creada) {
  const nombre = primerNombre(persona.nombres);
  $("#claveTitulo").textContent = creada ? `Cuenta creada para ${nombre}` : `Clave nueva para ${nombre}`;
  $("#claveTexto").textContent = creada
    ? `Entra con su cédula (${persona.cedula}) y esta clave temporal.`
    : `Su clave anterior ya no funciona. Entra con su cédula (${persona.cedula}) y esta clave temporal.`;
  $("#claveCodigo").textContent = clave;
  const wa = $("#claveWa");
  if (persona.whatsapp) {
    const msg = [
      `Hola ${nombre}. ${creada ? "Ya tienes tu cuenta en la Comunidad JUMP." : "Esta es tu clave nueva de la Comunidad JUMP."}`,
      `Entra aquí: ${location.origin}/jump/comunidad/`,
      `Usuario (tu cédula): ${persona.cedula}`,
      `Clave temporal: ${clave}`,
      "La primera vez te pediremos crear tu propia clave. Esta clave vence en 7 días.",
    ].join("\n");
    wa.href = `https://wa.me/593${persona.whatsapp.slice(1)}?text=${encodeURIComponent(msg)}`;
    wa.hidden = false;
  } else {
    wa.removeAttribute("href");
    wa.hidden = true;
  }
  $("#claveSinWa").hidden = !!persona.whatsapp;
  $("#dlgClave").showModal();
}

async function enviarAgregar(f, btn) {
  const n = $("#adNombres"), c = $("#adCedula"), w = $("#adWa"), co = $("#adCorreo"), ne = $("#adNegocio");
  const nombres = normNombre(n.value), cedula = limpiarCedula(c.value), crudoWa = w.value.trim(), wa = crudoWa ? normWhatsapp(crudoWa) : "";
  const correo = co.value.trim(), negocio = normTexto(ne.value, 81).replace(/\s+/g, " ");
  fieldErr(n, nombres ? "" : "Escribe nombre y apellido.");
  fieldErr(c, !cedula ? "Escribe la cédula." : cedula.length !== 10 ? "La cédula tiene 10 números." : !cedulaValida(cedula) ? "Revisa la cédula: no parece correcta."
    : emprendedores().some((e) => e.cedula === cedula) ? "Ya existe una cuenta con esa cédula." : "");
  fieldErr(w, crudoWa && !wa ? "Escribe un celular de Ecuador, por ejemplo 0991234567." : "");
  fieldErr(co, correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo) ? "Revisa el correo." : "");
  fieldErr(ne, !negocio ? "Escribe el nombre del negocio." : [...negocio].length > 80 ? "Hasta 80 caracteres." : "");
  const malo = f.querySelector('[aria-invalid="true"]');
  if (malo) return malo.focus();
  let r;
  try {
    r = await ocupado(btn, datos.adminApi("crear-cuenta", { rol: "emprendedor", cedula, nombres, negocio, whatsapp: wa, correo }));
  } catch (e) {
    const campo = { cedula: c, nombres: n, negocio: ne, whatsapp: w, correo: co }[e.campo];
    if (campo) { fieldErr(campo, e.mensaje); return campo.focus(); }
    throw e;
  }
  $("#dlgAdd").close();
  f.reset();
  filtroE = "todos";
  buscarE = "";
  filaNueva = r.userId;
  invalidar();
  refrescar();
  mostrarClave({ nombres, cedula, whatsapp: wa }, r.clave, true);
}

async function suspenderCuenta(userId, motivo) {
  await datos.adminApi("suspender", { userId, motivo });
  invalidar();
  refrescar();
}

async function enviarSuspender(f, btn) {
  const e = miembroDe(objetivo);
  if (!e) return $("#dlgSusp").close();
  const motivo = $("#suspMotivo").value.trim();
  await ocupado(btn, datos.adminApi("suspender", { userId: e.userId, motivo }));
  $("#dlgSusp").close();
  invalidar();
  refrescar();
  toast(`Se suspendió la cuenta de ${e.nombres}`, { label: "Deshacer", fn: () => reactivarCuenta(e.userId, e.nombres, motivo).catch(() => toast("No se pudo deshacer. Intenta de nuevo.")) });
}

async function reactivarCuenta(userId, nombres, motivoAnterior) {
  await datos.adminApi("reactivar", { userId });
  invalidar();
  refrescar();
  toast(`${primerNombre(nombres)} puede volver a entrar`, { label: "Deshacer", fn: () => suspenderCuenta(userId, motivoAnterior).catch(() => toast("No se pudo deshacer. Intenta de nuevo.")) });
}

async function enviarReset(f, btn) {
  const e = miembroDe(objetivo);
  if (!e) return $("#dlgReset").close();
  const r = await ocupado(btn, datos.adminApi("clave-nueva", { userId: e.userId }));
  $("#dlgReset").close();
  invalidar();
  mostrarClave(e, r.clave, false);
}

// ---------- avisos ----------
function avisoAdmin(a) {
  let etiqueta = "Aviso", embed = "";
  if (a.tipo === "invitacion") {
    const c = a.claseId && claseDe(a.claseId);
    etiqueta = "Invitación a clase en vivo";
    if (c) embed = `<div class="embed">${dateTile(c)}<div class="grow"><b>${esc(c.titulo)}</b><span class="m-meta">${whenText(c)} · Zoom</span></div><a class="btn btn-ghost btn-sm" href="#a/clases">Ver clase</a></div>`;
  } else if (a.tipo === "mentoria") {
    const m = a.mentoriaId && mentoriaDe(a.mentoriaId);
    etiqueta = "Mentoría nueva";
    if (m) embed = `<div class="embed"><img src="${esc(m.portada)}" alt=""><div class="grow"><b>${esc(m.titulo)}</b><span class="m-meta">${mMeta(m)}</span></div><a class="btn btn-ghost btn-sm" href="#a/editor/${m.id}">Ver</a></div>`;
  }
  return `<article class="panel aviso">
    <div class="av-head"><span class="av-ava">${fig()}</span><div><b>Equipo JUMP</b><span class="m-meta">${esc(cap(haceCuanto(a.creadoEn)))} · ${etiqueta} · Visto por ${a.vistos} de ${activas().length}${ejemplo(a)}</span></div></div>
    <p class="av-text">${esc(a.texto)}</p>${embed}
  </article>`;
}

async function vAvisos() {
  await cargar();
  return {
    titulo: "Avisos",
    html: `<div class="page-head"><div><h1>Avisos</h1><p class="sub">Lo que publiques aquí lo ve toda la comunidad en su inicio y en Avisos. Las invitaciones a clases y las mentorías nuevas se publican solas.</p></div></div>
    <form class="panel compose" id="avisoForm" novalidate aria-labelledby="t-comp"><h2 id="t-comp">Escribir un aviso</h2>
      <div class="field"><label class="vh" for="avTexto">Aviso</label><textarea class="textarea" id="avTexto" rows="3" maxlength="1000" placeholder="Ej.: Este sábado hay feria en el parque central. ¿Quién se anota?" aria-describedby="avTextoErr"></textarea><p class="err" id="avTextoErr" hidden></p></div>
      <div class="compose-foot"><span class="hint">Lo verán ${plural(activas().length, "emprendedor activo", "emprendedores activos")}.</span><button class="btn btn-primary" type="submit">${ic("send")}Publicar aviso</button></div>
    </form>
    <h2 class="sec-title">Publicados</h2>
    <div id="avisosList">${A.avisos.length ? A.avisos.map(avisoAdmin).join("") : vacio("Todavía no hay avisos", "Lo que publiques aquí aparecerá en el inicio de cada emprendedor.")}</div>`,
  };
}

async function enviarAviso(f, btn) {
  const ta = $("#avTexto"), texto = ta.value.trim();
  fieldErr(ta, texto ? "" : "Escribe el aviso antes de publicarlo.");
  if (!texto) return ta.focus();
  await ocupado(btn, datos.publicarAviso(texto));
  invalidar();
  refrescar();
  toast("Aviso publicado para toda la comunidad");
}

// ---------- registro ----------
export const rutas = [
  { patron: "a/resumen", titulo: "Resumen", vista: vResumen },
  { patron: "a/mentorias", titulo: "Mentorías", vista: vMentorias },
  { patron: "a/clases", titulo: "Clases en vivo", vista: vClases },
  { patron: "a/emprendedores", titulo: "Emprendedores", vista: vEmprendedores },
  { patron: "a/avisos", titulo: "Avisos", vista: vAvisos },
];

export const acciones = {
  cerrar: (b) => b.closest("dialog")?.close(),
  agregar: () => {
    prepararDialogos();
    const f = $("#addForm");
    f.reset();
    $$("#addForm [aria-invalid]").forEach((i) => fieldErr(i, ""));
    $("#dlgAdd").showModal();
    $("#adNombres").focus();
  },
  efiltro: (b) => {
    filtroE = b.dataset.f;
    $$('[data-act="efiltro"]').forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $("#empTable").innerHTML = tablaEmp();
  },
  suspender: (b) => {
    const e = miembroDe(b.dataset.id);
    if (!e) return;
    prepararDialogos();
    objetivo = e.userId;
    $("#suspNombre").textContent = e.nombres;
    $("#suspForm").reset();
    $("#dlgSusp").showModal();
  },
  reactivar: (b) => {
    const e = miembroDe(b.dataset.id);
    if (!e) return;
    ocupado(b, reactivarCuenta(e.userId, e.nombres, e.motivoSuspension || ""));
  },
  clavenueva: (b) => {
    const e = miembroDe(b.dataset.id);
    if (!e) return;
    prepararDialogos();
    objetivo = e.userId;
    $("#resetNombre").textContent = primerNombre(e.nombres);
    $("#dlgReset").showModal();
  },
  copiarclave: () => copiar($("#claveCodigo").textContent, "Clave temporal copiada"),
  programar: () => abrirProgramar(),
  copiarzoom: (b) => { const c = claseDe(b.dataset.id); if (c?.joinUrl) copiar(c.joinUrl, "Enlace de Zoom copiado"); },
  recordar: async (b) => {
    const c = claseDe(b.dataset.id);
    if (!c) return;
    await ocupado(b, datos.reenviarInvitacion(c));
    invalidar();
    toast("Recordatorio publicado en la comunidad");
  },
  zoomcrear: async (b) => {
    await ocupado(b, datos.crearReunionZoom(b.dataset.id));
    invalidar();
    refrescar();
    toast("Reunión creada en Zoom");
  },
  zoompegar: (b) => filaForm(b.dataset.id, "zoomManual"),
  grabar: (b) => filaForm(b.dataset.id, "grabacion"),
};

export const envios = {
  addForm: enviarAgregar, suspForm: enviarSuspender, resetForm: enviarReset,
  schedForm: enviarProgramar, zoomManual: enviarZoomManual, grabacion: enviarGrabacion, avisoForm: enviarAviso,
};

export const entradas = {
  empQ: (el) => { buscarE = el.value; $("#empTable").innerHTML = tablaEmp(); },
};

export const cambios = {
  zoommodo: () => {
    const manual = document.querySelector('input[name="zoomModo"]:checked')?.value === "manual";
    $("#scEnlaceCampo").hidden = !manual;
    if (!manual) fieldErr($("#scEnlace"), "");
  },
};
