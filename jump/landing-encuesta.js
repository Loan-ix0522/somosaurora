// La encuesta de la landing (#encuestas): la real, con porcentajes. Vota cualquier visitante, un voto por aparato, y lo
// puede cambiar. El voto pasa por /api/jump-publico (que pone el tope por conexión); aquí solo se recuerda cuál fue.
import { cargarPublico } from "/jump/publico.js";

const MAX = 8; // con más opciones se ven las 8 más votadas y «Ver todas»
const APARATO = /^[A-Za-z0-9_-]{16,64}$/;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const poll = document.getElementById("poll");
const pregunta = document.getElementById("pollQ");
const optsEl = document.getElementById("opts");
const votesEl = document.getElementById("votes");
const msg = document.getElementById("pollMsg");
const mas = document.getElementById("pollMas");
const tick = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12.5 4 4 8-9"/></svg>';
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

// El navegador puede no dejar guardar (modo privado, almacenamiento bloqueado): entonces vale solo esta visita.
const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
let aparatoRam = null;
function aparato() {
  const guardado = leer("jump.dispositivo");
  if (guardado && APARATO.test(guardado)) return guardado;
  aparatoRam ??= crypto.randomUUID?.() || [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  guardar("jump.dispositivo", aparatoRam);
  return aparatoRam;
}

let encuesta = null, mia = null, todas = false, vista = false, enviando = false, primera = true;

// Las 8 más votadas (y la mía, aunque no esté entre ellas), en el orden de la encuesta.
function visibles() {
  const ops = encuesta.opciones;
  if (todas || ops.length <= MAX) return ops;
  const top = [...ops].sort((a, b) => b.porcentaje - a.porcentaje).slice(0, MAX);
  if (mia && !top.some((o) => o.id === mia)) top[MAX - 1] = ops.find((o) => o.id === mia);
  const ids = new Set(top.map((o) => o.id));
  return ops.filter((o) => ids.has(o.id));
}

// Las barras suben poco a poco la primera vez que se ve la tarjeta; después, se acomodan al votar.
function llenar(escalonado) {
  const fills = [...optsEl.querySelectorAll(".fill")];
  void optsEl.offsetWidth; // fija el ancho de partida para que la transición corra
  fills.forEach((f, i) => {
    f.style.transitionDelay = escalonado ? `${120 + i * 110}ms` : "0ms";
    f.style.transform = `scaleX(${f.dataset.p / 100})`;
  });
}

function pintar() {
  poll.removeAttribute("aria-busy");
  if (!encuesta) {
    poll.dataset.estado = "vacia";
    pregunta.textContent = "Pronto abriremos la primera encuesta";
    optsEl.innerHTML = "";
    votesEl.textContent = "";
    mas.hidden = true;
    return;
  }
  const abierta = encuesta.estado === "abierta";
  poll.dataset.estado = encuesta.estado;
  pregunta.textContent = encuesta.pregunta;
  // al redibujar, cada barra arranca desde su ancho anterior para que la transición sea continua
  const antes = new Map([...optsEl.querySelectorAll(".opt")].map((b) => [b.dataset.id, b.querySelector(".fill").style.transform]));
  optsEl.innerHTML = visibles().map((o) => `<button type="button" class="opt${o.id === mia ? " mine" : ""}" data-id="${esc(o.id)}" aria-pressed="${o.id === mia}"${abierta ? "" : " disabled"}>
      <span class="fill" data-p="${o.porcentaje}"></span><span class="lbl"><span class="tick" aria-hidden="true">${tick}</span>${esc(o.texto)}</span><span class="pct">${o.porcentaje} %</span></button>`).join("");
  optsEl.querySelectorAll(".fill").forEach((f) => {
    const t = antes.get(f.parentElement.dataset.id);
    if (t) { f.style.transition = "none"; f.style.transform = t; void f.offsetWidth; f.style.transition = ""; }
  });
  if (vista) { llenar(primera); primera = false; }
  const total = encuesta.opciones.length;
  mas.hidden = optsEl.children.length >= total;
  mas.textContent = `Ver todas (${total})`;
  votesEl.textContent = !abierta ? "Encuesta cerrada" : mia ? "Ya votaste · puedes cambiar tu voto" : "Toca una opción para votar";
}

async function votar(id) {
  enviando = true;
  poll.setAttribute("aria-busy", "true");
  msg.className = "poll-msg";
  msg.textContent = "Guardando tu voto…";
  try {
    const r = await fetch("/api/jump-publico", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opcion: id, dispositivo: aparato() }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.ok && d.encuesta) {
      mia = id;
      guardar(`jump.voto.${d.encuesta.id}`, id);
      guardar("jump.votoEn", String(Date.now())); // al recargar enseguida, publico.js pide los resultados frescos
      encuesta = d.encuesta;
      msg.textContent = "¡Listo! Tu voto quedó guardado.";
      pintar();
      optsEl.querySelector(`.opt[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    } else {
      msg.className = "poll-msg err";
      // El tope por conexión, la encuesta que cerró o lo que falló: lo explica la API.
      msg.textContent = d.error || "No se pudo guardar tu voto. Intenta de nuevo en unos minutos.";
    }
  } catch {
    msg.className = "poll-msg err";
    msg.textContent = "No se pudo guardar tu voto. Revisa tu conexión e intenta de nuevo.";
  } finally {
    enviando = false;
    poll.removeAttribute("aria-busy");
  }
}

optsEl.addEventListener("click", (e) => {
  const b = e.target.closest(".opt");
  if (!b || b.disabled || enviando || encuesta?.estado !== "abierta" || b.dataset.id === mia) return;
  votar(b.dataset.id);
});

mas.addEventListener("click", () => {
  const antes = new Set([...optsEl.children].map((b) => b.dataset.id));
  todas = true;
  pintar();
  [...optsEl.children].find((b) => !antes.has(b.dataset.id))?.focus({ preventScroll: true });
});

cargarPublico().then(({ encuesta: e }) => {
  encuesta = e;
  const guardada = e && leer(`jump.voto.${e.id}`);
  mia = e?.opciones.some((o) => o.id === guardada) ? guardada : null;
  pintar();
});

if (reduce || !("IntersectionObserver" in window)) vista = true;
else new IntersectionObserver((entries, io) => {
  if (!entries[0].isIntersecting) return;
  io.disconnect();
  vista = true;
  if (encuesta) { llenar(primera); primera = false; }
}, { threshold: .45 }).observe(poll);
