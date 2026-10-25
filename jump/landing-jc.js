// JC en la landing: grande en la portada, parado junto a Josué (.jc-sitio); cuando su sitio deja de verse, salta a la
// esquina y comenta la sección que estás viendo. Lo que dice lo elige cerebro.js; aquí solo se le cuenta dónde está.
import { crearJC } from "/jump/jc/jc.js";
import { Memoria, elegir, anunciosLanding } from "/jump/jc/cerebro.js";
import { cargarPublico } from "/jump/publico.js";

// Cada sección y el nombre con que la conocen las frases (FRASES.landing).
const SECCIONES = [[".hero", "portada"], [".salto", "salto"], ["#incluye", "incluye"], ["#momentos", "momentos"],
  ["#modulos", "modulos"], ["#encuestas", "encuestas"], [".josue", "josue"], ["#padrinos", "padrinos"],
  ["#proceso", "proceso"], ["#postula", "postula"], ["#preguntas", "preguntas"]];

const sitio = document.querySelector(".jc-sitio");
const arte = document.querySelector(".hero-art");

// JC entra cuando la portada ya se armó: sin retrasar el primer pintado y con la foto de Josué en su lugar
// (la foto entra deslizándose; medir antes lo dejaría corrido).
const cargada = document.readyState === "complete" ? Promise.resolve() : new Promise((r) => addEventListener("load", r, { once: true }));
const revelada = new Promise((r) => {
  if (!arte) { r(); return; }
  const fin = (e) => { if (e.target === arte) { arte.removeEventListener("transitionend", fin); r(); } };
  arte.addEventListener("transitionend", fin);
  setTimeout(r, 1800);
});

async function iniciar([, , { clase }]) {
  const memoria = new Memoria();
  memoria.registrarVisita();
  const anuncios = () => anunciosLanding({ clase, ahora: Date.now() });
  let seccion = null, grande = false;
  const habladas = new Set(); // una vez por sección en cada visita

  const jc = crearJC({
    alTocar: () => jc.decir(elegir({ lugar: "landing", seccion: seccion || "portada", anuncios: anuncios(), memoria, alLlegar: false }), { interrumpir: true }),
  });
  if (memoria.get("escondido")) jc.esconder();

  function hablar() {
    if (!seccion || habladas.has(seccion) || jc.estaEscondido()) return;
    if (seccion === "portada" && !grande) return; // la portada se comenta desde su sitio, junto a Josué
    habladas.add(seccion);
    const frase = elegir({ lugar: "landing", seccion, anuncios: anuncios(), memoria, alLlegar: true });
    if (frase) jc.decir(frase);
  }

  document.addEventListener("jc:escondido", () => memoria.set("escondido", true));
  document.addEventListener("jc:visible", () => { memoria.set("escondido", false); habladas.delete(seccion); hablar(); });

  // Grande mientras se vea al menos la mitad de su sitio (debajo de la cabecera fija); si no, en la esquina.
  const cabecera = document.querySelector(".top")?.offsetHeight || 0;
  new IntersectionObserver((entries) => {
    const e = entries[entries.length - 1];
    grande = e.isIntersecting && e.intersectionRatio >= .5;
    jc.ubicar(grande ? "grande" : "esquina", sitio);
    if (grande) hablar();
  }, { rootMargin: `-${cabecera}px 0px 0px 0px`, threshold: [0, .5, 1] }).observe(sitio);

  // La sección actual es la que cruza la mitad de la pantalla.
  const nombre = new Map();
  for (const [sel, n] of SECCIONES) { const el = document.querySelector(sel); if (el) nombre.set(el, n); }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) seccion = nombre.get(e.target);
    hablar();
  }, { rootMargin: "-50% 0px -50% 0px" });
  nombre.forEach((_, el) => io.observe(el));
}

if (sitio) Promise.all([cargada, revelada, cargarPublico()]).then(iniciar);
