// Ajustes del equipo: la cuenta de Zoom, quién del equipo entra al panel y los datos de ejemplo.
import { $, $$, esc, ic, iniciales, plural, toast, fieldErr, ocupado, asegurarDialogo } from "./ui.js";
import * as datos from "./datos.js";
import { haceCuanto } from "./fechas.js";
import { tamano } from "./piezas.js";
import { resumenAlmacenamiento } from "./medios.js";
import { usuarioValido } from "./cedula.js";
import { nombre as normNombre } from "./normalizar.js";
import { estado, refrescar } from "./app.js";
import { cargar, invalidar, prepararDialogos, mostrarClave, conAviso, hayEjemplos, equipoJump } from "./vistas-admin.js";

let filaNueva = null;

export function limpiar() {
  filaNueva = null;
  for (const f of ["#equipoForm", "#borrarEjForm"]) $(f)?.reset();
}

const MSG_USUARIO = "El usuario lleva de 3 a 30 caracteres: letras sin tildes, números, punto, guion o guion bajo.";
// Lo que dice el aviso al volver de Zoom (el servidor devuelve a #a/ajustes?zoom=ok|error|cancelado).
const AVISO_ZOOM = {
  ok: "Zoom quedó conectado.",
  error: "No se pudo conectar Zoom. Intenta de nuevo.",
  cancelado: "Cancelaste la conexión con Zoom.",
};

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ---------- diálogos ----------
const DIALOGOS = {
  dlgEquipo: () => `<dialog id="dlgEquipo" aria-labelledby="eqTitulo">
  <form id="equipoForm" novalidate>
    <div class="dlg-body">
      <div class="dlg-head"><span class="dlg-ic info">${ic("user")}</span><h2 id="eqTitulo">Agregar persona del equipo</h2></div>
      <div class="field"><label class="label" for="eqNombres">Nombres y apellidos</label><input class="input" id="eqNombres" maxlength="80" autocomplete="off" aria-describedby="eqNombresErr"><p class="err" id="eqNombresErr" hidden></p></div>
      <div class="field"><label class="label" for="eqUsuario">Usuario</label><input class="input" id="eqUsuario" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Ej.: maria.perez" aria-describedby="eqUsuarioHint eqUsuarioErr"><p class="hint" id="eqUsuarioHint">Con este usuario entra al panel del equipo. Letras sin tildes, números, punto, guion o guion bajo.</p><p class="err" id="eqUsuarioErr" hidden></p></div>
      <p class="hint">Al crear la cuenta te mostramos su clave temporal para que se la envíes. La primera vez que entre le pediremos crear su propia clave.</p>
    </div>
    <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-act="cerrar">Cancelar</button><button class="btn btn-primary" type="submit">${ic("plus")}Crear cuenta</button></div>
  </form>
</dialog>`,
  dlgZoomOff: () => `<dialog id="dlgZoomOff" aria-labelledby="zoomOffTitulo">
  <form id="zoomOffForm" novalidate>
    <div class="dlg-body">
      <div class="dlg-head"><span class="dlg-ic">${ic("link")}</span><h2 id="zoomOffTitulo">¿Desconectar la cuenta de Zoom?</h2></div>
      <p>Dejarás de crear las reuniones desde el panel. Las clases que ya tienen su enlace siguen funcionando, y puedes volver a conectar la cuenta cuando quieras.</p>
    </div>
    <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-act="cerrar">Cancelar</button><button class="btn btn-danger" type="submit">Desconectar</button></div>
  </form>
</dialog>`,
  dlgBorrarEj: () => `<dialog id="dlgBorrarEj" aria-labelledby="borrarEjTitulo">
  <form id="borrarEjForm" novalidate>
    <div class="dlg-body">
      <div class="dlg-head"><span class="dlg-ic">${ic("trash")}</span><h2 id="borrarEjTitulo">¿Borrar los datos de ejemplo?</h2></div>
      <p>Se borran las personas, mentorías, clases, avisos y publicaciones de ejemplo. No se puede deshacer.</p>
      <div id="borrarEjAviso" class="aj-aviso"></div>
      <div class="field"><label class="label" for="borrarEjTexto">Para confirmar, escribe <b>BORRAR</b></label><input class="input" id="borrarEjTexto" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
    </div>
    <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-act="cerrar">Cancelar</button><button class="btn btn-danger" type="submit" disabled>${ic("trash")}Borrar ejemplos</button></div>
  </form>
</dialog>`,
};

function prepararAjustes() {
  prepararDialogos(); // clave temporal, suspender y clave nueva son los mismos de Emprendedores
  for (const [id, html] of Object.entries(DIALOGOS)) asegurarDialogo(id, html());
}

// ---------- secciones ----------
function zoomSeccion(z) {
  let linea, nota = "", botones = "";
  if (z.error) {
    linea = `${ic("alert")}<span>No se pudo consultar Zoom.</span>`;
    nota = "Revisa tu internet e intenta de nuevo.";
    botones = `<button type="button" class="btn btn-ghost" data-act="zoomreintentar">Intentar de nuevo</button>`;
  } else if (!z.configurada) {
    linea = `${ic("alert")}<span>Zoom todavía no está configurado en el servidor.</span>`;
    nota = "Avísale a quien administra el sitio: faltan las llaves de la app de Zoom (ZOOM_CLIENT_ID y ZOOM_CLIENT_SECRET). Mientras tanto, pega a mano el enlace de cada clase.";
  } else if (!z.conectada) {
    linea = `${ic("link")}<span><b>Sin conectar.</b> Conecta la cuenta de Zoom para crear las reuniones de las clases desde el panel.</span>`;
    nota = "Entra con la cuenta de Zoom de JUMP, la misma donde se creó la app. Con otra cuenta, Zoom no deja crear las reuniones.";
    botones = `<button type="button" class="btn btn-primary" data-act="zoomconectar">${ic("link")}Conectar Zoom</button>`;
  } else {
    const quien = z.email ? `<b>${esc(z.email)}</b>` : "la cuenta de JUMP";
    linea = `${ic("check")}<span>Conectada como ${quien}${z.nombre ? ` (${esc(z.nombre)})` : ""}${z.conectadaEn ? `, desde ${esc(haceCuanto(z.conectadaEn))}` : ""}.</span>`;
    nota = "Para usar otra cuenta, pulsa Cambiar cuenta: al volver de Zoom, la anterior se desconecta sola.";
    botones = `<button type="button" class="btn btn-ghost" data-act="zoomconectar">Cambiar cuenta</button><button type="button" class="btn btn-ghost btn-warn" data-act="zoomdesconectar">Desconectar</button>`;
  }
  return `<section class="panel aj" aria-labelledby="t-zoom">
    <header class="aj-head"><div><h2 id="t-zoom">Cuenta de Zoom</h2><p>Con ella el panel crea las reuniones de las clases en vivo.</p></div></header>
    <div class="aj-body">
      <p class="aj-estado${z.conectada ? " ok" : ""}" id="zoomEstado">${linea}</p>
      ${nota ? `<p class="hint">${esc(nota)}</p>` : ""}
      ${botones ? `<div class="aj-acciones">${botones}</div>` : ""}
    </div></section>`;
}

function filaPersona(m, yoId) {
  const propia = m.userId === yoId, susp = m.estado === "suspendida";
  const acciones = propia ? '<span class="tag">Tú</span>' : `
        <button type="button" class="btn btn-ghost btn-sm" data-act="clavenueva" data-id="${m.userId}">${ic("key")}<span class="lbl">Clave nueva</span><span class="vh"> para ${esc(m.nombres)}</span></button>
        ${susp
          ? `<button type="button" class="btn btn-ghost btn-sm btn-state" data-act="reactivar" data-id="${m.userId}">${ic("check")}Reactivar<span class="vh"> la cuenta de ${esc(m.nombres)}</span></button>`
          : `<button type="button" class="btn btn-ghost btn-sm btn-warn btn-state" data-act="suspender" data-id="${m.userId}">${ic("ban")}Suspender<span class="vh"> la cuenta de ${esc(m.nombres)}</span></button>`}`;
  return `<tr data-equipo="${m.userId}" class="${susp ? "is-susp" : ""} ${m.userId === filaNueva ? "is-new" : ""}">
      <td class="c-who"><div class="who"><span class="ava ava-team">${esc(iniciales(m.nombres))}</span><div><b>${esc(m.nombres)}${propia ? ' <span class="tag">Tú</span>' : ""}</b><span class="m-meta">${esc(m.usuario || "")}</span></div></div></td>
      <td data-l="Último ingreso">${m.ultimoIngreso ? esc(cap(haceCuanto(m.ultimoIngreso))) : '<span class="nunca">Nunca</span>'}</td>
      <td>${susp ? '<span class="pill pill-bad">Suspendida</span>' : '<span class="pill pill-ok">Activa</span>'}</td>
      <td class="c-act"><div class="row-actions">${propia ? "" : acciones}</div></td></tr>`;
}

function equipoSeccion() {
  // Quien está conectada primero; el resto, de la cuenta más vieja a la más nueva.
  const yoId = estado.yo?.userId;
  const lista = equipoJump().sort((x, y) => (y.userId === yoId) - (x.userId === yoId) || Date.parse(x.creadoEn) - Date.parse(y.creadoEn));
  return `<section class="panel aj aj-team" aria-labelledby="t-eq">
    <header class="aj-head"><div><h2 id="t-eq">Equipo de JUMP</h2><p>${plural(lista.length, "persona entra", "personas entran")} al panel con su usuario. Aquí creas sus cuentas, les das una clave nueva o las suspendes.</p></div>
      <button type="button" class="btn btn-ghost" data-act="equipoagregar">${ic("plus")}Agregar persona del equipo</button></header>
    <div class="table-wrap"><table class="rtable">
      <thead><tr><th>Persona</th><th>Último ingreso</th><th>Cuenta</th><th><span class="vh">Acciones</span></th></tr></thead>
      <tbody>${lista.map((m) => filaPersona(m, yoId)).join("")}</tbody></table></div>
  </section>`;
}

const LIMITE_TEXTO = "1 GB"; // = LIMITE_ALMACENAMIENTO de medios.js
const AVISO_ESPACIO = {
  ok: "",
  atencion: "Ya usaste buena parte del espacio gratis. Revisa el material que ya no se usa y bórralo desde la mentoría.",
  lleno: "Casi no queda espacio gratis. Borra material que ya no se use, o pasa a un plan de pago, antes de subir más archivos.",
};

function espacioSeccion(al) {
  const { porcentaje, nivel } = resumenAlmacenamiento(al.bytes);
  const aviso = AVISO_ESPACIO[nivel];
  const usado = al.bytes ? tamano(al.bytes) : "0 MB";
  return `<section class="panel aj" aria-labelledby="t-esp">
    <header class="aj-head"><div><h2 id="t-esp">Espacio del material</h2><p>Lo que ocupan los archivos que subes como material adicional. El plan gratis de Supabase da ${LIMITE_TEXTO} por proyecto.</p></div></header>
    <div class="aj-body">
      <p class="aj-estado${nivel === "ok" ? " ok" : ""}" id="espacioEstado">${ic(nivel === "ok" ? "check" : "alert")}<span><b>${usado}</b> de ${LIMITE_TEXTO} · ${plural(al.archivos, "archivo", "archivos")}</span></p>
      <div class="prog" role="img" aria-label="${porcentaje} % del espacio gratis usado"><div class="bar ${nivel}"><i style="width:${porcentaje}%"></i></div><span>${porcentaje} %</span></div>
      ${aviso ? `<p class="aj-aviso" id="espacioAviso">${aviso}</p>` : ""}
      <p class="hint">Las imágenes se reducen solas al subirlas, igual que las fotos del muro y las portadas. Los PDF y los archivos de Office se suben tal cual: si pesan mucho, comprímelos antes. Las fotos del muro no se cuentan aquí; el uso total lo ves en Supabase, en Usage.</p>
    </div></section>`;
}

function ejemplosSeccion() {
  const hay = hayEjemplos();
  return `<section class="panel aj" aria-labelledby="t-ej">
    <header class="aj-head"><div><h2 id="t-ej">Datos de ejemplo</h2><p>Personas, mentorías, clases y publicaciones de mentira para mostrar cómo se ve la plataforma antes de tener contenido real.</p></div></header>
    <div class="aj-body">
      <p class="aj-estado${hay ? " ok" : ""}" id="ejemplosEstado">${ic(hay ? "check" : "grid")}<span>${hay ? "<b>Cargados.</b> Se marcan con la etiqueta Ejemplo." : "<b>No hay</b> datos de ejemplo."}</span></p>
      <div class="aj-acciones">${hay
        ? `<button type="button" class="btn btn-ghost btn-warn" data-act="ejemplosborrar">${ic("trash")}Borrar datos de ejemplo</button>`
        : `<button type="button" class="btn btn-ghost" data-act="ejemploscargar">${ic("grid")}Cargar datos de ejemplo</button>`}</div>
    </div></section>`;
}

async function vAjustes({ query }) {
  const a = await cargar();
  const aviso = AVISO_ZOOM[query.get("zoom")];
  return {
    titulo: "Ajustes",
    html: `<div class="page-head"><div><h1>Ajustes</h1><p class="sub">La cuenta de Zoom, quién del equipo entra al panel, el espacio del material y los datos de ejemplo.</p></div></div>
      ${zoomSeccion(a.zoom)}${equipoSeccion()}${espacioSeccion(a.almacenamiento)}${ejemplosSeccion()}`,
    despues: () => {
      prepararAjustes();
      filaNueva = null;
      if (aviso) {
        history.replaceState(null, "", "#a/ajustes"); // sin esto, al refrescar volvería a salir el aviso
        toast(aviso);
      }
    },
  };
}

// ---------- acciones ----------
async function enviarEquipo(f, btn) {
  const u = $("#eqUsuario"), n = $("#eqNombres");
  const usuario = u.value.trim().toLowerCase(), nombres = normNombre(n.value);
  fieldErr(n, nombres ? "" : "Escribe nombre y apellido.");
  fieldErr(u, !usuario ? "Escribe el usuario." : !usuarioValido(usuario) ? MSG_USUARIO
    : equipoJump().some((m) => m.usuario === usuario) ? "Ya existe una cuenta con ese usuario." : "");
  const malo = f.querySelector('[aria-invalid="true"]');
  if (malo) return malo.focus();
  let r;
  try {
    r = await ocupado(btn, datos.crearAdmin({ usuario, nombres }));
  } catch (e) {
    const campo = { usuario: u, nombres: n }[e.campo];
    if (campo) { fieldErr(campo, e.mensaje); return campo.focus(); }
    throw e;
  }
  $("#dlgEquipo").close();
  f.reset();
  filaNueva = r.userId;
  invalidar();
  refrescar();
  mostrarClave({ rol: "admin", usuario, nombres }, r.clave, true);
}

async function enviarZoomOff(f, btn) {
  if (!(await conAviso($("#dlgZoomOff"), ocupado(btn, datos.zoomDesconectar())))) return;
  $("#dlgZoomOff").close();
  invalidar();
  refrescar();
  toast("Zoom se desconectó.");
}

async function enviarBorrarEj(f, btn) {
  if ($("#borrarEjTexto").value !== "BORRAR") return;
  if (!(await conAviso($("#dlgBorrarEj"), ocupado(btn, datos.ejemplosBorrar())))) return;
  $("#dlgBorrarEj").close();
  invalidar();
  refrescar();
  toast("Se borraron los datos de ejemplo.");
}

// Lo que se llevaría el borrado además de lo marcado como ejemplo: trabajo de personas reales ligado a los ejemplos.
function avisoReales(r = {}) {
  const l = [];
  if (r.comentarios) l.push(`${plural(r.comentarios, "comentario real hecho", "comentarios reales hechos")} sobre publicaciones de ejemplo`);
  if (r.publicaciones) l.push(`${plural(r.publicaciones, "publicación real", "publicaciones reales")} de cuentas de ejemplo`);
  if (r.progreso) l.push(`${plural(r.progreso, "avance real", "avances reales")} en módulos de ejemplo`);
  return l.length
    ? `<p><b>También se borrarán:</b></p><ul>${l.map((x) => `<li>${x}</li>`).join("")}</ul>`
    : "<p>No hay nada hecho por personas reales ligado a los ejemplos: nadie pierde lo que hizo.</p>";
}

// ---------- registro ----------
export const rutas = [{ patron: "a/ajustes", titulo: "Ajustes", vista: vAjustes }];

export const acciones = {
  zoomconectar: async (b) => {
    let r;
    try { r = await ocupado(b, datos.zoomIniciar()); }
    catch (e) {
      if (e instanceof datos.ErrorJump && (e.codigo === "servidor" || e.codigo === "invalido")) return toast(e.mensaje || "No se pudo abrir Zoom. Intenta de nuevo.");
      throw e;
    }
    location.assign(r.url);
  },
  zoomdesconectar: () => {
    prepararAjustes();
    $("#dlgZoomOff").showModal();
  },
  zoomreintentar: () => { invalidar(); refrescar(); },
  equipoagregar: () => {
    prepararAjustes();
    $("#equipoForm").reset();
    $$("#equipoForm [aria-invalid]").forEach((i) => fieldErr(i, ""));
    $("#dlgEquipo").showModal();
    $("#eqNombres").focus();
  },
  ejemploscargar: async (b) => {
    try { await ocupado(b, datos.ejemplosCargar()); }
    catch (e) {
      // Ya estaban cargados (otra persona del equipo los cargó): se muestra lo que hay.
      if (!(e instanceof datos.ErrorJump) || e.codigo !== "invalido") throw e;
      invalidar();
      refrescar();
      return toast(e.mensaje);
    }
    invalidar();
    refrescar();
    toast("Datos de ejemplo cargados.");
  },
  ejemplosborrar: async (b) => {
    const r = await ocupado(b, datos.ejemplosContar());
    prepararAjustes();
    $("#borrarEjForm").reset();
    $("#borrarEjForm [type=submit]").disabled = true;
    $("#borrarEjAviso").innerHTML = avisoReales(r.reales);
    $("#dlgBorrarEj").showModal();
    $("#borrarEjTexto").focus();
  },
};

export const envios = { equipoForm: enviarEquipo, zoomOffForm: enviarZoomOff, borrarEjForm: enviarBorrarEj };

export const entradas = {
  // El botón rojo se enciende solo con la palabra exacta (mayúsculas incluidas).
  borrarEjTexto: (el) => { $("#borrarEjForm [type=submit]").disabled = el.value !== "BORRAR"; },
};
