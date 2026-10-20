// Muro de la comunidad (emprendedores y equipo): publicaciones con texto y foto, comentarios y moderación del equipo.
// Todo el texto se escapa: nada de HTML ni enlaces activos. Sin amarillo: aquí no hay nada "actual".
import { $, esc, ic, fig, iniciales, plural, toast, ocupado, asegurarDialogo } from "./ui.js";
import * as datos from "./datos.js";
import { haceCuanto } from "./fechas.js";
import { vacio } from "./piezas.js";
import { estado } from "./app.js";

const MAX_TEXTO = 1000, CONTAR_DESDE = 800;
let M = null;        // lo cargado en esta visita: { posts, hayMas, abiertos (posts con todos sus comentarios a la vista) }
let foto = null;     // la foto elegida para la publicación nueva
let previa = "";     // su URL de vista previa
let publicando = false;
let borrando = null; // { tipo: "post" | "com", id, postId }

export function limpiar() { M = null; soltarFoto(); }

const esEquipo = () => estado.yo?.rol === "admin";
const yoId = () => estado.yo?.userId;
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const postDe = (id) => M?.posts.find((p) => p.id === id);
const ejemplo = (x) => (x.esEjemplo ? ' <span class="tag">Ejemplo</span>' : "");
const hora = (iso) => `<time datetime="${esc(iso)}">${esc(cap(haceCuanto(iso)))}</time>`;
const TONOS = ["", "k2", "k3"]; // los avatares sin el tono amarillo
function avatar(id, a, cls = "") {
  if (a.rol === "admin") return `<span class="ava ava-team ${cls}" aria-hidden="true">${fig()}</span>`;
  return `<span class="ava ${TONOS[parseInt(String(id).slice(-2), 16) % 3] || ""} ${cls}" aria-hidden="true">${esc(iniciales(a.nombre))}</span>`;
}
const yoComoAutor = () => ({ nombre: estado.yo?.nombres || "", rol: estado.yo?.rol });

// ---------- piezas ----------
const fotoHtml = (p) => p.fotoUrl
  ? `<a class="post-foto" href="${esc(p.fotoUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Ver la foto completa"><img src="${esc(p.fotoUrl)}" alt="" loading="lazy" decoding="async"></a>`
  : p.foto ? `<div class="post-foto is-missing">${ic("image")}<span>La foto no se pudo cargar. Vuelve a abrir la página.</span></div>` : "";

function comHtml(c) {
  const equipo = esEquipo(), nombre = esc(c.autor.nombre), accion = c.oculto ? "Mostrar" : "Ocultar";
  return `<li class="com${c.oculto ? " is-hidden" : ""}" data-com="${c.id}">${avatar(c.autorId, c.autor, "sm")}
    <div class="com-body"><p class="com-who"><b>${nombre}</b>${ejemplo(c)}<span class="m-meta">${hora(c.creadoEn)}</span></p>
      <p class="com-text">${esc(c.texto)}</p>
      ${c.oculto ? `<p class="com-flag">${equipo ? '<span class="pill pill-draft">Oculto por el equipo</span>' : "El equipo ocultó tu comentario. Solo lo ves tú."}</p>` : ""}</div>
    <div class="com-acts">
      ${equipo ? `<button type="button" class="icon-btn" data-act="muroOcultarCom" data-id="${c.id}" data-post="${c.postId}"${c.oculto ? "" : ' data-si="1"'} aria-label="${accion} el comentario de ${nombre}" title="${accion}">${ic(c.oculto ? "eye" : "eye-off")}</button>` : ""}
      ${c.autorId === yoId() ? `<button type="button" class="icon-btn" data-act="muroBorrarCom" data-id="${c.id}" data-post="${c.postId}" aria-label="Borrar tu comentario" title="Borrar">${ic("trash")}</button>` : ""}
    </div></li>`;
}

function postHtml(p) {
  const equipo = esEquipo(), nombre = esc(p.autor.nombre), abierto = M.abiertos.has(p.id);
  const n = p.comentarios.length, lista = abierto ? p.comentarios : p.comentarios.slice(-2);
  const aviso = !p.oculto ? ""
    : equipo ? '<p class="post-flag"><span class="pill pill-draft">Oculto por el equipo</span><span>Solo la ven su autor y el equipo.</span></p>'
    : `<p class="post-flag">${ic("eye-off")}<span>El equipo ocultó esta publicación. Solo la ves tú.</span></p>`;
  return `<article class="panel post${p.oculto ? " is-hidden" : ""}" data-post="${p.id}" aria-labelledby="pa-${p.id}">
    <header class="post-head">${avatar(p.autorId, p.autor)}
      <div class="post-who"><p id="pa-${p.id}"><b>${nombre}</b>${p.autor.negocio ? `<span> · ${esc(p.autor.negocio)}</span>` : ""}${ejemplo(p)}</p><p class="m-meta">${hora(p.creadoEn)}</p></div>
      <div class="post-acts">
        ${equipo ? `<button type="button" class="btn btn-ghost btn-sm" data-act="muroOcultar" data-id="${p.id}"${p.oculto ? "" : ' data-si="1"'}>${ic(p.oculto ? "eye" : "eye-off")}<span class="lbl">${p.oculto ? "Mostrar" : "Ocultar"}</span><span class="vh"> la publicación de ${nombre}</span></button>` : ""}
        ${p.autorId === yoId() ? `<button type="button" class="btn btn-ghost btn-sm btn-warn" data-act="muroBorrar" data-id="${p.id}">${ic("trash")}<span class="lbl">Borrar</span><span class="vh"> tu publicación</span></button>` : ""}
      </div></header>
    ${aviso}
    ${p.texto ? `<p class="post-text">${esc(p.texto)}</p>` : ""}
    ${fotoHtml(p)}
    <div class="post-coms">
      ${n ? `<div class="coms-head"><span>${plural(n, "comentario", "comentarios")}</span>${n > 2 && !abierto ? `<button type="button" class="btn-link" data-act="muroVerTodos" data-id="${p.id}">Ver todos</button>` : ""}</div>` : ""}
      ${lista.length ? `<ul class="coms">${lista.map(comHtml).join("")}</ul>` : ""}
      ${p.oculto ? "" : `<form class="com-form" data-envio="muroComentar" data-post="${p.id}" novalidate>${avatar(yoId(), yoComoAutor(), "sm")}
        <input class="input" name="texto" maxlength="500" placeholder="Escribe un comentario" aria-label="Escribe un comentario a ${nombre}" autocomplete="off" enterkeyhint="send">
        <button type="submit" class="icon-btn com-send" aria-label="Comentar" title="Comentar">${ic("send")}</button></form>`}
    </div></article>`;
}

const masHtml = () => (M.hayMas ? '<div class="muro-mas"><button type="button" class="btn btn-ghost" data-act="muroMas">Ver más</button></div>' : "");
function listaHtml() {
  if (!M.posts.length) return vacio("Todavía no hay publicaciones", esEquipo() ? "Cuando los emprendedores publiquen, lo verás aquí." : "Cuenta tu primer avance.");
  return M.posts.map(postHtml).join("") + masHtml();
}

const composer = () => `<form id="muroForm" class="panel composer" novalidate>
    <label class="composer-t" for="muroTexto">Comparte con la comunidad</label>
    <textarea id="muroTexto" class="textarea" rows="3" maxlength="${MAX_TEXTO}" placeholder="Cuenta un avance o haz una pregunta…" aria-describedby="muroErr" data-entrada="muroTexto"></textarea>
    <div class="composer-previa" id="muroPrevia" hidden><img alt="Vista previa de la foto que vas a publicar"><button type="button" class="icon-btn" data-act="muroQuitarFoto" aria-label="Quitar la foto" title="Quitar la foto">${ic("x")}</button></div>
    <p class="err" id="muroErr" role="alert" hidden></p>
    <div class="composer-foot">
      <label class="btn btn-ghost btn-sm attach">${ic("image")}Agregar foto<input type="file" accept="image/*" data-cambio="muroFoto" aria-label="Agregar foto"></label>
      <span class="count" id="muroCuenta" hidden></span>
      <button type="submit" class="btn btn-primary">${ic("send")}Publicar</button>
    </div></form>`;

async function vMuro() {
  M = { ...(await datos.listarPosts()), abiertos: new Set() };
  soltarFoto();
  return {
    titulo: "Comunidad",
    html: `<div class="page-head"><div><h1>Comunidad</h1><p class="sub">${esEquipo()
      ? "Lo que comparten los emprendedores. Si algo no corresponde, ocúltalo: deja de verse para los demás y su autor ve que el equipo lo ocultó."
      : "Cuenta tus avances, haz preguntas y anima a los demás. Lo que publicas lo ve toda la Comunidad JUMP."}</p></div></div>
      <div class="muro">${composer()}<section class="feed" id="muroLista" aria-label="Publicaciones">${listaHtml()}</section></div>`,
  };
}

// ---------- cambios en pantalla (sin volver a dibujar la página: no se pierde lo que se está escribiendo en otra parte) ----------
function repintar(id) {
  const el = document.querySelector(`[data-post="${id}"]`);
  if (!el) return;
  const p = postDe(id);
  if (p) { el.outerHTML = postHtml(p); return; }
  el.remove();
  if (!M.posts.length) $("#muroLista").innerHTML = listaHtml();
}
function soltarFoto() {
  if (previa) URL.revokeObjectURL(previa);
  foto = null;
  previa = "";
  const box = $("#muroPrevia");
  if (box) { box.hidden = true; box.querySelector("img").removeAttribute("src"); }
}
function errMuro(msg, enTexto = false) {
  const p = $("#muroErr");
  if (!p) return;
  p.hidden = !msg;
  p.innerHTML = msg ? ic("alert") + esc(msg) : "";
  $("#muroTexto").setAttribute("aria-invalid", msg && enTexto ? "true" : "false");
}
function contar(t) {
  const c = $("#muroCuenta"), n = t.value.length;
  c.hidden = n < CONTAR_DESDE;
  c.textContent = `${n}/${MAX_TEXTO}`;
  c.classList.toggle("is-max", n >= MAX_TEXTO);
}
// Un mensaje técnico de la base no se muestra; la sesión vencida o la cuenta suspendida las resuelve app.js.
function mensaje(e) {
  if (e.codigo === "sesion" || e.codigo === "suspendida") throw e;
  if (e.codigo === "red") return "No se pudo conectar. Revisa tu internet.";
  return (e.codigo !== "servidor" && e.mensaje) || "No se pudo completar. Intenta de nuevo.";
}

async function ponerOculto(tipo, x, si, boton) {
  await ocupado(boton, datos.ocultar(tipo, x.id, si));
  x.oculto = si;
  repintar(tipo === "post" ? x.id : x.postId);
  const que = tipo === "post" ? "La publicación" : "El comentario";
  if (si) toast(`${que} quedó oculto para los emprendedores.`, { label: "Deshacer", fn: () => ponerOculto(tipo, x, false) });
  else toast(`${que} se ve otra vez.`);
}

function abrirBorrar(obj) {
  borrando = obj;
  asegurarDialogo("dlgBorrarPost", `<dialog id="dlgBorrarPost" aria-labelledby="bpTitulo"><form id="borrarPostForm" novalidate>
    <div class="dlg-body"><div class="dlg-head"><span class="dlg-ic">${ic("trash")}</span><h2 id="bpTitulo"></h2></div><p id="bpTexto"></p></div>
    <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-act="cerrar">Cancelar</button><button class="btn btn-danger" type="submit">Borrar</button></div>
  </form></dialog>`);
  const post = obj.tipo === "post";
  $("#bpTitulo").textContent = post ? "¿Borrar tu publicación?" : "¿Borrar tu comentario?";
  $("#bpTexto").textContent = post ? "Se borra para toda la comunidad, con su foto y sus comentarios. No se puede deshacer." : "Se borra para toda la comunidad. No se puede deshacer.";
  $("#dlgBorrarPost").showModal();
}

// ---------- registro ----------
export const rutas = [
  { patron: "e/muro", titulo: "Comunidad", vista: vMuro },
  { patron: "a/muro", titulo: "Comunidad", vista: vMuro },
];

export const acciones = {
  muroQuitarFoto: () => { soltarFoto(); errMuro(""); },
  muroVerTodos: (b) => { M.abiertos.add(b.dataset.id); repintar(b.dataset.id); },
  muroMas: async (b) => {
    const r = await ocupado(b, datos.listarPosts({ antesDe: M.posts[M.posts.length - 1].creadoEn }));
    const nuevos = r.posts.filter((p) => !postDe(p.id));
    M.posts.push(...nuevos);
    M.hayMas = r.hayMas;
    b.closest(".muro-mas").remove();
    $("#muroLista").insertAdjacentHTML("beforeend", nuevos.map(postHtml).join("") + masHtml());
  },
  muroOcultar: (b) => { const p = postDe(b.dataset.id); if (p) return ponerOculto("post", p, !!b.dataset.si, b); },
  muroOcultarCom: (b) => {
    const c = postDe(b.dataset.post)?.comentarios.find((x) => x.id === b.dataset.id);
    if (c) return ponerOculto("com", c, !!b.dataset.si, b);
  },
  muroBorrar: (b) => abrirBorrar({ tipo: "post", id: b.dataset.id }),
  muroBorrarCom: (b) => abrirBorrar({ tipo: "com", id: b.dataset.id, postId: b.dataset.post }),
};

export const envios = {
  muroForm: (f, btn) => {
    if (publicando) return;
    const t = $("#muroTexto"), texto = t.value.trim();
    if (!texto && !foto) { errMuro("Escribe algo o agrega una foto.", true); t.focus(); return; }
    errMuro("");
    publicando = true;
    return ocupado(btn, datos.publicarPost({ texto, foto }))
      .then((p) => {
        const lista = $("#muroLista");
        if (!M || !lista) return;
        M.posts.unshift(p);
        lista.querySelector(".empty")?.remove();
        lista.insertAdjacentHTML("afterbegin", postHtml(p));
        t.value = "";
        contar(t);
        soltarFoto();
        toast("Publicado en la comunidad.");
      })
      .catch((e) => errMuro(mensaje(e)))
      .finally(() => { publicando = false; });
  },
  muroComentar: (f, btn) => {
    const p = postDe(f.dataset.post), texto = f.elements.texto.value.trim();
    if (!p || !texto || f.dataset.enviando) return;
    f.dataset.enviando = "1";
    return ocupado(btn, datos.comentar(p.id, texto))
      .then((c) => {
        p.comentarios.push(c);
        repintar(p.id);
        document.querySelector(`[data-post="${p.id}"] .com-form input`)?.focus();
      })
      .catch((e) => { delete f.dataset.enviando; toast(mensaje(e)); });
  },
  borrarPostForm: async (f, btn) => {
    const b = borrando;
    if (!b) return;
    if (b.tipo === "post") {
      await ocupado(btn, datos.borrarPost(b.id));
      M.posts = M.posts.filter((p) => p.id !== b.id);
      repintar(b.id);
      toast("Publicación borrada.");
    } else {
      await ocupado(btn, datos.borrarComentario(b.id));
      const p = postDe(b.postId);
      if (p) p.comentarios = p.comentarios.filter((c) => c.id !== b.id);
      repintar(b.postId);
      toast("Comentario borrado.");
    }
    borrando = null;
    $("#dlgBorrarPost").close();
  },
};

export const entradas = {
  muroTexto: (t) => { contar(t); if (t.value.trim() && t.getAttribute("aria-invalid") === "true") errMuro(""); },
};

// La foto se revisa al elegirla: si el navegador no la puede abrir, se avisa antes de intentar subir nada.
export const cambios = {
  muroFoto: async (input) => {
    const f = input.files?.[0];
    input.value = ""; // permite volver a elegir la misma
    if (!f) return;
    soltarFoto();
    if (f.type && !f.type.startsWith("image/")) return errMuro("Elige una foto (JPG, PNG o WebP).");
    try { const bmp = await createImageBitmap(f); bmp.close?.(); } catch { return errMuro(datos.MSG_MURO.foto_ilegible); }
    const box = $("#muroPrevia");
    if (!box) return;
    foto = f;
    previa = URL.createObjectURL(f);
    box.querySelector("img").src = previa;
    box.hidden = false;
    errMuro("");
  },
};
