// Piezas de interfaz compartidas (las mismas del mockup aprobado).

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const ic = (n, c = "") => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
export const fig = (c = "") => `<svg class="fig ${c}" viewBox="470 340 220 290" aria-hidden="true"><use href="#fig-glyph"/></svg>`;
export const logo = (c = "") => `<svg class="logo ${c}" viewBox="288 356 504 356" aria-hidden="true"><use href="#jump-letters"/></svg>`;
export const iniciales = (n) => String(n || "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

let toastT = 0;
export function toast(msg, accion) {
  const el = $("#toast");
  clearTimeout(toastT);
  el.innerHTML = `${ic("check")}<span>${esc(msg)}</span>${accion ? `<button type="button">${esc(accion.label)}</button>` : ""}`;
  if (accion) el.querySelector("button").onclick = () => { accion.fn(); el.classList.remove("show"); };
  el.classList.add("show");
  toastT = setTimeout(() => el.classList.remove("show"), accion ? 6000 : 3200);
}

export async function copiar(texto, msg) {
  try { await navigator.clipboard.writeText(texto); toast(msg); }
  catch { toast("No se pudo copiar. Selecciona el texto y cópialo a mano."); }
}

// Muestra (o limpia, con msg vacío) el error de un campo en el <p class="err"> que nombra su aria-describedby.
export function fieldErr(input, msg) {
  if (!input) return;
  const id = (input.getAttribute("aria-describedby") || "").split(" ").find((x) => x.endsWith("Err") || x.startsWith("e-"));
  const p = id && document.getElementById(id);
  input.setAttribute("aria-invalid", msg ? "true" : "false");
  if (p) { p.hidden = !msg; p.innerHTML = msg ? ic("alert") + esc(msg) : ""; }
}

// Deshabilita el botón mientras la promesa corre (evita el doble envío) y lo devuelve a su estado.
export async function ocupado(boton, promesa) {
  if (!boton) return promesa;
  boton.disabled = true;
  boton.classList.add("is-loading");
  boton.setAttribute("aria-busy", "true");
  try { return await promesa; }
  finally { boton.disabled = false; boton.classList.remove("is-loading"); boton.removeAttribute("aria-busy"); }
}

// El salto de la figura entre módulos (mockup). Sin animación si la persona pidió menos movimiento.
export function hop(desde, hasta, listo) {
  if (reduce || !desde || !hasta) return listo();
  const a = desde.getBoundingClientRect(), b = hasta.getBoundingClientRect();
  if (!a.width || !b.width) return listo();
  const f = document.createElement("div");
  f.className = "hopper";
  f.innerHTML = fig();
  f.style.left = a.left + "px";
  f.style.top = a.top + "px";
  document.body.appendChild(f);
  const dx = b.left - a.left, dy = b.top - a.top;
  f.animate([
    { transform: "translate(0,0) scale(1,1)" },
    { transform: "translate(0,3px) scale(1.12,.84)", offset: 0.16 },
    { transform: `translate(${dx * 0.5 - 34}px,${dy * 0.45}px) scale(.94,1.1)`, offset: 0.55 },
    { transform: `translate(${dx}px,${dy}px) scale(1.1,.86)`, offset: 0.86 },
    { transform: `translate(${dx}px,${dy}px) scale(1,1)` },
  ], { duration: 640, easing: "cubic-bezier(.45,0,.25,1)" }).onfinish = () => { f.remove(); listo(); };
}
