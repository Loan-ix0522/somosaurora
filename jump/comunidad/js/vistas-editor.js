// Equipo JUMP: editor de mentorías (crear, editar, publicar, pasar a borrador y borrar). Mockup "El aula", con datos reales.
// Los cambios de texto se guardan al publicar o guardar el borrador. Lo que se sube (archivos, enlaces, reunión de Zoom)
// queda guardado en el momento; si la mentoría todavía no existe en la base, primero se guarda.
import { $, esc, ic, plural, toast, fieldErr, ocupado } from "./ui.js";
import * as datos from "./datos.js";
import { aCampos, aISO } from "./fechas.js";
import { vacio, ftype, tamano, dominio } from "./piezas.js";
import { cargar, invalidar, activas, asegurarDialogo } from "./vistas-admin.js";
import { ir } from "./app.js";

let ED = null; // la mentoría que se está editando (sobrevive a salir y volver mientras no se guarde otra)
let trabajando = false;
let zoomListo = false;

export function limpiar() { ED = null; trabajando = false; }

const DURACIONES = ["60", "90", "120"];
const ACEPTA = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp";
const moduloVacio = (tipo) => ({
  id: null, titulo: "", tipo, videoUrl: "", duracion: tipo === "vivo" ? "60" : "", descripcion: "",
  claseId: null, fecha: "", hora: "", zoom: "", materiales: [], abierto: true, err: "",
});
const nueva = () => ({
  id: null, titulo: "", descripcion: "", mentor: "", portadaRuta: null, portada: datos.urlPortada(null), estado: "borrador",
  avisar: true, materiales: [], modulosBorrados: [], modulos: [moduloVacio("video")],
});

function desdeMentoria(A, m) {
  return {
    id: m.id, titulo: m.titulo, descripcion: m.descripcion, mentor: m.mentor, portadaRuta: m.portadaRuta, portada: m.portada,
    estado: m.estado, avisar: true, materiales: m.materiales.slice(), modulosBorrados: [],
    modulos: m.modulos.map((x) => {
      const c = x.claseId && A.clases.find((y) => y.id === x.claseId);
      const f = c ? aCampos(c.iniciaEn) : { fecha: "", hora: "" };
      return {
        id: x.id, titulo: x.titulo, tipo: x.tipo, videoUrl: x.videoUrl || "", descripcion: x.descripcion, claseId: x.claseId,
        duracion: String(x.tipo === "vivo" ? c?.duracionMin || x.duracionMin || 60 : x.duracionMin || ""),
        fecha: f.fecha, hora: f.hora, zoom: c?.joinUrl || "", materiales: x.materiales.slice(), abierto: false, err: "",
      };
    }),
  };
}

// ---------- piezas ----------
const archivosHTML = (lista) => lista.map((f) => `<li>${ftype(f)}<span class="mf-name">${esc(f.nombre)}</span><small>${esc(f.tipo === "enlace" ? dominio(f.url) : tamano(f.bytes))}</small>
  <button type="button" class="icon-btn" data-act="quitararchivo" data-id="${f.id}" aria-label="Quitar ${esc(f.nombre)}">${ic("x")}</button></li>`).join("");

function modHTML(m, i) {
  const vivo = m.tipo === "vivo", n = ED.modulos.length;
  const durs = vivo ? [...new Set([...DURACIONES, String(m.duracion || 60)])].sort((a, b) => a - b) : [];
  return `<li class="mod ${m.abierto ? "open" : ""} ${m.err ? "has-err" : ""}" data-mi="${i}">
    <div class="mod-head">
      <span class="mod-num">${i + 1}</span>
      <input class="mod-title" data-entrada="mf" data-mf="titulo" maxlength="120" value="${esc(m.titulo)}" placeholder="Título del módulo" aria-label="Título del módulo ${i + 1}">
      <span class="type-tag">${ic(vivo ? "video" : "play")}${vivo ? "En vivo" : "Video"}</span>
      <button type="button" class="icon-btn" data-act="mmover" data-d="-1" ${i === 0 ? "disabled" : ""} aria-label="Subir módulo ${i + 1}">${ic("up")}</button>
      <button type="button" class="icon-btn" data-act="mmover" data-d="1" ${i === n - 1 ? "disabled" : ""} aria-label="Bajar módulo ${i + 1}">${ic("down")}</button>
      <button type="button" class="icon-btn" data-act="mborrar" aria-label="Eliminar módulo ${i + 1}">${ic("trash")}</button>
      <button type="button" class="icon-btn" data-act="mabrir" aria-expanded="${!!m.abierto}" aria-label="${m.abierto ? "Cerrar" : "Abrir"} módulo ${i + 1}">${ic("chev", "chev")}</button>
    </div>
    ${m.err ? `<p class="err mod-err">${ic("alert")}${esc(m.err)}</p>` : ""}
    <div class="mod-body">
      <div class="seg" role="group" aria-label="Tipo de módulo"><button type="button" data-act="mtipo" data-tipo="video" aria-pressed="${!vivo}">${ic("play")}Video grabado</button><button type="button" data-act="mtipo" data-tipo="vivo" aria-pressed="${vivo}">${ic("video")}Clase en vivo</button></div>
      ${vivo ? `
      <div class="grid3">
        <label class="field"><span>Fecha</span><input class="input" type="date" data-entrada="mf" data-mf="fecha" value="${esc(m.fecha)}"></label>
        <label class="field"><span>Hora</span><input class="input" type="time" data-entrada="mf" data-mf="hora" value="${esc(m.hora)}"></label>
        <label class="field"><span>Duración</span><select class="select" data-entrada="mf" data-mf="duracion">${durs.map((v) => `<option value="${v}" ${String(m.duracion) === v ? "selected" : ""}>${v} min</option>`).join("")}</select></label>
      </div>
      <div class="field"><span class="label">Enlace de Zoom</span>
        <div class="zoom-row"><input class="input" data-entrada="mf" data-mf="zoom" inputmode="url" value="${esc(m.zoom)}" placeholder="https://zoom.us/j/…" aria-label="Enlace de Zoom del módulo ${i + 1}"><button type="button" class="btn btn-ghost" data-act="mkzoom" ${zoomListo ? "" : "disabled"}>${ic("video")}Crear reunión en Zoom</button></div>
        ${zoomListo ? "" : `<p class="hint">Para crear la reunión desde aquí, conecta la cuenta de Zoom en <a href="#a/ajustes">Ajustes</a>. También puedes pegar el enlace.</p>`}</div>
      <p class="hint">Después de la clase, agrega la grabación desde Clases en vivo y queda como video para quien no pudo entrar.</p>` : `
      <div class="grid-vid">
        <label class="field"><span>Enlace del video</span><input class="input" data-entrada="mf" data-mf="videoUrl" inputmode="url" value="${esc(m.videoUrl)}" placeholder="https://youtube.com/…"></label>
        <label class="field"><span>Duración</span><input class="input" data-entrada="mf" data-mf="duracion" value="${esc(m.duracion)}" inputmode="numeric" maxlength="3" placeholder="min"></label>
      </div>
      <p class="hint">Pega el enlace de YouTube o Vimeo (puede ser “no listado”).</p>`}
      <label class="field"><span>Descripción</span><textarea class="textarea" data-entrada="mf" data-mf="descripcion" rows="2" maxlength="2000" placeholder="Qué va a aprender el emprendedor en este módulo">${esc(m.descripcion)}</textarea></label>
      <div class="field"><span class="label">Material de este módulo</span>
        ${m.materiales.length ? `<ul class="mini-files">${archivosHTML(m.materiales)}</ul>` : ""}
        <label class="btn btn-ghost btn-sm attach">${ic("upload")}Adjuntar archivos<input type="file" multiple accept="${ACEPTA}" data-cambio="materialmod" aria-label="Adjuntar archivos al módulo ${i + 1}"></label></div>
    </div>
  </li>`;
}

function previewHTML() {
  const vivo = ED.modulos.filter((x) => x.tipo === "vivo").length;
  const nArch = ED.materiales.length + ED.modulos.reduce((n, x) => n + x.materiales.length, 0);
  return `<div class="m-card"><div class="m-cover"><img src="${esc(ED.portada)}" alt=""><span class="pill pill-new">Nueva</span></div>
    <div class="m-body"><h3>${ED.titulo.trim() ? esc(ED.titulo) : '<span class="empty-t" style="color:var(--ph);font-style:italic">Sin título</span>'}</h3>
    <p class="m-meta">${plural(ED.modulos.length, "módulo", "módulos")}${vivo ? ` · ${vivo} en vivo` : ""} · ${plural(nArch, "archivo", "archivos")}</p></div></div>
    <ol class="pv-list">${ED.modulos.map((x, k) => `<li><span class="mk">${k + 1}</span>${x.titulo.trim() ? `<span>${esc(x.titulo)}</span>` : '<span class="empty-t">Módulo sin título</span>'}</li>`).join("")}</ol>`;
}

function pubHTML() {
  const publicada = ED.estado === "publicada";
  return `<div class="pub-row"><span class="label">Estado</span>${publicada ? '<span class="pill pill-ok">Publicada</span>' : '<span class="pill pill-draft">Borrador</span>'}</div>
    <p class="hint">La verán los <b style="color:var(--ink)">${plural(activas().length, "emprendedor activo", "emprendedores activos")}</b>.</p>
    <label class="check"><input type="checkbox" data-entrada="ed" data-ed="avisar" ${ED.avisar ? "checked" : ""}><span>Avisar en la Comunidad JUMP al publicar, con la invitación a sus clases en vivo</span></label>
    <div class="banner banner-bad" id="pubErr" role="alert" hidden></div>
    <button type="button" class="btn btn-primary btn-block" data-act="publicar">${ic("send")}${publicada ? "Guardar y publicar" : "Publicar mentoría"}</button>
    ${publicada ? '<button type="button" class="btn btn-ghost btn-block" data-act="pasarborrador">Pasar a borrador</button>' : '<button type="button" class="btn btn-ghost btn-block" data-act="borrador">Guardar borrador</button>'}
    ${ED.id ? `<button type="button" class="btn-link btn-danger-link" data-act="borrarmentoria">${ic("trash")}Borrar mentoría</button>` : ""}`;
}

const pintarModulos = () => { $("#mods").innerHTML = ED.modulos.map(modHTML).join(""); $("#modCount").textContent = ED.modulos.length; pintarPreview(); };
const pintarPreview = () => { $("#pv").innerHTML = previewHTML(); };
const pintarArchivos = () => { $("#edFiles").innerHTML = archivosHTML(ED.materiales); pintarPreview(); };
const pintarPub = () => { $("#pubPanel").innerHTML = pubHTML(); };

// ---------- vista ----------
async function vEditor({ partes }) {
  const A = await cargar();
  const id = partes[2];
  zoomListo = !!A.zoom.conectada;
  if (id === "nueva") { if (!ED || ED.id) ED = nueva(); }
  else if (!ED || ED.id !== id) {
    const m = A.mentorias.find((x) => x.id === id);
    if (!m) return { titulo: "Mentoría no encontrada", html: vacio("No encontramos esta mentoría", "Puede que alguien del equipo la haya borrado.", `<a class="btn btn-primary" href="#a/mentorias">Ver mentorías</a>`) };
    ED = desdeMentoria(A, m);
  }
  const esNueva = !ED.id;
  return {
    titulo: esNueva ? "Nueva mentoría" : "Editar mentoría",
    html: `<nav class="crumbs" aria-label="Ruta"><a href="#a/mentorias">Mentorías</a>${ic("right")}<span>${esNueva ? "Nueva mentoría" : esc(ED.titulo || "Mentoría sin título")}</span></nav>
    <div class="page-head"><div><h1>${esNueva ? "Nueva mentoría" : "Editar mentoría"}</h1><p class="sub">Agrega todos los módulos que necesites. Cada uno puede ser un video grabado o una clase en vivo por Zoom.</p></div></div>
    <div class="editor">
      <div>
        <section class="panel ed-sec" aria-labelledby="t-ed1"><header><h2 id="t-ed1">Datos de la mentoría</h2></header>
          <div class="field"><label class="label" for="edTitulo">Título</label><input class="input" id="edTitulo" data-entrada="ed" data-ed="titulo" maxlength="120" value="${esc(ED.titulo)}" placeholder="Ej.: Factura electrónica sin miedo" aria-describedby="edTituloErr"><p class="err" id="edTituloErr" hidden></p></div>
          <div class="field"><label class="label" for="edDesc">Descripción corta</label><textarea class="textarea" id="edDesc" data-entrada="ed" data-ed="descripcion" rows="2" maxlength="1000" placeholder="Qué va a lograr el emprendedor al terminarla">${esc(ED.descripcion)}</textarea></div>
          <div class="field"><label class="label" for="edMentor">Quién la da <span class="opt">(opcional)</span></label><input class="input" id="edMentor" data-entrada="ed" data-ed="mentor" maxlength="80" value="${esc(ED.mentor)}" placeholder="Nombre del mentor o mentora"></div>
          <div class="field"><span class="label">Portada</span>
            <div class="cover-pick"><div class="cover-prev" id="coverPrev"><img src="${esc(ED.portada)}" alt="Portada elegida"></div>
            <div style="display:grid;gap:8px;justify-items:start"><label class="btn btn-ghost btn-sm attach">${ic("upload")}${ED.portadaRuta ? "Cambiar foto" : "Subir foto"}<input type="file" accept="image/jpeg,image/png,image/webp" data-cambio="portada" aria-label="Subir foto de portada"></label>
            <p class="hint">Una foto horizontal del programa. Se ve en la tarjeta y detrás del video.</p></div></div></div>
        </section>
        <section class="panel ed-sec" aria-labelledby="t-ed2"><header><h2 id="t-ed2">Módulos <span class="count" id="modCount">${ED.modulos.length}</span></h2><p class="hint">Ordénalos con las flechas. Lo que no tenga título no se puede publicar.</p></header>
          <ol class="mods" id="mods">${ED.modulos.map(modHTML).join("")}</ol>
          <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn btn-ghost" data-act="addmod" data-tipo="video">${ic("plus")}Agregar video</button><button type="button" class="btn btn-ghost" data-act="addmod" data-tipo="vivo">${ic("plus")}Agregar clase en vivo</button></div>
        </section>
        <section class="panel ed-sec" aria-labelledby="t-ed3"><header><h2 id="t-ed3">Material adicional</h2><p class="hint">Archivos y enlaces para toda la mentoría: guías, plantillas, páginas útiles.</p></header>
          <label class="drop" id="drop">${ic("upload")}<span><b>Arrastra archivos aquí</b> o elígelos desde tu computadora</span><span class="hint">PDF, Word, Excel, PowerPoint o imágenes · hasta 20 MB cada uno</span><input type="file" multiple accept="${ACEPTA}" data-cambio="material" class="vh"></label>
          <ul class="mini-files" id="edFiles">${archivosHTML(ED.materiales)}</ul>
          <div class="zoom-row"><input class="input" id="linkIn" inputmode="url" placeholder="Pega un enlace útil (https://…)" aria-label="Enlace útil" aria-describedby="linkInErr"><button type="button" class="btn btn-ghost" data-act="addlink">${ic("link")}Agregar enlace</button></div>
          <p class="err" id="linkInErr" hidden></p>
        </section>
      </div>
      <aside class="ed-side">
        <div class="panel pub" id="pubPanel">${pubHTML()}</div>
        <div class="panel preview" aria-live="polite"><span class="label">Así la verá el emprendedor</span><div id="pv">${previewHTML()}</div></div>
      </aside>
    </div>`,
    despues: soltarArchivos,
  };
}

// Arrastrar y soltar sobre la zona de material: se pasa al input, que avisa con "change".
function soltarArchivos() {
  const d = $("#drop");
  if (!d) return;
  for (const t of ["dragenter", "dragover"]) d.addEventListener(t, (e) => { e.preventDefault(); d.classList.add("over"); });
  for (const t of ["dragleave", "drop"]) d.addEventListener(t, (e) => { e.preventDefault(); d.classList.remove("over"); });
  d.addEventListener("drop", (e) => {
    const inp = d.querySelector("input");
    if (!e.dataTransfer?.files?.length) return;
    try { inp.files = e.dataTransfer.files; inp.dispatchEvent(new Event("change", { bubbles: true })); } catch { /* navegador sin DataTransfer asignable */ }
  });
}

// ---------- validación ----------
function fechaValida(m) {
  if (!m.fecha || !m.hora) return true;
  try { aISO(m.fecha, m.hora); return true; } catch { return false; }
}

// Al publicar se pide todo; al guardar un borrador, solo que lo escrito tenga un formato que la base acepte.
function validar(publicar) {
  let errs = 0;
  const t = ED.titulo.trim();
  const mt = publicar && !t ? "Ponle un título a la mentoría." : t && t.length < 3 ? "El título necesita al menos 3 letras." : "";
  fieldErr($("#edTitulo"), mt);
  if (mt) errs++;
  for (const m of ED.modulos) {
    const tt = m.titulo.trim(), v = m.videoUrl.trim(), z = m.zoom.trim(), dur = String(m.duracion).trim();
    m.err = "";
    if (publicar && !tt) m.err = "Falta el título del módulo.";
    else if (m.tipo === "video" && publicar && !v) m.err = "Falta el enlace del video.";
    else if (m.tipo === "video" && v && !datos.RE_VIDEO.test(v)) m.err = "Pega un enlace de YouTube o Vimeo (empieza con https://).";
    else if (m.tipo === "video" && dur && !(/^\d{1,3}$/.test(dur) && +dur >= 1 && +dur <= 600)) m.err = "La duración va en minutos, de 1 a 600.";
    else if (m.tipo === "vivo" && publicar && (!m.fecha || !m.hora || !z)) m.err = "Falta la fecha, la hora o el enlace de Zoom.";
    else if (m.tipo === "vivo" && z && !datos.RE_ZOOM.test(z)) m.err = "El enlace debe ser de Zoom: empieza con https://zoom.us/ o con tu subdominio de Zoom.";
    else if (m.tipo === "vivo" && !fechaValida(m)) m.err = "Revisa la fecha y la hora.";
    if (m.err) { errs++; m.abierto = true; }
  }
  pintarModulos();
  const box = $("#pubErr");
  if (errs) {
    box.hidden = false;
    box.innerHTML = `${ic("alert")}<span>Revisa ${plural(errs, "campo marcado", "campos marcados")} en rojo antes de ${publicar ? "publicar" : "guardar"}.</span>`;
    ($('#edTitulo[aria-invalid="true"]') || $(".mod.has-err .mod-title"))?.focus();
  } else box.hidden = true;
  return errs === 0;
}

// ---------- guardar ----------
async function guardar() {
  const esNueva = !ED.id;
  await datos.guardarMentoria(ED);
  invalidar();
  if (esNueva) {
    // La dirección pasa a ser la de la mentoría sin volver a dibujar la página (no se pierde lo que se está haciendo).
    history.replaceState(null, "", "#a/editor/" + ED.id);
    pintarPub();
  }
}

// Una cosa a la vez: evita el doble clic y que dos subidas creen dos veces la misma mentoría.
async function aSolas(fn) {
  if (trabajando) return;
  trabajando = true;
  try { return await fn(); } finally { trabajando = false; }
}

// Antes de subir algo, la mentoría (y el módulo, si el archivo es de un módulo) tiene que existir en la base.
async function asegurarGuardada(i = null) {
  if (ED.id && (i == null || ED.modulos[i].id)) return true;
  if (!validar(false)) { toast("Revisa los campos marcados antes de subir archivos."); return false; }
  await guardar();
  return true;
}

async function subirVarios(files, i) {
  const lista = i == null ? ED.materiales : ED.modulos[i].materiales;
  let ok = 0;
  for (const f of files) {
    const malo = datos.errorMaterial(f);
    if (malo) { toast(malo); continue; }
    lista.push(await datos.subirMaterial(ED.id, i == null ? null : ED.modulos[i].id, f, lista.length));
    ok++;
    if (i == null) pintarArchivos(); else pintarModulos();
  }
  invalidar();
  if (ok) toast(ok === 1 ? "Archivo subido" : `${ok} archivos subidos`);
}

function buscarMaterial(id) {
  const i = ED.materiales.findIndex((f) => f.id === id);
  if (i >= 0) return { lista: ED.materiales, i, mod: null };
  for (const m of ED.modulos) {
    const k = m.materiales.findIndex((f) => f.id === id);
    if (k >= 0) return { lista: m.materiales, i: k, mod: m };
  }
  return null;
}

// ---------- registro ----------
export const rutas = [{ patron: /^a\/editor\/(nueva|[0-9a-f-]{36})$/, activo: "a/mentorias", titulo: "Editor", vista: vEditor }];

const indice = (b) => +b.closest(".mod").dataset.mi;

export const acciones = {
  addmod: (b) => {
    for (const m of ED.modulos) m.abierto = false;
    ED.modulos.push(moduloVacio(b.dataset.tipo));
    pintarModulos();
    const li = $("#mods").lastElementChild;
    li.scrollIntoView({ block: "center" });
    li.querySelector(".mod-title").focus({ preventScroll: true });
  },
  mabrir: (b) => {
    const i = indice(b), m = ED.modulos[i], li = b.closest(".mod");
    m.abierto = !m.abierto;
    li.classList.toggle("open", m.abierto);
    b.setAttribute("aria-expanded", String(m.abierto));
    b.setAttribute("aria-label", `${m.abierto ? "Cerrar" : "Abrir"} módulo ${i + 1}`);
  },
  mtipo: (b) => {
    const m = ED.modulos[indice(b)];
    m.tipo = b.dataset.tipo;
    if (m.tipo === "vivo" && !DURACIONES.includes(String(m.duracion))) m.duracion = "60";
    if (m.tipo === "video" && DURACIONES.includes(String(m.duracion))) m.duracion = "";
    m.err = "";
    pintarModulos();
  },
  mborrar: (b) => {
    const i = indice(b);
    if (ED.modulos.length === 1) return toast("La mentoría necesita al menos un módulo");
    const [fuera] = ED.modulos.splice(i, 1);
    const marca = fuera.id ? { id: fuera.id, claseId: fuera.claseId, rutas: fuera.materiales.map((f) => f.ruta).filter(Boolean) } : null;
    if (marca) ED.modulosBorrados.push(marca);
    pintarModulos();
    toast(`Quitaste el módulo ${i + 1}. Se borra al guardar.`, {
      label: "Deshacer",
      fn: () => { ED.modulos.splice(i, 0, fuera); ED.modulosBorrados = ED.modulosBorrados.filter((x) => x !== marca); pintarModulos(); },
    });
  },
  mmover: (b) => {
    const i = indice(b), j = i + +b.dataset.d;
    if (j < 0 || j >= ED.modulos.length) return;
    [ED.modulos[i], ED.modulos[j]] = [ED.modulos[j], ED.modulos[i]];
    pintarModulos();
    const li = $(`.mod[data-mi="${j}"]`);
    (li.querySelector(`[data-act="mmover"][data-d="${b.dataset.d}"]:not([disabled])`) || li.querySelector(".mod-title")).focus();
  },
  mkzoom: (b) => aSolas(async () => {
    const i = indice(b), m = ED.modulos[i];
    if (!m.fecha || !m.hora) { m.err = "Pon la fecha y la hora antes de crear la reunión."; m.abierto = true; pintarModulos(); return; }
    if (!validar(false)) return;
    const r = await ocupado(b, (async () => { await guardar(); return datos.crearReunionZoom(m.claseId); })());
    m.zoom = r.joinUrl;
    invalidar();
    pintarModulos();
    toast("Reunión creada en Zoom");
  }),
  quitararchivo: (b) => aSolas(async () => {
    const r = buscarMaterial(b.dataset.id);
    if (!r) return;
    const f = r.lista[r.i];
    await ocupado(b, datos.quitarMaterial(f));
    r.lista.splice(r.i, 1);
    invalidar();
    if (r.mod) pintarModulos(); else pintarArchivos();
    toast(`Quitaste “${f.nombre}”`);
  }),
  addlink: (b) => aSolas(async () => {
    const inp = $("#linkIn"), v = inp.value.trim();
    fieldErr(inp, !v ? "Pega el enlace." : /^https:\/\/\S+\.\S+/.test(v) ? "" : "El enlace debe empezar con https://");
    if (inp.getAttribute("aria-invalid") === "true") return inp.focus();
    if (!(await asegurarGuardada())) return;
    ED.materiales.push(await ocupado(b, datos.agregarEnlace(ED.id, null, v, ED.materiales.length)));
    inp.value = "";
    invalidar();
    pintarArchivos();
  }),
  publicar: (b) => aSolas(async () => {
    if (!validar(true)) return;
    const r = await ocupado(b, (async () => { await datos.guardarMentoria(ED); return datos.publicarMentoria(ED.id, { avisar: ED.avisar }); })());
    ED = null;
    invalidar();
    ir("a/mentorias");
    const extra = [r.avisoNuevo && "se avisó a la comunidad", r.invitaciones && `se publicó la invitación a ${plural(r.invitaciones, "clase", "clases")}`].filter(Boolean);
    toast(`Mentoría publicada${extra.length ? ": " + extra.join(" y ") : ""}.`);
  }),
  borrador: (b) => aSolas(async () => {
    if (!validar(false)) return;
    await ocupado(b, guardar());
    toast("Borrador guardado");
  }),
  pasarborrador: (b) => aSolas(async () => {
    if (!validar(false)) return;
    await ocupado(b, (async () => { await datos.guardarMentoria(ED); await datos.pasarABorrador(ED.id); })());
    ED.estado = "borrador";
    invalidar();
    pintarPub();
    toast("La mentoría pasó a borrador: los emprendedores ya no la ven.");
  }),
  borrarmentoria: () => {
    asegurarDialogo("dlgBorrar", `<dialog id="dlgBorrar" aria-labelledby="borrarTitulo">
      <form id="borrarForm" novalidate>
        <div class="dlg-body">
          <div class="dlg-head"><span class="dlg-ic">${ic("trash")}</span><h2 id="borrarTitulo">¿Borrar “<span id="borrarNombre"></span>”?</h2></div>
          <p>Se borran sus módulos, materiales y el avance de los emprendedores. También sus clases en vivo y sus avisos. No se puede deshacer.</p>
        </div>
        <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-act="cerrar">Cancelar</button><button class="btn btn-danger" type="submit">Borrar mentoría</button></div>
      </form></dialog>`);
    $("#borrarNombre").textContent = ED.titulo.trim() || "Mentoría sin título";
    $("#dlgBorrar").showModal();
  },
};

export const envios = {
  borrarForm: (f, btn) => aSolas(async () => {
    const titulo = ED.titulo.trim() || "Mentoría sin título";
    await ocupado(btn, datos.borrarMentoria(ED.id));
    $("#dlgBorrar").close();
    ED = null;
    invalidar();
    ir("a/mentorias");
    toast(`Se borró “${titulo}”`);
  }),
};

export const entradas = {
  ed: (el) => {
    if (!ED) return;
    ED[el.dataset.ed] = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.ed === "titulo") fieldErr(el, "");
    pintarPreview();
  },
  mf: (el) => {
    const li = el.closest(".mod");
    if (!ED || !li) return;
    const m = ED.modulos[+li.dataset.mi];
    m[el.dataset.mf] = el.value;
    if (m.err) { m.err = ""; li.classList.remove("has-err"); li.querySelector(".mod-err")?.remove(); }
    if (el.dataset.mf === "titulo") pintarPreview();
  },
};

export const cambios = {
  portada: (el) => aSolas(async () => {
    const f = el.files[0];
    el.value = "";
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast("La portada tiene que ser una foto JPG, PNG o WebP.");
    const ruta = await datos.subirPortada(f);
    ED.portadaRuta = ruta;
    ED.portada = datos.urlPortada(ruta);
    $("#coverPrev").innerHTML = `<img src="${esc(ED.portada)}" alt="Portada elegida">`;
    pintarPreview();
    toast("Portada lista. Se guarda al publicar o guardar el borrador.");
  }),
  material: (el) => aSolas(async () => {
    const files = [...el.files];
    el.value = "";
    if (!files.length || !(await asegurarGuardada())) return;
    await subirVarios(files, null);
  }),
  materialmod: (el) => aSolas(async () => {
    const i = +el.closest(".mod").dataset.mi, files = [...el.files];
    el.value = "";
    if (!files.length || !(await asegurarGuardada(i))) return;
    await subirVarios(files, i);
  }),
};
