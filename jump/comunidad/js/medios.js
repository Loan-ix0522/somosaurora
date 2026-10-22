// Videos incrustados, archivo de calendario de una clase y fotos reducidas antes de subirlas.

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

// Solo YouTube (sin cookies) y Vimeo. Cualquier otra cosa → null (la vista muestra "Video pendiente").
export function embedVideo(url) {
  let u;
  try { u = new URL(String(url ?? "")); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase(), partes = u.pathname.split("/").filter(Boolean);
  let id = null;
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    if (partes[0] === "watch") id = u.searchParams.get("v");
    else if (partes[0] === "shorts" || partes[0] === "embed") id = partes[1];
    return id && YT_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtu.be") return YT_ID.test(partes[0] || "") ? `https://www.youtube-nocookie.com/embed/${partes[0]}` : null;
  if (host === "vimeo.com" || host === "www.vimeo.com") {
    if (!/^\d+$/.test(partes[0] || "")) return null;
    const h = partes[1] && /^[0-9a-f]{6,20}$/i.test(partes[1]) ? `?h=${partes[1]}` : "";
    return `https://player.vimeo.com/video/${partes[0]}${h}`;
  }
  if (host === "player.vimeo.com" && partes[0] === "video" && /^\d+$/.test(partes[1] || "")) {
    const h = u.searchParams.get("h");
    return `https://player.vimeo.com/video/${partes[1]}${h && /^[0-9a-f]{6,20}$/i.test(h) ? `?h=${h}` : ""}`;
  }
  return null;
}

const utc = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const textoIcs = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");

export function icsDeClase({ id, titulo, iniciaEn, duracionMin }) {
  const ini = Date.parse(iniciaEn), fin = ini + (duracionMin || 60) * 60e3;
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Comunidad JUMP//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${id || crypto.randomUUID()}@comunidad-jump`,
    `DTSTAMP:${utc(Date.now())}`,
    `DTSTART:${utc(ini)}`,
    `DTEND:${utc(fin)}`,
    `SUMMARY:${textoIcs(titulo)}`,
    `DESCRIPTION:${textoIcs("Clase en vivo de la Comunidad JUMP. El enlace de Zoom se abre 15 minutos antes dentro de la comunidad.")}`,
    "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", `DESCRIPTION:${textoIcs(titulo)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}

// Reduce la foto (máx. `max` px por lado) y la vuelve a codificar: quita los metadatos (GPS incluido).
// WebP a calidad 0.82; si el navegador no sabe codificar WebP, JPEG.
export async function reducirFoto(file, max = 1600) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error("foto_ilegible"); }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const lienzo = document.createElement("canvas");
  lienzo.width = w; lienzo.height = h;
  lienzo.getContext("2d").drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const como = (tipo, q) => new Promise((ok) => lienzo.toBlob(ok, tipo, q));
  let blob = await como("image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await como("image/jpeg", 0.85);
  if (!blob) throw new Error("foto_ilegible");
  return blob;
}

// ---------- imágenes del material y espacio usado ----------

// Las imágenes que se adjuntan como material se reducen igual que las fotos (mismas reglas de reducirFoto).
export const esImagenReducible = (tipo) => /^image\/(jpeg|png|webp)$/.test(tipo || "");

// Tras reducir la imagen cambia el formato, así que el nombre que se guarda y se muestra cambia de extensión.
export function nombreReducido(nombre, mime) {
  const base = String(nombre ?? "").trim().replace(/\.(jpe?g|png|webp)$/i, "").trim() || "Imagen";
  return `${base}.${mime === "image/webp" ? "webp" : "jpg"}`;
}

// El plan gratis de Supabase da 1 GB de archivos por proyecto.
export const LIMITE_ALMACENAMIENTO = 1024 ** 3;

// Cuánto material hay subido: solo cuentan los archivos (los enlaces no ocupan espacio).
export function sumarMaterial(filas) {
  let archivos = 0, bytes = 0;
  for (const f of filas || []) {
    if (f?.tipo !== "archivo") continue;
    archivos++;
    bytes += Number(f.bytes) || 0;
  }
  return { archivos, bytes };
}

// Porcentaje usado (algo usado nunca se ve como 0 %, y nunca pasa de 100) y el aviso que le toca.
export function resumenAlmacenamiento(bytes, limite = LIMITE_ALMACENAMIENTO) {
  let porcentaje = Math.min(100, Math.round((bytes / limite) * 100));
  if (bytes > 0 && porcentaje < 1) porcentaje = 1;
  return { porcentaje, nivel: porcentaje >= 90 ? "lleno" : porcentaje >= 70 ? "atencion" : "ok" };
}

