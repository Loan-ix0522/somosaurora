// Ayudas del contador de visitas (para /api/track). Funciones puras: sin red ni base de datos.
// (El guion bajo del nombre hace que Vercel no lo publique como una ruta /api/.)

// Rastreadores conocidos: no se cuentan como visitas. vercel.json ya frena a muchos antes de llegar aquí.
const BOT = /(bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|vkshare|whatsapp|telegram|discord|slack|linkedin|twitter|applebot|petal|semrush|ahrefs|mj12|dataforseo|screaming frog|headless|phantomjs|python|curl\/|wget|go-http-client|axios|node-fetch|lighthouse|gtmetrix|pingdom|uptimerobot|monitor)/i;

export const esBot = (ua) => typeof ua !== "string" || !ua || BOT.test(ua);

// Tipo de aparato, a grandes rasgos.
export function dispositivo(ua) {
  const s = String(ua || "").toLowerCase();
  if (!s) return null;
  if (/ipad|tablet|playbook|silk|android(?!.*mobile)/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/.test(s)) return "movil";
  return "escritorio";
}

// Solo la ruta de la página: sin ?consulta ni #ancla, sin caracteres raros. null si no sirve.
export function limpiarRuta(p) {
  if (typeof p !== "string") return null;
  let s = p.trim();
  const corte = s.search(/[?#]/);
  if (corte !== -1) s = s.slice(0, corte);
  if (!s.startsWith("/") || /[\x00-\x1f\x7f]/.test(s)) return null;
  s = s.replace(/[<>"'`\\]/g, "").slice(0, 200);
  return s === "/index.html" ? "/" : s;
}

// El panel no se cuenta como visita.
export const esPanel = (ruta) => /^\/admin(\/|\.html|$)/i.test(ruta);

// Dominio del sitio del que llegó (sin ruta ni consulta). Si llegó desde este mismo sitio, no es procedencia.
export function procedencia(ref, hostPropio) {
  if (typeof ref !== "string" || !ref) return null;
  try {
    const h = new URL(ref).host.toLowerCase();
    return h && h !== String(hostPropio || "").toLowerCase() ? h.slice(0, 120) : null;
  } catch {
    return null;
  }
}

// País aproximado (código de 2 letras) que pone Vercel.
export function pais(headers) {
  const c = String(headers.get("x-vercel-ip-country") || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

// IP de la conexión (la misma que usa /api/submit). La base la borra a los 30 días. null si no parece una IP.
export function ip(headers) {
  const v = (headers.get("x-forwarded-for") || headers.get("x-real-ip") || "").split(",")[0].trim();
  return v.length <= 45 && (/^\d{1,3}(\.\d{1,3}){3}$/.test(v) || /^[0-9a-f:.]+$/i.test(v) && v.includes(":")) ? v : null;
}

// Ciudad aproximada que pone Vercel (viene codificada para URL, p. ej. "Samborond%C3%B3n").
export function ciudad(headers) {
  const raw = headers.get("x-vercel-ip-city");
  if (!raw) return null;
  try {
    const c = decodeURIComponent(raw).replace(/[\x00-\x1f\x7f<>"'`\\]/g, "").trim();
    return c && c.length <= 80 ? c : null;
  } catch {
    return null;
  }
}

// Código anónimo que genera el navegador (o null).
export const visitante = (v) => (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);
