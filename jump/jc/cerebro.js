// Qué dice JC, en qué orden y cuántas veces. Sin DOM: cada página le pasa sus datos y él elige.
import { FRASES, ESPECIALES } from "./frases.js";
import { estadoClase } from "../comunidad/js/fechas.js";

const DIA = 864e5;
const DESFASE = 5 * 3600e3; // Ecuador: UTC−5 todo el año
const diaEc = (t) => Math.floor((t - DESFASE) / DIA);
const ms = (x) => (typeof x === "number" ? x : Date.parse(x));

// El globo dura según lo largo de la frase: entre 10 y 15 segundos, para que se lea bien.
export function duracionGlobo(texto) {
  const palabras = String(texto || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.min(15000, Math.max(10000, 10000 + Math.max(0, palabras - 14) * 450));
}

// ---------- memoria en el navegador ----------
// localStorage con try/catch: si el navegador lo bloquea o lanza, todo sigue igual, solo que sin recordar entre visitas.
const PREFIJO = "jc.";
const MAX_DICHOS = 200;
const almacenSeguro = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const esSuelta = (clave) => clave.startsWith("suelta:");

export class Memoria {
  constructor(almacen = almacenSeguro(), ahora = () => Date.now()) {
    this.almacen = almacen;
    this.ahora = ahora;
    this.ram = new Map();       // copia en memoria de lo guardado (y lo único que hay si el almacén falla)
    this.visita = new Set();    // frases sueltas dichas en esta visita
    this.ultima = null;         // la última clave dicha (para que tocarlo siga desde ahí)
  }

  #clave(k) { return k.startsWith(PREFIJO) ? k : PREFIJO + k; }

  get(k) {
    k = this.#clave(k);
    if (this.ram.has(k)) return this.ram.get(k);
    let v = null;
    try { const s = this.almacen?.getItem(k); if (s != null) v = JSON.parse(s); } catch { v = null; }
    this.ram.set(k, v);
    return v;
  }

  set(k, v) {
    k = this.#clave(k);
    this.ram.set(k, v);
    try { this.almacen?.setItem(k, JSON.stringify(v)); } catch { /* sin almacén: queda en memoria */ }
  }

  // ¿Ya lo dijo? porDia: solo cuenta si fue hoy (día de Ecuador).
  dicho(clave, { porDia = false } = {}) {
    if (esSuelta(clave)) return this.visita.has(clave);
    const t = this.get("dichos")?.[clave];
    if (t == null) return false;
    return porDia ? diaEc(t) === diaEc(this.ahora()) : true;
  }

  marcar(clave) {
    this.ultima = clave;
    if (esSuelta(clave)) { this.visita.add(clave); return; }
    const dichos = { ...(this.get("dichos") || {}), [clave]: this.ahora() };
    const orden = Object.entries(dichos).sort((a, b) => b[1] - a[1]).slice(0, MAX_DICHOS);
    this.set("dichos", Object.fromEntries(orden));
  }

  // La visita anterior se recuerda aunque la página ya haya registrado la de hoy.
  diasDesdeUltimaVisita() {
    const v = this.previa !== undefined ? this.previa : this.get("ultimaVisita");
    return typeof v === "number" ? Math.floor((this.ahora() - v) / DIA) : null;
  }

  registrarVisita() {
    if (this.previa === undefined) this.previa = this.get("ultimaVisita");
    this.set("ultimaVisita", this.ahora());
  }
}

// ---------- anuncios (lo nuevo, en orden de importancia) ----------
function anuncioClase(c, lugar, ahora, maxDias) {
  if (!c) return null;
  const st = estadoClase(c, ahora), ini = ms(c.iniciaEn);
  if (st === "terminada") return null;
  if (ahora >= ini) return ESPECIALES.claseEmpezo(lugar, c);
  if (diaEc(ini) === diaEc(ahora)) return ESPECIALES.claseHoy(c, lugar);
  if (maxDias != null && ini - ahora > maxDias * DIA) return null;
  return ESPECIALES.claseFutura(c, lugar, ahora);
}

// La mentoría para seguir: la última que tocó a medias; si no hay, la primera sin empezar (igual que el Inicio).
function pendiente(mentorias) {
  const hechos = (m) => m.modulos.filter((x) => x.visto).length;
  const ultimo = (m) => Math.max(0, ...m.modulos.map((x) => (x.vistoEn ? Date.parse(x.vistoEn) : 0)));
  const aMedias = mentorias.filter((m) => { const d = hechos(m); return d > 0 && d < m.modulos.length; });
  const m = aMedias.sort((a, b) => ultimo(b) - ultimo(a))[0] || mentorias.find((x) => x.modulos.length && hechos(x) === 0);
  if (!m) return null;
  const i = m.modulos.findIndex((x) => !x.visto);
  return { ...ESPECIALES.moduloPendiente(i + 1, m.titulo), clave: `modulo:${m.modulos[i].id}` };
}

export function anunciosComunidad({ yo, clases = [], avisos = [], mentorias = [], encuesta = null, ahora = Date.now() } = {}) {
  const out = [];
  const proxima = clases.filter((c) => estadoClase(c, ahora) !== "terminada").sort((a, b) => ms(a.iniciaEn) - ms(b.iniciaEn))[0];
  const clase = anuncioClase(proxima, "comunidad", ahora, 7);
  if (clase) out.push(clase);
  if (encuesta && encuesta.estado === "abierta" && !encuesta.miVoto) out.push(ESPECIALES.encuestaSinVotar(encuesta));
  // Avisos no vistos. Las invitaciones se saltan: la clase ya se anuncia sola.
  for (const a of avisos.filter((x) => !x.visto && x.tipo !== "invitacion").slice(0, 3)) {
    if (a.tipo === "mentoria") {
      const m = mentorias.find((x) => x.id === a.mentoriaId);
      if (m) out.push({ ...ESPECIALES.mentoriaNueva(m), clave: `aviso:${a.id}` });
    } else out.push(ESPECIALES.avisoNuevo(a));
  }
  const mod = pendiente(mentorias);
  if (mod) out.push(mod);
  return out;
}

// En la página pública solo hay un anuncio: la próxima clase (sin límite de días).
export function anunciosLanding({ clase = null, ahora = Date.now() } = {}) {
  const a = anuncioClase(clase, "landing", ahora, null);
  return a ? [a] : [];
}

// En cada pantalla sube lo suyo; lo demás conserva su orden.
const PRIMERO = { clases: "clase:", mentorias: "modulo:", muro: "encuesta:" };
export function ordenarPorPantalla(anuncios, pantalla) {
  const p = PRIMERO[pantalla];
  if (!p) return anuncios.slice();
  return [...anuncios.filter((a) => a.clave.startsWith(p)), ...anuncios.filter((a) => !a.clave.startsWith(p))];
}

// ---------- elegir qué decir ----------
const porDia = (clave) => /^(encuesta|modulo):/.test(clave);

// Sueltas de esa sección. En la comunidad, si la pantalla tiene pocas, siguen las del Inicio (son generales);
// en la landing no: cada frase habla de su sección.
function sueltas(lugar, seccion) {
  const propias = FRASES[lugar]?.[seccion] || [];
  if (lugar !== "comunidad" || seccion === "inicio") return propias;
  return [...propias, ...FRASES.comunidad.inicio];
}

function suelta(lugar, seccion, memoria) {
  const todas = sueltas(lugar, seccion);
  if (!todas.length) return null;
  const propias = FRASES[lugar]?.[seccion] || [];
  let libres = propias.filter((x) => !memoria.visita.has(x.clave));
  if (!libres.length) libres = todas.filter((x) => !memoria.visita.has(x.clave));
  if (!libres.length) { // ya dijo todas en esta visita: vuelve a empezar con las de la sección
    for (const x of todas) memoria.visita.delete(x.clave);
    libres = (propias.length ? propias : todas).filter((x) => x.clave !== memoria.ultima);
    if (!libres.length) libres = propias.length ? propias : todas;
  }
  return libres[Math.floor(Math.random() * libres.length)];
}

function llegada(lugar, memoria) {
  const dias = memoria.diasDesdeUltimaVisita();
  if (lugar === "comunidad" && dias != null && dias >= 7 && !memoria.dicho("regreso", { porDia: true })) {
    memoria.marcar("saludo:comunidad"); // ya había venido: no hace falta presentarse
    return ESPECIALES.regreso();
  }
  if (!memoria.dicho("saludo:" + lugar)) return ESPECIALES.saludo(lugar);
  return null;
}

// Al tocarlo: los anuncios en orden y luego las sueltas (sin repetir sueltas en la visita mientras queden otras).
// Si lo último que dijo fue un anuncio, sigue con el siguiente; si no, sigue por donde iban los toques en esta sección.
// No mira la memoria de anuncios: tocar es pedir que lo cuente.
function alTocar(lugar, seccion, anuncios, memoria) {
  const lista = [...anuncios, ...sueltas(lugar, seccion)];
  const n = lista.length;
  if (!n) return null;
  let i = anuncios.findIndex((x) => x.clave === memoria.ultima);
  if (i < 0) i = memoria.toque?.seccion === seccion ? memoria.toque.i : -1;
  let j = -1;
  for (let k = 1; k <= n && j < 0; k++) {
    const x = lista[(i + k + n) % n];
    if (!esSuelta(x.clave) || !memoria.visita.has(x.clave)) j = (i + k + n) % n;
  }
  if (j < 0) { for (const x of lista) memoria.visita.delete(x.clave); j = (i + 1 + n) % n; }
  memoria.toque = { seccion, i: j };
  return lista[j];
}

export function elegir({ lugar, seccion, anuncios = [], memoria, alLlegar }) {
  const frase = alLlegar
    ? llegada(lugar, memoria)
      || anuncios.find((a) => !memoria.dicho(a.clave, { porDia: porDia(a.clave) }))
      || suelta(lugar, seccion, memoria)
    : alTocar(lugar, seccion, anuncios, memoria);
  if (frase) memoria.marcar(frase.clave);
  return frase || null;
}
