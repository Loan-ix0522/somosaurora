// JC en la comunidad: acompaña al emprendedor. Grande junto a «Hola, {nombre}» en el Inicio, en la esquina en el resto,
// y fuera de donde estorba (ingreso, primera clave, el equipo, y dentro de un módulo). Lo que dice lo elige cerebro.js;
// aquí solo se le cuenta en qué pantalla está. app.js llama a jcPantalla() cada vez que dibuja una página.
import { crearJC } from "/jump/jc/jc.js";
import { Memoria, elegir, anunciosComunidad, ordenarPorPantalla } from "/jump/jc/cerebro.js";
import { datosJC } from "./vistas-emprendedor.js";

// Ruta → nombre con que la conocen las frases (FRASES.comunidad). Lo que no está aquí (p. ej. una página que no existe) va en la esquina y calla.
const PANTALLAS = { "e/inicio": "inicio", "e/mentorias": "mentorias", "e/clases": "clases", "e/muro": "muro", "e/avisos": "avisos", "e/perfil": "perfil" };
const HABLA_EN_MS = 700; // deja que la página termine de acomodarse antes de decir algo

let jc = null, memoria = null, sitio = null, ultima = null, pantalla = null;
const habladas = new Set(); // una vez por pantalla en cada visita

// Dónde se para en el Inicio: un sitio propio a la derecha del saludo (se pasa de página en página: es el mismo elemento).
function sitioInicio() {
  const cabeza = document.querySelector("#page .page-head");
  if (!cabeza) return null;
  sitio ??= Object.assign(document.createElement("span"), { className: "jc-sitio-com", ariaHidden: "true" });
  cabeza.classList.add("con-jc");
  cabeza.appendChild(sitio);
  return sitio;
}

const contexto = () => {
  const d = datosJC();
  return ordenarPorPantalla(anunciosComunidad({ ...(d || {}), yo: d?.yo || undefined, ahora: Date.now() }), pantalla);
};

function crear() {
  memoria = new Memoria();
  memoria.registrarVisita();
  jc = crearJC({
    alTocar: () => jc.decir(elegir({ lugar: "comunidad", seccion: pantalla || "inicio", anuncios: contexto(), memoria, alLlegar: false }), { interrumpir: true }),
  });
  if (memoria.get("escondido")) jc.esconder();
  document.addEventListener("jc:escondido", () => memoria.set("escondido", true));
  document.addEventListener("jc:visible", () => { memoria.set("escondido", false); habladas.delete(pantalla); hablar(); });
  // En el celular la barra de abajo tapa la esquina: JC se sube sobre ella.
  const celular = matchMedia("(max-width: 900px)");
  const marcar = () => document.body.classList.toggle("jc-sobre-barra", celular.matches);
  marcar();
  celular.addEventListener("change", marcar);
}

function hablar() {
  if (!jc || jc.estaEscondido() || !pantalla || habladas.has(pantalla)) return;
  habladas.add(pantalla);
  const frase = elegir({ lugar: "comunidad", seccion: pantalla, anuncios: contexto(), memoria, alLlegar: true });
  if (frase) jc.decir(frase);
}

export function jcPantalla(path, yo) {
  const oculto = !yo || path === "ingreso" || yo.rol === "admin" || yo.debeCambiarClave || path.startsWith("e/m/");
  if (oculto) {
    jc?.ocultarDelTodo(true);
    ultima = null; pantalla = null;
    return;
  }
  if (!jc) crear();
  jc.ocultarDelTodo(false);
  pantalla = PANTALLAS[path] || null;
  const ancla = path === "e/inicio" ? sitioInicio() : null;
  jc.ubicar(ancla ? "grande" : "esquina", ancla);
  if (path === ultima) return; // la misma página dibujada otra vez (p. ej. al refrescar): no repite
  ultima = path;
  setTimeout(() => { if (ultima === path) hablar(); }, HABLA_EN_MS);
}
