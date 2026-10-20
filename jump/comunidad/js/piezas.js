// Piezas que comparten las vistas del emprendedor y las del equipo (del mockup aprobado).
import { fig, plural } from "./ui.js";
import { partes, rango, fechaCorta } from "./fechas.js";

export function dateTile(c, cls = "") {
  const p = partes(c.iniciaEn);
  return `<span class="date-tile ${cls}" aria-hidden="true">${p.dow}<b>${p.d}</b>${p.mon}</span>`;
}
export const whenText = (c) => `${fechaCorta(c.iniciaEn)} · ${rango(c.iniciaEn, c.duracionMin)}`;
export const nowPill = '<span class="pill pill-sun pill-now">En vivo ahora</span>';
export const vacio = (titulo, texto, extra = "") => `<div class="panel empty">${fig()}<h3>${titulo}</h3><p>${texto}</p>${extra}</div>`;

export function mMeta(m) {
  const vivo = m.modulos.filter((x) => x.tipo === "vivo").length;
  return plural(m.modulos.length, "módulo", "módulos") + (vivo ? ` · ${vivo} en vivo` : "");
}

export const TIPOS = { pdf: "PDF", xls: "XLS", doc: "DOC", ppt: "PPT", img: "IMG", link: "WEB" };
export function tipoArchivo(f) {
  if (f.tipo === "enlace") return "link";
  const ext = ((/\.([a-z0-9]{1,5})$/i.exec(f.ruta || "") || [])[1] || "").toLowerCase();
  if (ext === "pdf" || f.mime === "application/pdf") return "pdf";
  if (/^xlsx?$/.test(ext)) return "xls";
  if (/^docx?$/.test(ext)) return "doc";
  if (/^pptx?$/.test(ext)) return "ppt";
  if (/^(jpe?g|png|webp)$/.test(ext) || /^image\//.test(f.mime || "")) return "img";
  return "doc";
}
export function tamano(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
export const dominio = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "Enlace"; } };
// Ícono del tipo de archivo, como en el mockup (los PowerPoint usan el color de los documentos).
export const ftype = (f) => { const k = tipoArchivo(f); return `<span class="ftype ${k === "ppt" ? "doc" : k}">${TIPOS[k]}</span>`; };
