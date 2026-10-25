// JC en la página: el personaje, su globo y sus movimientos (portados de la demo aprobada, mockups/jump/jc-2d).
// Cada página decide qué dice y dónde se para; este módulo se encarga de cómo lo hace.
import { duracionGlobo } from "./cerebro.js";

const RAIZ = new URL("./", import.meta.url).href;
const CARAS = { reposo: [325, 681], feliz: [396, 684], triste: [322, 683], enojado: [325, 676], bromista: [331, 683], salto: [505, 617] };
const COMO_ESTA = { reposo: "tranquilo", feliz: "feliz", triste: "triste", enojado: "enojado", bromista: "bromista", salto: "saltando" };
const EASE_OUT = "cubic-bezier(.23,1,.32,1)";
const CAIDA = "cubic-bezier(.55, 0, 1, .45)"; // cae acelerando, como con gravedad
const CAMPO = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]), textarea, select, [contenteditable='true']";
const VIEJO = 20000; // lo que espera en la cola más de 20 s ya no viene al caso
const cruzan = (a, b) => a.width > 0 && b.width > 0 && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const HTML = `
<div class="jc">
  <div class="jc-paseo">
    <div class="jc-sombra"></div>
    <div class="jc-giro"><div class="jc-salto"><div class="jc-cambio"><div class="jc-animo">
      <div class="jc-cuerpo" data-cara="reposo">
        ${Object.entries(CARAS).map(([c, [w, h]]) =>
          `<img class="cara${c === "reposo" ? " activa" : ""}" data-cara="${c}" src="${RAIZ}jc-${c}.webp" alt="" width="${w}" height="${h}" decoding="async" draggable="false">`).join("")}
        <div class="paso"></div>
        <span class="parpado i"></span><span class="parpado d"></span>
        <svg class="jc-enojo" viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="#E2352B" stroke-width="4.5" stroke-linecap="round"><path d="M16 4c0 7 -5 12 -12 12"/><path d="M24 4c0 7 5 12 12 12"/><path d="M16 36c0 -7 -5 -12 -12 -12"/><path d="M24 36c0 -7 5 -12 12 -12"/></g></svg>
      </div>
    </div></div></div></div>
    <button class="jc-toque" type="button"></button>
    <button class="jc-esconder" type="button" aria-label="Esconder a JC"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
  </div>
  <p class="jc-globo" role="status" aria-live="polite"></p>
</div>
<button class="jc-volver" type="button" aria-label="Mostrar a JC" hidden><img src="${RAIZ}jc-reposo.webp" alt="" width="325" height="681" decoding="async" draggable="false"></button>`;

export function crearJC({ alTocar } = {}) {
  const quieto = matchMedia("(prefers-reduced-motion: reduce)");
  const escena = document.createElement("div");
  escena.className = "jc-escena entrando";
  escena.dataset.animo = "reposo";
  escena.dataset.modo = "esquina";
  escena.innerHTML = HTML;
  document.body.appendChild(escena);
  const $ = (s) => escena.querySelector(s);
  const jc = $(".jc"), paseo = $(".jc-paseo"), salto = $(".jc-salto"), cambio = $(".jc-cambio"), cuerpo = $(".jc-cuerpo");
  const caras = escena.querySelectorAll(".cara"), sombra = $(".jc-sombra"), globo = $(".jc-globo");
  const toque = $(".jc-toque"), botonEsconder = $(".jc-esconder"), volver = $(".jc-volver");

  let modo = "esquina", ancla = null, listo = false, escondido = false, fuera = false, tapa = false, destruido = false;
  let enElAire = false, saltando = false, mudanza = null, caminata = null, x = 0, tiraLista = false;
  let globoAbierto = false, restante = 0, inicio = 0, cola = [];
  const pausas = new Set();
  const t = { globo: 0, reposo: 0, parpadeo: 0, paseo: 0, turno: 0, limpiar: 0 };
  const quitar = [];
  const on = (obj, tipo, fn, opts) => { obj?.addEventListener(tipo, fn, opts); quitar.push(() => obj?.removeEventListener(tipo, fn, opts)); };

  // ---------- caras ----------
  function ponerCara(nombre) {
    cuerpo.dataset.cara = nombre;
    caras.forEach((c) => c.classList.toggle("activa", c.dataset.cara === nombre));
    toque.setAttribute("aria-label", `JC, la mascota de JUMP, ${COMO_ESTA[nombre]}. Tócalo para que salte`);
  }
  // Un aplastón corto tapa el cambio de dibujo, como en los dibujos animados.
  function aplastar() {
    if (quieto.matches) return;
    cambio.animate([
      { transform: "scale(1, 1)", easing: EASE_OUT },
      { transform: "scale(1.07, .9)", offset: .3, easing: EASE_OUT },
      { transform: "scale(.97, 1.04)", offset: .65, easing: EASE_OUT },
      { transform: "scale(1, 1)" },
    ], { duration: 260 });
  }
  function cambiarAnimo(animo) {
    if (!CARAS[animo] || animo === "salto" || escena.dataset.animo === animo) return;
    escena.dataset.animo = animo;
    if (!enElAire) ponerCara(animo); // si está en el aire, aterriza con la cara nueva
    aplastar();
  }

  // ---------- globo ----------
  // Junto a la cabeza sin salirse de la pantalla; la cola siempre apunta a JC.
  function colocarGlobo() {
    const margen = 12, vw = document.documentElement.clientWidth;
    const j = jc.getBoundingClientRect(), c = cuerpo.getBoundingClientRect();
    const ancho = globo.offsetWidth, izq = c.left - j.left, cabeza = izq + c.width * 0.5;
    let gx = izq + c.width * 0.62;                                                 // a la derecha de la cabeza
    if (j.left + gx + ancho > vw - margen) gx = izq + c.width * 0.38 - ancho;    // si no cabe, a la izquierda
    gx = Math.min(Math.max(gx, margen - j.left), vw - margen - j.left - ancho);
    const cola = Math.min(Math.max(cabeza - gx, 22), ancho - 26);
    globo.style.setProperty("--x", `${gx}px`);
    globo.style.setProperty("--cola", `${cola}px`);
    globo.classList.toggle("hacia-derecha", cola > ancho / 2);
  }

  const ocupado = () => !listo || globoAbierto || saltando || mudanza || escondido || fuera || tapa;

  function siguienteTurno() {
    if (destruido || ocupado()) return;
    const ahora = Date.now();
    cola = cola.filter((x) => ahora - x.t < VIEJO);
    const sig = cola.shift();
    if (!sig) return;
    detenerCaminata();
    mostrarGlobo(sig.frase);
  }

  function mostrarGlobo(frase) {
    clearTimeout(t.reposo);
    clearTimeout(t.limpiar);
    cambiarAnimo(frase.animo || "reposo");
    globo.classList.remove("visible");
    globo.textContent = frase.texto;
    colocarGlobo();
    requestAnimationFrame(() => { if (globoAbierto) globo.classList.add("visible"); });
    globoAbierto = true;
    escena.classList.add("hablando");
    restante = duracionGlobo(frase.texto);
    pausas.clear();
    if (globo.matches(":hover")) pausas.add("mouse");
    if (jc.contains(document.activeElement)) pausas.add("foco");
    correrReloj();
  }

  function correrReloj() {
    clearTimeout(t.globo);
    if (pausas.size || !globoAbierto) return;
    inicio = performance.now();
    t.globo = setTimeout(() => cerrarGlobo(), restante);
  }
  // Mientras el mouse está encima, el foco está en JC o se está tocando el globo, no se cierra.
  function pausar(motivo) {
    if (!globoAbierto) return;
    if (!pausas.size) { clearTimeout(t.globo); restante = Math.max(0, restante - (performance.now() - inicio)); }
    pausas.add(motivo);
  }
  function reanudar(motivo) {
    if (!pausas.delete(motivo) || pausas.size || !globoAbierto) return;
    restante = Math.max(restante, 2500); // un respiro para terminar de leer
    correrReloj();
  }

  function cerrarGlobo({ ya = false } = {}) {
    clearTimeout(t.globo);
    pausas.clear();
    if (!globoAbierto) return;
    globoAbierto = false;
    escena.classList.remove("hablando");
    globo.classList.remove("visible");
    t.limpiar = setTimeout(() => { if (!globoAbierto) globo.textContent = ""; }, 260);
    t.reposo = setTimeout(() => { if (!globoAbierto) cambiarAnimo("reposo"); }, 4000);
    clearTimeout(t.turno);
    if (!ya) t.turno = setTimeout(siguienteTurno, 700);
  }

  // Nunca interrumpe un globo abierto: deja una cola corta y descarta lo viejo. Tocarlo sí interrumpe.
  function decir(frase, { interrumpir = false } = {}) {
    if (destruido || !frase?.texto || escondido || fuera) return;
    if (interrumpir) {
      cola = [{ frase, t: Date.now() }];
      if (globoAbierto) cerrarGlobo({ ya: true });
    } else {
      cola.push({ frase, t: Date.now() });
      if (cola.length > 2) cola.shift();
    }
    siguienteTurno();
  }

  // ---------- salto (estirar y aplastar) ----------
  function saltar() {
    if (saltando || mudanza || destruido) return;
    detenerCaminata();
    saltando = true;
    if (quieto.matches) {
      // Sin movimiento: solo se ve un momento el dibujo de salto.
      enElAire = true; ponerCara("salto");
      setTimeout(() => { enElAire = false; ponerCara(escena.dataset.animo); saltando = false; siguienteTurno(); }, 500);
      return;
    }
    const d = { agacha: 130, sube: 300, cae: 260, aterriza: 110, asienta: 260 };
    const total = d.agacha + d.sube + d.cae + d.aterriza + d.asienta;
    let acc = 0;
    const marca = (ms) => (acc += ms) / total;
    const anim = salto.animate([
      { transform: "translateY(0) scale(1, 1)", easing: EASE_OUT },
      { transform: "translateY(0) scale(1.08, .86)", offset: marca(d.agacha), easing: EASE_OUT },
      { transform: "translateY(-46%) scale(.94, 1.08)", offset: marca(d.sube), easing: CAIDA },
      { transform: "translateY(0) scale(.97, 1.04)", offset: marca(d.cae), easing: EASE_OUT },
      { transform: "translateY(0) scale(1.1, .88)", offset: marca(d.aterriza), easing: "cubic-bezier(.34,1.56,.64,1)" },
      { transform: "translateY(0) scale(1, 1)" },
    ], { duration: total });
    acc = 0;
    sombra.animate([
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(1.1)", opacity: 1, offset: marca(d.agacha) },
      { transform: "scale(.55)", opacity: .45, offset: marca(d.sube), easing: CAIDA },
      { transform: "scale(1)", opacity: 1, offset: marca(d.cae) },
      { transform: "scale(1.12)", opacity: 1, offset: marca(d.aterriza) },
      { transform: "scale(1)", opacity: 1 },
    ], { duration: total });
    // Se agacha con la cara del ánimo, despega con el dibujo de salto y aterriza otra vez con la suya.
    setTimeout(() => { enElAire = true; ponerCara("salto"); }, d.agacha);
    setTimeout(() => { enElAire = false; ponerCara(escena.dataset.animo); }, d.agacha + d.sube + d.cae);
    setTimeout(chispas, d.agacha + d.sube - 60);
    anim.finished.catch(() => {}).then(() => { saltando = false; siguienteTurno(); });
  }

  function chispas() {
    if (destruido) return;
    ["#FFC21A", "#E59A00", "#0B1F5C", "#FFC21A", "#E59A00", "#0B1F5C"].forEach((color, i) => {
      const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      s.setAttribute("viewBox", "0 0 20 20"); s.setAttribute("class", "jc-chispa"); s.setAttribute("aria-hidden", "true");
      s.innerHTML = `<path d="M10 0l2.6 7.4L20 10l-7.4 2.6L10 20l-2.6-7.4L0 10l7.4-2.6z" fill="${color}"/>`;
      paseo.appendChild(s);
      const ang = (-160 + i * 28) * Math.PI / 180, r = 70 + Math.random() * 40;
      s.animate([
        { transform: "translate(0, 0) scale(.6) rotate(0)", opacity: 1 },
        { transform: `translate(${Math.cos(ang) * r}px, ${Math.sin(ang) * r}px) scale(1) rotate(90deg)`, opacity: 0 },
      ], { duration: 650, easing: EASE_OUT }).finished.catch(() => {}).then(() => s.remove());
    });
  }

  // ---------- dónde está: grande sobre su ancla o en la esquina ----------
  function alinear() {
    if (modo !== "grande" || !ancla) { jc.style.left = ""; jc.style.top = ""; return; }
    const a = ancla.getBoundingClientRect(), e = escena.getBoundingClientRect();
    jc.style.left = `${a.left + a.width / 2 - jc.offsetWidth / 2 - e.left}px`;
    jc.style.top = `${a.bottom - jc.offsetHeight - e.top}px`;
  }
  let pedidoAlinear = 0;
  const realinear = () => {
    cancelAnimationFrame(pedidoAlinear);
    pedidoAlinear = requestAnimationFrame(() => { alinear(); if (globoAbierto) colocarGlobo(); revisarCampo(); });
  };
  const vigia = typeof ResizeObserver === "function" ? new ResizeObserver(realinear) : null;

  const seVe = () => listo && !escondido && !fuera && jc.getBoundingClientRect().width > 0;

  // Salta de un lugar al otro (FLIP: se mide antes y después, y se anima la diferencia con un arco).
  function mudar(antes) {
    const despues = jc.getBoundingClientRect();
    const dx = antes.left - despues.left, dy = antes.bottom - despues.bottom, s = antes.height / (despues.height || 1);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(s - 1) < .01) return;
    const conGlobo = globoAbierto;
    if (conGlobo) globo.classList.remove("visible");
    if (quieto.matches) {
      mudanza = jc.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: EASE_OUT }); // aparece suave, sin viajar
    } else {
      const dist = Math.hypot(dx, dy);
      const alto = Math.min(140, 40 + dist * .2);
      mudanza = jc.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${s})`, easing: EASE_OUT },
        { transform: `translate(${dx * .5}px, ${dy * .5 - alto}px) scale(${(s + 1) / 2})`, offset: .45, easing: CAIDA },
        { transform: "translate(0, 0) scale(1)" },
      ], { duration: Math.min(720, 420 + dist * .25) });
      enElAire = true; ponerCara("salto");
    }
    const esta = mudanza;
    esta.finished.catch(() => {}).then(() => {
      if (mudanza !== esta) return; // la reemplazó otra mudanza
      mudanza = null;
      if (enElAire && !saltando) { enElAire = false; ponerCara(escena.dataset.animo); aplastar(); }
      if (conGlobo && globoAbierto) { colocarGlobo(); globo.classList.add("visible"); }
      siguienteTurno();
    });
  }

  function aparecer() {
    escena.classList.remove("entrando");
    if (!quieto.matches) jc.animate([{ transform: "translateY(14px)" }, { transform: "translateY(0)" }], { duration: 320, easing: EASE_OUT });
    setTimeout(() => { listo = true; siguienteTurno(); }, 350);
  }

  function ubicar(nuevo, nuevaAncla = null) {
    if (destruido) return;
    nuevaAncla = nuevo === "grande" ? nuevaAncla : null;
    if (listo && nuevo === modo && nuevaAncla === ancla) { realinear(); return; }
    const antes = seVe() ? jc.getBoundingClientRect() : null; // con la mudanza a medias, mide dónde se ve ahora
    if (mudanza) { const m = mudanza; mudanza = null; m.cancel(); }
    detenerCaminata();
    x = 0; paseo.style.transform = "";
    if (ancla && vigia) vigia.unobserve(ancla);
    modo = nuevo; ancla = nuevaAncla;
    if (ancla && vigia) vigia.observe(ancla);
    escena.dataset.modo = modo;
    alinear();
    if (escena.classList.contains("entrando")) { aparecer(); return; }
    if (globoAbierto) colocarGlobo();
    if (antes && !escondido && !fuera) mudar(antes);
  }

  // ---------- caminar unos pasos de vez en cuando ----------
  function cargarTira() {
    const pedir = window.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 5000 }) : (f) => setTimeout(f, 1500);
    const empezar = () => pedir(() => {
      if (destruido) return;
      const img = new Image();
      img.alt = ""; img.width = 5222; img.height = 703; img.decoding = "async";
      img.src = RAIZ + "jc-caminar.webp";
      img.decode().then(() => {
        if (destruido) return;
        $(".paso").appendChild(img);
        tiraLista = true;
        programarPaseo();
      }).catch(() => { /* sin tira, JC no camina */ });
    });
    if (document.readyState === "complete") empezar(); else on(window, "load", empezar, { once: true });
  }
  function programarPaseo() { clearTimeout(t.paseo); t.paseo = setTimeout(pasear, 25000 + Math.random() * 20000); }

  function pasear() {
    programarPaseo();
    if (!tiraLista || quieto.matches || document.hidden || caminata || ocupado()) return;
    const w = jc.offsetWidth, r = jc.getBoundingClientRect(), vw = document.documentElement.clientWidth, m = 12;
    // Dentro de ±1 ancho de su lugar y sin salirse de la pantalla; en la esquina solo hacia la izquierda.
    const lo = Math.max(-w, m - r.left);
    const hi = Math.min(modo === "esquina" ? 0 : w, vw - m - r.right);
    if (hi - lo < w * .4) return;
    let destino = lo + Math.random() * (hi - lo);
    if (Math.abs(destino - x) < w * .4) destino = Math.abs(lo - x) > Math.abs(hi - x) ? lo : hi;
    jc.classList.toggle("izquierda", destino < x);
    jc.classList.add("caminando");
    aplastar();
    // Avanza un cuerpo por segundo y parejo (lineal): así los pies no patinan sobre el piso.
    caminata = paseo.animate([{ transform: `translateX(${x}px)` }, { transform: `translateX(${destino}px)` }],
      { duration: Math.abs(destino - x) / w * 1000, easing: "linear", fill: "forwards" });
    caminata.finished.then(() => { x = destino; terminarCaminata(); aplastar(); }).catch(() => {});
  }
  function terminarCaminata() {
    paseo.style.transform = x ? `translateX(${x}px)` : "";
    const c = caminata;
    caminata = null;
    c?.cancel();
    jc.classList.remove("caminando");
  }
  function detenerCaminata() {
    if (!caminata) return;
    x = new DOMMatrix(getComputedStyle(paseo).transform).m41;
    terminarCaminata();
  }

  // ---------- parpadeo ----------
  function parpadear() {
    jc.classList.remove("parpadea");
    void jc.offsetWidth;
    jc.classList.add("parpadea");
    if (Math.random() < 0.18) setTimeout(parpadear, 300);
  }
  (function cicloParpadeo() {
    t.parpadeo = setTimeout(() => { if (!quieto.matches && !document.hidden && !escondido) parpadear(); cicloParpadeo(); }, 2400 + Math.random() * 3200);
  })();

  // ---------- teclado del celular: se quita si tapa el campo donde se escribe ----------
  function revisarCampo() {
    const a = document.activeElement;
    const debe = !!a && !escena.contains(a) && !!a.matches?.(CAMPO) && !fuera && !escondido &&
      (cruzan(a.getBoundingClientRect(), jc.getBoundingClientRect()) || (globoAbierto && cruzan(a.getBoundingClientRect(), globo.getBoundingClientRect())));
    if (debe === tapa) return;
    tapa = debe;
    escena.classList.toggle("tapa", tapa);
    if (!tapa) siguienteTurno();
  }

  // ---------- esconder y mostrar ----------
  function esconder() {
    if (escondido || destruido) return;
    const teniaFoco = escena.contains(document.activeElement);
    escondido = true;
    cola = [];
    cerrarGlobo({ ya: true });
    detenerCaminata();
    escena.classList.add("escondido");
    volver.hidden = false;
    if (teniaFoco) volver.focus();
    document.dispatchEvent(new CustomEvent("jc:escondido"));
  }
  function mostrar() {
    if (!escondido || destruido) return;
    const teniaFoco = document.activeElement === volver;
    escondido = false;
    volver.hidden = true;
    escena.classList.remove("escondido");
    alinear();
    if (teniaFoco) toque.focus();
    document.dispatchEvent(new CustomEvent("jc:visible"));
  }
  function ocultarDelTodo(si) {
    fuera = !!si;
    escena.classList.toggle("fuera", fuera);
    if (fuera) { cola = []; cerrarGlobo({ ya: true }); detenerCaminata(); }
    else { alinear(); siguienteTurno(); }
  }

  function destruir() {
    if (destruido) return;
    destruido = true;
    Object.values(t).forEach(clearTimeout);
    cancelAnimationFrame(pedidoAlinear);
    vigia?.disconnect();
    quitar.forEach((f) => f());
    escena.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    escena.remove();
  }

  // ---------- eventos ----------
  on(toque, "click", () => { saltar(); alTocar?.(); });
  on(botonEsconder, "click", esconder);
  on(volver, "click", mostrar);
  on(globo, "pointerenter", (e) => { if (e.pointerType === "mouse") pausar("mouse"); });
  on(globo, "pointerleave", (e) => { if (e.pointerType === "mouse") reanudar("mouse"); });
  on(globo, "pointerdown", (e) => { if (e.pointerType !== "mouse") pausar("toque"); });
  on(globo, "pointerup", () => reanudar("toque"));
  on(globo, "pointercancel", () => reanudar("toque"));
  on(jc, "focusin", () => pausar("foco"));
  on(jc, "focusout", (e) => { if (!jc.contains(e.relatedTarget)) reanudar("foco"); });
  on(document, "focusin", revisarCampo);
  on(document, "focusout", () => setTimeout(revisarCampo, 0));
  on(window.visualViewport, "resize", realinear);
  on(window.visualViewport, "scroll", realinear);
  on(window, "resize", realinear);
  on(window, "load", realinear, { once: true });
  document.fonts?.ready.then(realinear).catch(() => {});

  ponerCara("reposo");
  cargarTira();

  return {
    decir,
    ubicar,
    esconder,
    mostrar,
    estaEscondido: () => escondido,
    ocultarDelTodo,
    destruir,
  };
}
