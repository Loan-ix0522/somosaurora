// Emprendedor: inicio, mentorías, aula, clases en vivo, avisos y perfil (mockup "El aula", con datos reales).
import { $, $$, esc, ic, fig, plural, toast, fieldErr, ocupado, hop, reduce } from "./ui.js";
import * as datos from "./datos.js";
import { rango, fechaCorta, haceCuanto, estadoClase } from "./fechas.js";
import { dateTile, whenText, nowPill, vacio, mMeta, TIPOS, tipoArchivo, tamano, dominio, ftype } from "./piezas.js";
import { embedVideo, icsDeClase } from "./medios.js";
import { whatsapp as normWhatsapp, texto as normTexto } from "./normalizar.js";
import { estado, ir, refrescar } from "./app.js";
import { errorClaveNueva } from "./vistas-ingreso.js";

// Lo cargado de la base. Se vuelve a pedir al entrar, al reintentar y al volver a la pestaña después de 5 min.
let D = null;
let filtro = "todas";
const RECARGA_MS = 5 * 60e3;

export function limpiar() { D = null; filtro = "todas"; }

async function cargar() {
  if (!D || D.yo.userId !== estado.yo?.userId) {
    D = await datos.cargarEmprendedor();
    estado.yo = { ...estado.yo, ...D.yo };
    contarAvisos();
  }
  return D;
}
const contarAvisos = () => { estado.avisosNuevos = D.avisos.filter((a) => !a.visto).length; };

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && D && Date.now() - D.cargadoEn > RECARGA_MS && location.hash.startsWith("#e/")) {
    D = null;
    refrescar();
  }
});

// ---------- ayudas ----------
const hechos = (m) => m.modulos.filter((x) => x.visto).length;
const siguiente = (m) => { const i = m.modulos.findIndex((x) => !x.visto); return i < 0 ? Math.max(m.modulos.length - 1, 0) : i; };
const mask = (c) => (c ? c.slice(0, 2) + "••••" + c.slice(-4) : "");
const primerNombre = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const esNueva = (m) => !!m.publicadaEn && Date.now() - Date.parse(m.publicadaEn) < 14 * 864e5;
const mentoriaDe = (id) => D.mentorias.find((m) => m.id === id);
const claseDe = (id) => D.clases.find((c) => c.id === id);
const materialDe = (id) => {
  for (const m of D.mentorias) {
    const x = m.materiales.find((f) => f.id === id) || m.modulos.flatMap((mod) => mod.materiales).find((f) => f.id === id);
    if (x) return x;
  }
  return null;
};
const proximas = () => D.clases.filter((c) => estadoClase(c) !== "terminada");
const pasadas = () => D.clases.filter((c) => estadoClase(c) === "terminada").reverse();

// La mentoría para "Sigue donde quedaste": la última que tocó a medias; si no hay, la primera sin empezar.
function retomar() {
  const ultimo = (m) => Math.max(0, ...m.modulos.map((x) => (x.vistoEn ? Date.parse(x.vistoEn) : 0)));
  const aMedias = D.mentorias.filter((m) => { const d = hechos(m); return d > 0 && d < m.modulos.length; });
  if (aMedias.length) return aMedias.sort((a, b) => ultimo(b) - ultimo(a))[0];
  return D.mentorias.find((m) => m.modulos.length && hechos(m) === 0) || null;
}

// Abre una pestaña dentro del toque y le pone la URL cuando llega (Safari bloquea ventanas abiertas después de esperar).
// Sin pestaña (bloqueada), se abre en esta misma.
async function abrirAparte(obtenerUrl) {
  const w = window.open("", "_blank");
  if (w) try { w.opener = null; } catch { /* algunos navegadores no lo dejan cambiar */ }
  try {
    const url = await obtenerUrl();
    if (w) w.location.replace(url); else location.assign(url);
  } catch (e) {
    w?.close();
    throw e;
  }
}

// ---------- piezas (del mockup) ----------
function prog(m, extra = "") {
  const d = hechos(m), n = m.modulos.length, p = n ? Math.round((d / n) * 100) : 0;
  return `<div class="prog ${extra}"><div class="bar ${n && d === n ? "done" : ""}"><i style="width:${p}%"></i></div><span>${d} de ${n}</span></div>`;
}
function mStatus(m) {
  const d = hechos(m);
  if (esNueva(m) && d === 0) return '<span class="pill pill-new">Nueva</span>';
  if (m.modulos.length && d === m.modulos.length) return '<span class="pill pill-white">Completada</span>';
  if (d > 0) return '<span class="pill pill-white">En curso</span>';
  return "";
}
const mCard = (m) => `<a class="m-card" href="#e/m/${m.id}">
    <div class="m-cover"><img src="${esc(m.portada)}" alt="" loading="lazy">${mStatus(m)}</div>
    <div class="m-body"><h3>${esc(m.titulo)}</h3><p class="m-meta">${mMeta(m)}</p>${prog(m)}</div></a>`;
const waitNote = `<span class="zoom-wait">${ic("lock")}El enlace de Zoom se abre 15 min antes</span>`;
const goingBtn = (c, cls) =>
  `<button type="button" class="btn ${cls}" data-act="asistire" data-id="${c.id}" aria-pressed="${c.asistire}">${c.asistire ? ic("check") + "Asistiré" : "Confirmar asistencia"}</button>`;
const zoomBtn = (c, cls = "") => `<button type="button" class="btn btn-sun ${cls}" data-act="zoom" data-id="${c.id}">${ic("video")}Entrar a Zoom</button>`;
const calBtn = (c, cls, texto) => `<button type="button" class="btn ${cls}" data-act="calendario" data-id="${c.id}">${ic("calendar")}${texto}</button>`;
const abierta = (c) => { const s = estadoClase(c); return s === "abre-pronto" || s === "en-vivo"; };

function liveCard(c) {
  const m = c.mentoriaId && mentoriaDe(c.mentoriaId), vivo = estadoClase(c) === "en-vivo", abre = abierta(c);
  return `<article class="live on-dark">${fig("live-deco")}
    <div class="live-top">${dateTile(c, vivo ? "now" : "on-navy")}<div>${vivo ? nowPill : ""}<h3>${esc(c.titulo)}</h3><p class="live-meta">${ic("clock")}<span>${whenText(c)}</span></p></div></div>
    <p class="live-meta">${ic("video")}<span>Por Zoom${m ? ` · de la mentoría “${esc(m.titulo)}”` : ""}</span></p>
    <div class="live-actions">${abre ? zoomBtn(c) : calBtn(c, "btn-white", "Agregar a mi calendario")}${goingBtn(c, "btn-dark")}</div>
    ${abre ? "" : waitNote}
  </article>`;
}

function avisoItem(a) {
  let embed = "", etiqueta = "Aviso";
  if (a.tipo === "invitacion") {
    const c = a.claseId && claseDe(a.claseId);
    etiqueta = "Invitación a clase en vivo";
    if (c) embed = `<div class="embed">${dateTile(c, estadoClase(c) === "en-vivo" ? "now" : "")}<div class="grow"><b>${esc(c.titulo)}</b><span class="m-meta">${whenText(c)} · Zoom</span></div>
      ${abierta(c) ? zoomBtn(c, "btn-sm") : `<a class="btn btn-ghost btn-sm" href="#e/clases">Ver clase</a>`}</div>`;
  } else if (a.tipo === "mentoria") {
    const m = a.mentoriaId && mentoriaDe(a.mentoriaId);
    etiqueta = "Mentoría nueva";
    if (m) embed = `<div class="embed"><img src="${esc(m.portada)}" alt=""><div class="grow"><b>${esc(m.titulo)}</b><span class="m-meta">${mMeta(m)}</span></div><a class="btn btn-ghost btn-sm" href="#e/m/${m.id}">Ver</a></div>`;
  }
  return `<article class="panel aviso">
    <div class="av-head"><span class="av-ava">${fig()}</span><div><b>Equipo JUMP</b><span class="m-meta">${esc(cap(haceCuanto(a.creadoEn)))} · ${etiqueta}</span></div></div>
    <p class="av-text">${esc(a.texto)}</p>${embed}
  </article>`;
}

function fileRow(f) {
  const k = tipoArchivo(f), enPestana = k === "pdf" || k === "img";
  const meta = f.tipo === "enlace" ? dominio(f.url) : [TIPOS[k], tamano(f.bytes)].filter(Boolean).join(" · ");
  const boton = f.tipo === "enlace"
    ? `<a class="btn btn-ghost btn-sm" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${ic("link")}Abrir</a>`
    : `<button type="button" class="btn btn-ghost btn-sm" data-act="material" data-id="${f.id}">${ic(enPestana ? "eye" : "download")}${enPestana ? "Abrir" : "Descargar"}</button>`;
  return `<li class="file">${ftype(f)}<div class="grow"><b>${esc(f.nombre)}</b><span class="m-meta">${esc(meta)}</span></div>${boton}</li>`;
}
const listaArchivos = (titulo, lista) =>
  lista.length ? `<div class="files"><section><h2>${titulo}</h2><ul class="file-list">${lista.map(fileRow).join("")}</ul></section></div>` : "";

// ---------- vistas ----------
async function vInicio() {
  await cargar();
  const yo = estado.yo, c = proximas()[0], r = retomar();
  const frases = [];
  if (c && estadoClase(c) === "en-vivo") frases.push("tu clase en vivo ya empezó");
  else if (c && Date.parse(c.iniciaEn) - Date.now() < 7 * 864e5) frases.push("tienes una clase en vivo esta semana");
  if (r && hechos(r) > 0) { const f = r.modulos.length - hechos(r); frases.push(`te ${f === 1 ? "falta 1 módulo" : `faltan ${f} módulos`} de “${esc(r.titulo)}”`); }
  const sub = frases.length ? cap(frases.join(" y ")) + "." : "Aquí tienes tus mentorías, tus clases en vivo y los avisos del equipo.";

  let seguir;
  if (r) {
    const i = siguiente(r), mod = r.modulos[i], empezada = hechos(r) > 0;
    seguir = `<a class="panel resume" href="#e/m/${r.id}/${i + 1}"><img src="${esc(r.portada)}" alt="">
      <div class="resume-body"><h3>${esc(r.titulo)}</h3><p class="m-meta resume-cur"><span class="mk cur">${fig()}</span><span>Módulo ${i + 1} de ${r.modulos.length} · ${esc(mod.titulo)}</span></p>${prog(r)}
      <span class="btn btn-primary">${ic("play")}${empezada ? "Seguir viendo" : "Empezar"}</span></div></a>`;
  } else seguir = vacio(D.mentorias.length ? "Terminaste todo" : "Pronto habrá mentorías", D.mentorias.length ? "Cuando el equipo publique una mentoría nueva, aparecerá aquí." : "El equipo de JUMP está preparando las primeras mentorías. Te llegará un aviso.");

  return {
    titulo: "Inicio",
    html: `<div class="page-head"><div><h1>Hola, ${esc(primerNombre(yo.nombres))}</h1><p class="sub">${sub}</p></div></div>
    <div class="home-top">
      <section aria-labelledby="t-cont"><h2 class="sec-title" id="t-cont">${r && hechos(r) === 0 ? "Empieza por aquí" : "Sigue donde quedaste"}</h2>${seguir}</section>
      <section aria-labelledby="t-live"><h2 class="sec-title" id="t-live">Próxima clase en vivo</h2>${c ? liveCard(c) : vacio("No hay clases programadas", "Cuando el equipo programe una, la invitación te llega aquí y en Avisos.")}</section>
    </div>
    <section class="block" aria-labelledby="t-ment"><div class="sec-head"><h2 id="t-ment">Mentorías</h2><a class="btn-link" href="#e/mentorias">Ver todas${ic("arrow")}</a></div>
      ${D.mentorias.length ? `<div class="m-grid">${D.mentorias.slice(0, 4).map(mCard).join("")}</div>` : vacio("Todavía no hay mentorías", "Cuando el equipo publique la primera, aparecerá aquí.")}</section>
    <section class="block" aria-labelledby="t-avi"><div class="sec-head"><h2 id="t-avi">Avisos de la comunidad</h2><a class="btn-link" href="#e/avisos">Ver todos${ic("arrow")}</a></div>
      ${D.avisos.length ? D.avisos.slice(0, 2).map(avisoItem).join("") : vacio("Sin avisos por ahora", "Lo que comparta el equipo de JUMP aparecerá aquí.")}</section>`,
  };
}

async function vMentorias() {
  await cargar();
  const f = filtro, lista = D.mentorias.filter((m) => {
    const d = hechos(m), n = m.modulos.length;
    return f === "todas" || (f === "curso" && d > 0 && d < n) || (f === "nuevas" && d === 0) || (f === "hechas" && n > 0 && d === n);
  });
  const opciones = [["todas", "Todas"], ["curso", "En curso"], ["nuevas", "Sin empezar"], ["hechas", "Completadas"]];
  const vacios = {
    todas: ["Todavía no hay mentorías", "Cuando el equipo publique la primera, aparecerá aquí y te llegará un aviso."],
    curso: ["Nada a medias", "Cuando empieces una mentoría, la vas a encontrar aquí para seguir donde quedaste."],
    nuevas: ["Ya empezaste todas", "Cuando el equipo publique una mentoría nueva, aparecerá aquí y te llegará un aviso."],
    hechas: ["Todavía ninguna completa", "Cuando termines todos los módulos de una mentoría, aparecerá aquí."],
  }[f];
  return {
    titulo: "Mentorías",
    html: `<div class="page-head"><div><h1>Mentorías</h1><p class="sub">Todas las mentorías que publica el equipo de JUMP. Cada una tiene módulos en video, clases en vivo y material para descargar.</p></div></div>
    <div class="seg filters" role="group" aria-label="Filtrar mentorías">${opciones.map(([k, l]) => `<button type="button" data-act="mfiltro" data-f="${k}" aria-pressed="${f === k}">${l}</button>`).join("")}</div>
    ${lista.length ? `<div class="m-grid">${lista.map(mCard).join("")}</div>` : vacio(vacios[0], vacios[1])}`,
  };
}

function reproductor(src, titulo, fondo) {
  const emb = embedVideo(src);
  if (!emb) return `<a class="btn btn-sun" href="${esc(src)}" target="_blank" rel="noopener noreferrer">${ic("play")}Abrir el video</a>`;
  return `${fondo ? `<img src="${esc(fondo)}" alt="">` : ""}<button type="button" class="play" data-act="reproducir" data-src="${esc(emb)}" data-t="${esc(titulo)}" aria-label="Reproducir el video"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg></button>`;
}

function playerVivo(mod) {
  const c = mod.claseId && claseDe(mod.claseId);
  const caja = (dentro) => `<div class="player is-live on-dark">${fig("live-deco")}<div class="pl-live">${dentro}</div></div>`;
  if (!c) return caja(`<h2>Clase en vivo por Zoom</h2><p>La fecha de esta clase se anuncia pronto.</p>`);
  const st = estadoClase(c);
  if (st === "terminada") {
    if (c.grabacionUrl) {
      const emb = embedVideo(c.grabacionUrl);
      return emb
        ? `<div class="player"><button type="button" class="play" data-act="reproducir" data-src="${esc(emb)}" data-t="${esc(c.titulo)}" aria-label="Ver la grabación"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg></button></div>`
        : caja(`<h2>Grabación de la clase</h2><div class="live-actions"><a class="btn btn-white" href="${esc(c.grabacionUrl)}" target="_blank" rel="noopener noreferrer">${ic("play")}Ver la grabación</a></div>`);
    }
    return caja(`${dateTile(c, "on-navy")}<h2>Clase en vivo por Zoom</h2><p>${whenText(c)}</p><p class="hint">La grabación de esta clase todavía no se ha subido.</p>`);
  }
  const vivo = st === "en-vivo";
  return caja(`${dateTile(c, vivo ? "now" : "on-navy")}${vivo ? nowPill : ""}<h2>Clase en vivo por Zoom</h2><p>${whenText(c)}</p>
    ${abierta(c) ? `<div class="live-actions">${zoomBtn(c)}</div>` : `<div class="live-actions">${calBtn(c, "btn-white", "Agregar a mi calendario")}</div>${waitNote}
    <p class="hint">Después de la clase, la grabación aparecerá aquí.</p>`}`);
}

async function vAula({ partes: p }) {
  await cargar();
  const m = mentoriaDe(p[2]);
  if (!m) return { titulo: "Mentoría no encontrada", html: vacio("No encontramos esta mentoría", "Puede que el equipo la haya retirado.", `<a class="btn btn-primary" href="#e/mentorias">Ver mentorías</a>`) };
  const crumbs = `<nav class="crumbs" aria-label="Ruta"><a href="#e/mentorias">Mentorías</a>${ic("right")}<span>${esc(m.titulo)}</span></nav>`;
  if (!m.modulos.length) return { titulo: m.titulo, html: crumbs + vacio("Esta mentoría todavía no tiene módulos", "El equipo los está preparando.") };
  const n = m.modulos.length, vi = Math.min(Math.max((+p[3] || siguiente(m) + 1) - 1, 0), n - 1), mod = m.modulos[vi];
  const actual = siguiente(m), todo = hechos(m) === n, ultimo = vi === n - 1;
  let player;
  if (mod.tipo === "vivo") player = playerVivo(mod);
  else if (!mod.videoUrl) player = `<div class="player is-live on-dark">${fig("live-deco")}<div class="pl-live"><h2>Video pendiente: el equipo lo sube pronto</h2><p>Mientras tanto, revisa el material de este módulo.</p></div></div>`;
  else player = embedVideo(mod.videoUrl) ? `<div class="player">${reproductor(mod.videoUrl, mod.titulo, m.portada)}</div>`
    : `<div class="player is-live on-dark"><div class="pl-live"><h2>${esc(mod.titulo)}</h2><div class="live-actions">${reproductor(mod.videoUrl, mod.titulo)}</div></div></div>`;
  const metaMod = (x) => (x.tipo === "vivo" ? "Clase en vivo" : x.duracionMin ? `Video · ${x.duracionMin} min` : "Video");
  const metaPaso = (x) => {
    if (x.tipo !== "vivo") return `${ic("play")}${x.duracionMin ? `Video · ${x.duracionMin} min` : "Video"}`;
    const c = x.claseId && claseDe(x.claseId);
    return `${ic("video")}En vivo${c ? ` · ${esc(fechaCorta(c.iniciaEn))}` : ""}`;
  };
  return {
    titulo: m.titulo,
    html: `${crumbs}
    <div class="aula">
      <div class="aula-main">
        ${player}
        <div class="lesson-head"><div><h1>${esc(mod.titulo)}</h1><p class="m-meta">Módulo ${vi + 1} de ${n} · ${metaMod(mod)}</p></div>
          <div class="lesson-actions">
            ${mod.visto ? `<button type="button" class="btn btn-ghost" disabled>${ic("check")}Visto</button>` : `<button type="button" class="btn btn-primary" data-act="visto" data-id="${m.id}" data-i="${vi}">${ic("check")}Marcar como visto</button>`}
            ${ultimo ? "" : `<button type="button" class="btn btn-ghost" data-act="modulo" data-h="e/m/${m.id}/${vi + 2}">Siguiente${ic("arrow")}</button>`}
          </div></div>
        ${mod.descripcion ? `<p class="lesson-desc">${esc(mod.descripcion)}</p>` : ""}
        ${listaArchivos("Material de este módulo", mod.materiales)}
        ${todo ? `<div class="done-note">${fig()}<span>¡Terminaste esta mentoría! Diste el salto en ${plural(n, "módulo", "módulos")}.</span></div>` : ""}
      </div>
      ${listaArchivos("Material de la mentoría", m.materiales)}
      <aside class="panel rail" aria-labelledby="t-rail">
        <div class="rail-head"><h2 id="t-rail">${esc(m.titulo)}</h2>${m.mentor ? `<p class="m-meta">Con ${esc(m.mentor)}</p>` : ""}${prog(m)}</div>
        <ol class="steps" id="steps">${m.modulos.map((x, k) => {
          const st = x.visto ? "done" : k === actual && !todo ? "cur" : "";
          const mk = x.visto ? ic("check") : st === "cur" ? fig() : k + 1;
          return `<li><button type="button" class="step-btn" data-act="modulo" data-h="e/m/${m.id}/${k + 1}" ${k === vi ? 'aria-current="step"' : ""}>
            <span class="mk ${st}" data-mk="${k}">${mk}</span>
            <span><b>${esc(x.titulo)}</b><span class="m-meta">${metaPaso(x)}${x.visto ? '<span class="vh"> · visto</span>' : ""}</span></span></button></li>`;
        }).join("")}</ol>
      </aside>
    </div>`,
  };
}

async function vClases() {
  await cargar();
  const prox = proximas(), pas = pasadas().slice(0, 12);
  const fila = (c) => {
    const m = c.mentoriaId && mentoriaDe(c.mentoriaId), vivo = estadoClase(c) === "en-vivo";
    return `<article class="panel class-row">${dateTile(c, vivo ? "now" : "")}
      <div class="grow">${vivo ? `<span>${nowPill}</span>` : ""}<b>${esc(c.titulo)}</b><span class="m-meta">${ic("clock")}${rango(c.iniciaEn, c.duracionMin)}${m ? ` · <a href="#e/m/${m.id}">${esc(m.titulo)}</a>` : ""}</span>
        ${c.mensaje ? `<span class="m-meta">${esc(c.mensaje)}</span>` : ""}${abierta(c) ? "" : waitNote}</div>
      <div class="class-actions">${goingBtn(c, "btn-ghost btn-sm")}${abierta(c) ? zoomBtn(c, "btn-sm") : calBtn(c, "btn-ghost btn-sm", "Agregar al calendario")}</div></article>`;
  };
  const filaPasada = (c) => `<article class="panel class-row">${dateTile(c)}<div class="grow"><b>${esc(c.titulo)}</b><span class="m-meta">${c.grabacionUrl ? "Grabación disponible" : "La grabación se sube en unos días"}</span></div>
      <div class="class-actions">${c.grabacionUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(c.grabacionUrl)}" target="_blank" rel="noopener noreferrer">${ic("play")}Ver grabación</a>` : ""}</div></article>`;
  return {
    titulo: "Clases en vivo",
    html: `<div class="page-head"><div><h1>Clases en vivo</h1><p class="sub">Las invitaciones del equipo de JUMP llegan aquí. Todas las clases son por Zoom.</p></div></div>
    <section aria-labelledby="t-prox"><h2 class="sec-title" id="t-prox">Próximas</h2>
      ${prox.length ? `<div class="class-list">${prox.map(fila).join("")}</div>` : vacio("No hay clases programadas", "Cuando el equipo programe una, la invitación te llega aquí y en Avisos.")}</section>
    ${pas.length ? `<section class="block" aria-labelledby="t-pas"><h2 class="sec-title" id="t-pas">Pasadas</h2><div class="class-list">${pas.map(filaPasada).join("")}</div></section>` : ""}`,
  };
}

async function vAvisos() {
  await cargar();
  return {
    titulo: "Avisos",
    html: `<div class="page-head"><div><h1>Avisos</h1><p class="sub">Lo que el equipo de JUMP comparte con toda la comunidad: invitaciones, mentorías nuevas y recordatorios.</p></div></div>
    ${D.avisos.length ? D.avisos.map(avisoItem).join("") : vacio("Sin avisos por ahora", "Lo que comparta el equipo de JUMP aparecerá aquí.")}`,
    // Al abrir la vista quedan vistos; si falla, se reintenta la próxima vez.
    despues: () => {
      const nuevos = D.avisos.filter((a) => !a.visto).map((a) => a.id);
      if (!nuevos.length) return;
      datos.marcarAvisosVistos(nuevos).then(() => {
        for (const a of D.avisos) if (nuevos.includes(a.id)) a.visto = true;
        contarAvisos();
        $$(".nav-badge, .tabbar .dot").forEach((x) => x.remove());
      }).catch(() => {});
    },
  };
}

async function vPerfil() {
  await cargar();
  const yo = estado.yo;
  return {
    titulo: "Mi perfil",
    html: `<div class="page-head"><div><h1>Mi perfil</h1><p class="sub">Tus datos en la Comunidad JUMP.</p></div></div>
    <div class="profile">
      <form class="panel" id="perfilForm" novalidate aria-labelledby="t-datos"><h2 id="t-datos">Tus datos</h2>
        <div class="readonly"><span>Nombre</span><b>${esc(yo.nombres)}</b></div>
        <div class="readonly"><span>Cédula (tu usuario)</span><b id="pfCedula">${esc(mask(yo.cedula))}</b></div>
        <div class="field"><label class="label" for="pfNegocio">Nombre del negocio</label>
          <input class="input" id="pfNegocio" maxlength="80" autocomplete="organization" value="${esc(yo.negocio || "")}" aria-describedby="pfNegocioErr"><p class="err" id="pfNegocioErr" hidden></p></div>
        <div class="field"><label class="label" for="pfWa">WhatsApp</label>
          <input class="input" id="pfWa" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="0991234567" value="${esc(yo.whatsapp || "")}" aria-describedby="pfWaErr"><p class="err" id="pfWaErr" hidden></p></div>
        <p class="hint">Para cambiar tu nombre o tu cédula, escríbele al equipo de JUMP.</p>
        <button class="btn btn-primary" type="submit" style="justify-self:start">Guardar cambios</button></form>
      <form class="panel" id="passForm" novalidate aria-labelledby="t-clave"><h2 id="t-clave">Cambiar clave</h2>
        <div class="field"><label class="label" for="pcActual">Clave actual</label>
          <input class="input" id="pcActual" type="password" maxlength="72" autocomplete="current-password" aria-describedby="pcActualErr"><p class="err" id="pcActualErr" hidden></p></div>
        <div class="field"><label class="label" for="pcNueva">Clave nueva</label>
          <input class="input" id="pcNueva" type="password" maxlength="72" autocomplete="new-password" aria-describedby="h-np pcNuevaErr"><p class="hint" id="h-np">Al menos 8 caracteres y un número.</p><p class="err" id="pcNuevaErr" hidden></p></div>
        <div class="field"><label class="label" for="pcRepite">Repite la clave nueva</label>
          <input class="input" id="pcRepite" type="password" maxlength="72" autocomplete="new-password" aria-describedby="pcRepiteErr"><p class="err" id="pcRepiteErr" hidden></p></div>
        <button class="btn btn-primary" type="submit" style="justify-self:start">Cambiar clave</button></form>
    </div>`,
  };
}

// ---------- registro ----------
const AULA = /^e\/m\/[0-9a-f-]{36}(\/\d{1,3})?$/;
export const rutas = [
  { patron: "e/inicio", titulo: "Inicio", vista: vInicio },
  { patron: "e/mentorias", titulo: "Mentorías", vista: vMentorias },
  { patron: AULA, activo: "e/mentorias", titulo: "Mentoría", vista: vAula },
  { patron: "e/clases", titulo: "Clases en vivo", vista: vClases },
  { patron: "e/avisos", titulo: "Avisos", vista: vAvisos },
  { patron: "e/perfil", titulo: "Mi perfil", vista: vPerfil },
];

const MSG_ZOOM = {
  fuera_de_ventana: "La clase todavía no abre: el enlace de Zoom se activa 15 min antes.",
  sin_enlace: "El equipo todavía no pone el enlace de Zoom. Intenta de nuevo en unos minutos.",
  no_encontrada: "Esta clase ya no está disponible.",
};

export const acciones = {
  mfiltro: (b) => { filtro = b.dataset.f; refrescar(); },
  modulo: (b) => ir(b.dataset.h),
  visto: async (b) => {
    const m = mentoriaDe(b.dataset.id), i = +b.dataset.i, mod = m?.modulos[i];
    if (!mod || mod.visto) return;
    const eraActual = i === siguiente(m);
    await ocupado(b, datos.marcarVisto(mod.id));
    mod.visto = true;
    mod.vistoEn = new Date().toISOString();
    b.disabled = true;
    const desde = $(`[data-mk="${i}"]`);
    if (desde) { desde.className = "mk done just"; desde.innerHTML = ic("check"); }
    const ni = m.modulos.findIndex((x) => !x.visto);
    const hasta = ni >= 0 ? $(`[data-mk="${ni}"]`) : null;
    const fin = () => {
      if (ni < 0) { refrescar(); toast("¡Terminaste la mentoría!"); }
      else if (i < m.modulos.length - 1) ir(`e/m/${m.id}/${i + 2}`);
      else refrescar();
    };
    if (eraActual && desde && hasta) hop(desde, hasta, fin); else setTimeout(fin, reduce ? 0 : 320);
  },
  reproducir: (b) => {
    const p = b.closest(".player"), src = b.dataset.src;
    p.className = "player is-playing";
    p.innerHTML = `<iframe src="${esc(src + (src.includes("?") ? "&" : "?") + "autoplay=1")}" title="${esc(b.dataset.t || "Video")}"
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    p.querySelector("iframe").focus();
  },
  material: (b) => {
    const f = materialDe(b.dataset.id);
    if (!f) return;
    abrirAparte(() => ocupado(b, datos.enlaceMaterial(f)))
      .catch((e) => toast(e.codigo === "red" ? "No se pudo conectar. Revisa tu internet." : "No se pudo abrir el archivo. Intenta de nuevo."));
  },
  zoom: (b) => {
    const c = claseDe(b.dataset.id);
    abrirAparte(() => ocupado(b, datos.entrarClase(b.dataset.id)))
      .then(() => { if (c) c.entro = true; })
      .catch((e) => toast(MSG_ZOOM[e.codigo] || (e.codigo === "red" ? "No se pudo conectar. Revisa tu internet." : "No se pudo abrir Zoom. Intenta de nuevo.")));
  },
  calendario: (b) => {
    const c = claseDe(b.dataset.id);
    if (!c) return;
    const blob = new Blob([icsDeClase({ id: c.id, titulo: c.titulo, iniciaEn: c.iniciaEn, duracionMin: c.duracionMin })], { type: "text/calendar;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "clase-jump.ics" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast("Abre el archivo descargado para agregar la clase a tu calendario");
  },
  asistire: async (b) => {
    const c = claseDe(b.dataset.id);
    if (!c) return;
    const si = !c.asistire;
    await ocupado(b, datos.confirmarAsistencia(c.id, si));
    c.asistire = si;
    refrescar();
    toast(si ? "Listo, le avisamos al equipo que vas a asistir" : "Quitaste tu confirmación");
  },
};

async function guardarPerfil(f, btn) {
  const neg = $("#pfNegocio"), wa = $("#pfWa");
  const negocio = normTexto(neg.value, 80).replace(/\s+/g, " ");
  const crudo = wa.value.trim(), numero = crudo ? normWhatsapp(crudo) : "";
  fieldErr(neg, negocio ? "" : "Escribe el nombre de tu negocio.");
  fieldErr(wa, crudo && !numero ? "Escribe un celular de Ecuador, por ejemplo 0991234567." : "");
  const malo = f.querySelector('[aria-invalid="true"]');
  if (malo) return malo.focus();
  try {
    await ocupado(btn, datos.actualizarPerfil({ negocio, whatsapp: numero }));
  } catch (e) {
    if (e.campo === "negocio") { fieldErr(neg, e.mensaje); return neg.focus(); }
    if (e.campo === "whatsapp") { fieldErr(wa, e.mensaje); return wa.focus(); }
    throw e;
  }
  estado.yo = { ...estado.yo, negocio, whatsapp: numero || null };
  if (D) D.yo = estado.yo;
  neg.value = negocio;
  wa.value = numero;
  toast("Tus datos quedaron guardados");
}

async function cambiarClave(f, btn) {
  const actual = $("#pcActual"), nueva = $("#pcNueva"), repite = $("#pcRepite");
  fieldErr(actual, actual.value ? "" : "Escribe tu clave actual.");
  const mn = errorClaveNueva(nueva.value);
  fieldErr(nueva, mn);
  fieldErr(repite, !mn && repite.value !== nueva.value ? "Las dos claves no son iguales." : "");
  const malo = f.querySelector('[aria-invalid="true"]');
  if (malo) return malo.focus();
  try {
    await ocupado(btn, datos.cambiarClave({ actual: actual.value, nueva: nueva.value }));
  } catch (e) {
    if (e.campo === "actual") { fieldErr(actual, e.mensaje); return actual.focus(); }
    if (e.campo === "nueva") { fieldErr(nueva, e.mensaje); return nueva.focus(); }
    throw e;
  }
  f.reset();
  toast("Tu clave quedó cambiada");
}

export const envios = { perfilForm: guardarPerfil, passForm: cambiarClave };
