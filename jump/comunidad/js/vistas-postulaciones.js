// Equipo JUMP: las postulaciones que llegan desde el formulario «Postula» de la página de JUMP (/jump/).
import { $, $$, esc, ic, fig, iniciales, toast, ocupado, asegurarDialogo } from "./ui.js";
import * as datos from "./datos.js";
import { haceCuanto } from "./fechas.js";
import { vacio } from "./piezas.js";
import { estado, refrescar } from "./app.js";
import { cargar, abrirAgregar } from "./vistas-admin.js";

// La lista se vuelve a pedir al entrar si tiene más de 30 s (llegan desde afuera, sin aviso).
let P = null;
let filtro = "nueva", buscar = "", objetivo = null;
const RECARGA_MS = 30e3;

export function limpiar() {
  P = null; filtro = "nueva"; buscar = ""; objetivo = null;
  $("#borrarPostuForm")?.reset();
}

const ESTADOS = { nueva: ["Nueva", "pill-new"], contactada: ["Contactada", "pill-ok"], descartada: ["Descartada", "pill-draft"] };
const FILTROS = [["nueva", "Nuevas"], ["contactada", "Contactadas"], ["descartada", "Descartadas"], ["todas", "Todas"]];
const RUC = { si: "Tiene RUC", no: "Sin RUC", tramite: "RUC en trámite" };
const AVISO = {
  nueva: (n) => `La postulación de ${n} volvió a Nuevas`,
  contactada: (n) => `Postulación de ${n} marcada como contactada`,
  descartada: (n) => `Postulación de ${n} descartada`,
};
const primerNombre = (n) => String(n || "").trim().split(/\s+/)[0] || "";
const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const telefono = (w) => `${w.slice(0, 3)} ${w.slice(3, 6)} ${w.slice(6)}`;
const de = (id) => P?.lista.find((p) => p.id === id);
const contarNuevas = () => { estado.postulacionesNuevas = P.lista.filter((p) => p.estado === "nueva").length; };

const DLG = () => `<dialog id="dlgBorrarPostu" aria-labelledby="borrarPostuTitulo">
  <form id="borrarPostuForm" novalidate>
    <div class="dlg-body">
      <div class="dlg-head"><span class="dlg-ic">${ic("trash")}</span><h2 id="borrarPostuTitulo">¿Borrar la postulación de <span id="borrarPostuNombre"></span>?</h2></div>
      <p>Sus datos se borran para siempre y no se puede deshacer. Hazlo si la persona pidió que borren sus datos o si la postulación es de prueba.</p>
    </div>
    <div class="dlg-foot"><button type="button" class="btn btn-ghost" data-act="cerrar">Cancelar</button><button class="btn btn-danger" type="submit">${ic("trash")}Borrar</button></div>
  </form>
</dialog>`;

// ---------- tabla ----------
function filaP(p) {
  const [etiqueta, clase] = ESTADOS[p.estado] || ESTADOS.nueva;
  const n = esc(p.nombres), cuenta = P.conCuenta.has(p.whatsapp);
  const msg = `Hola ${primerNombre(p.nombres)}, te escribimos del equipo de JUMP por tu postulación de «${p.negocio}».`;
  const boton = (act, icono, txt, cls = "", lbl = "lbl") =>
    `<button type="button" class="btn btn-ghost btn-sm ${cls}" data-act="${act}" data-id="${p.id}" title="${txt}">${ic(icono)}<span class="${lbl}">${txt}</span><span class="vh">, ${n}</span></button>`;
  // Descartar es secundario: solo ícono en la tabla ancha y con su nombre en las fichas del celular.
  const descartar = boton("pdescartar", "ban", "Descartar", "btn-warn", "lbl lbl-ficha");
  const acciones = p.estado === "nueva"
    ? boton("pcontactada", "check", "Marcar contactada") + descartar
    : p.estado === "contactada"
      ? (cuenta ? "" : boton("pcuenta", "plus", "Crear cuenta")) + descartar
      : boton("pnueva", "mail", "Volver a nuevas");
  return `<tr data-post="${p.id}">
      <td class="c-who"><div class="who"><span class="ava">${esc(iniciales(p.nombres))}</span><div><b>${n}</b><span class="m-meta">${esc(p.negocio)} · ${esc(p.rubro)}</span></div></div></td>
      <td data-l="WhatsApp"><a class="btn-link tel" href="https://wa.me/593${p.whatsapp.slice(1)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener"><span class="vh">Escribir por WhatsApp a ${n}: </span>${esc(telefono(p.whatsapp))}</a></td>
      <td data-l="Sector">${esc(p.sector)}<span class="m-meta" style="display:block">${RUC[p.ruc] || ""}</span></td>
      <td><span class="pill ${clase}">${etiqueta}</span>${cuenta ? ' <span class="tag">Tiene cuenta</span>' : ""}<span class="m-meta post-llego">Llegó ${esc(haceCuanto(p.creadoEn))}</span></td>
      <td class="c-act"><div class="row-actions">${acciones}
        <button type="button" class="btn btn-ghost btn-sm btn-warn" data-act="pborrar" data-id="${p.id}" title="Borrar">${ic("trash")}<span class="vh">Borrar la postulación de ${n}</span></button></div></td></tr>`;
}

function tabla() {
  const q = sinTildes(buscar.trim()), qd = q.replace(/\D/g, "");
  const delFiltro = P.lista.filter((p) => filtro === "todas" || p.estado === filtro);
  const filas = delFiltro.filter((p) => !q || [p.nombres, p.negocio, p.sector, p.rubro].some((s) => sinTildes(s).includes(q)) || (qd.length >= 3 && p.whatsapp.includes(qd)));
  if (!filas.length) {
    if (!P.lista.length)
      return vacioTabla("Todavía no llegan postulaciones", "Cuando alguien llene el formulario «Postula» de la página de JUMP, aparecerá aquí.",
        `<a class="btn btn-ghost" href="/jump/#postula" target="_blank" rel="noopener">${ic("link")}Ver el formulario</a>`);
    if (q) return vacioTabla(`No encontramos “${esc(buscar.trim())}”`, "Busca por nombre, emprendimiento, sector o WhatsApp.");
    const t = { nueva: ["No hay postulaciones nuevas", "Las que lleguen desde la página de JUMP aparecerán aquí."],
      contactada: ["Nadie marcado como contactado", "Cuando escribas a alguien, márcalo como contactado para no repetir."],
      descartada: ["No hay postulaciones descartadas", "Las que descartes quedan aquí, por si cambias de opinión."] }[filtro];
    return vacioTabla(...t);
  }
  return `<div class="table-wrap"><table class="rtable">
    <thead><tr><th>Persona y emprendimiento</th><th>WhatsApp</th><th>Sector y RUC</th><th>Estado</th><th><span class="vh">Acciones</span></th></tr></thead>
    <tbody>${filas.map(filaP).join("")}</tbody></table></div>
    <div class="table-foot"><span>Mostrando ${filas.length} de ${delFiltro.length}</span><span>Úsalas solo para la convocatoria de JUMP. Si alguien pide que borren sus datos, bórrala aquí.</span></div>`;
}
// Vacío dentro del panel de la tabla (vacio() trae su propio panel).
const vacioTabla = (titulo, texto, extra = "") => `<div class="empty">${fig()}<h3>${titulo}</h3><p>${texto}</p>${extra}</div>`;

// ---------- vista ----------
async function vPostulaciones() {
  const A = await cargar();
  if (!P || Date.now() - P.cargadoEn > RECARGA_MS) {
    try {
      P = { lista: await datos.listarPostulaciones(), cargadoEn: Date.now() };
    } catch (e) {
      if (e.codigo !== "sin_tabla") throw e;
      return {
        titulo: "Postulaciones",
        html: `<div class="page-head"><div><h1>Postulaciones</h1></div></div>
          ${vacio("Las postulaciones todavía no están activadas", "Falta preparar la base de datos de JUMP (migración 0002). Avísale a quien administra el sitio. Mientras tanto, el formulario de la página no puede guardar postulaciones.")}`,
      };
    }
  }
  // Quién ya tiene cuenta: mismo WhatsApp que una persona de la comunidad.
  P.conCuenta = new Set(A.miembros.filter((m) => m.whatsapp).map((m) => m.whatsapp));
  contarNuevas();
  const cuenta = (k) => (k === "todas" ? P.lista.length : P.lista.filter((p) => p.estado === k).length);
  return {
    titulo: "Postulaciones",
    html: `<div class="page-head"><div><h1>Postulaciones</h1><p class="sub">Llegan desde el formulario «Postula» de la página de JUMP. Escríbeles por WhatsApp, marca a quién ya contactaste y crea la cuenta de quienes entran al programa.</p></div>
      <div class="head-actions"><a class="btn btn-ghost" href="/jump/#postula" target="_blank" rel="noopener">${ic("link")}Ver el formulario</a></div></div>
    <div class="panel table-panel">
      <div class="toolbar">
        <div class="search">${ic("search")}<input class="input" type="search" id="postQ" value="${esc(buscar)}" placeholder="Buscar nombre, negocio o sector" aria-label="Buscar postulaciones"></div>
        <div class="seg seg-4" role="group" aria-label="Filtrar postulaciones por estado">${FILTROS.map(([k, l]) => `<button type="button" data-act="pfiltro" data-f="${k}" aria-pressed="${filtro === k}">${l} <span class="n">${cuenta(k)}</span></button>`).join("")}</div>
      </div>
      <div id="postTabla">${tabla()}</div>
    </div>`,
    despues: () => asegurarDialogo("dlgBorrarPostu", DLG()),
  };
}

// Cambia el estado y vuelve a dibujar; con «Deshacer» en el aviso.
async function cambiar(boton, id, nuevo, { deshacer = true } = {}) {
  const p = de(id);
  if (!p || p.estado === nuevo) return;
  const antes = p.estado;
  await ocupado(boton, datos.estadoPostulacion(id, nuevo));
  p.estado = nuevo;
  contarNuevas();
  refrescar();
  if (deshacer) toast(AVISO[nuevo](primerNombre(p.nombres)), { label: "Deshacer", fn: () => cambiar(null, id, antes, { deshacer: false }).catch(() => toast("No se pudo deshacer. Intenta de nuevo.")) });
}

async function enviarBorrar(f, btn) {
  const p = de(objetivo);
  if (!p) return $("#dlgBorrarPostu").close();
  await ocupado(btn, datos.borrarPostulacion(p.id));
  $("#dlgBorrarPostu").close();
  P.lista = P.lista.filter((x) => x.id !== p.id);
  contarNuevas();
  refrescar();
  toast(`Se borró la postulación de ${primerNombre(p.nombres)}`);
}

// ---------- registro ----------
export const rutas = [{ patron: "a/postulaciones", titulo: "Postulaciones", vista: vPostulaciones }];

export const acciones = {
  pfiltro: (b) => {
    filtro = b.dataset.f;
    $$('[data-act="pfiltro"]').forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $("#postTabla").innerHTML = tabla();
  },
  pcontactada: (b) => cambiar(b, b.dataset.id, "contactada"),
  pdescartar: (b) => cambiar(b, b.dataset.id, "descartada"),
  pnueva: (b) => cambiar(b, b.dataset.id, "nueva"),
  pcuenta: (b) => {
    const p = de(b.dataset.id);
    if (p) abrirAgregar({ nombres: p.nombres, whatsapp: p.whatsapp, negocio: p.negocio });
  },
  pborrar: (b) => {
    const p = de(b.dataset.id);
    if (!p) return;
    asegurarDialogo("dlgBorrarPostu", DLG());
    objetivo = p.id;
    $("#borrarPostuNombre").textContent = p.nombres;
    $("#dlgBorrarPostu").showModal();
  },
};

export const envios = { borrarPostuForm: enviarBorrar };

export const entradas = {
  postQ: (el) => { buscar = el.value; $("#postTabla").innerHTML = tabla(); },
};
