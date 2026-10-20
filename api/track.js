// POST /api/track — Contador de visitas de la web pública (Vercel Edge Function).
//
// Lo llama /visitas.js en cada página pública con { path, vid, ref }. Guarda una fila en
// `visitas` (migración 0006) y responde 204 SIEMPRE: es un aviso, nunca debe molestar a
// quien visita ni contarle nada a quien llama.
//
// Guarda la página, la IP, la ciudad y el país aproximados (los da Vercel), el tipo de aparato,
// el dominio del que llegó y un código anónimo del navegador. La IP se borra a los 30 días
// (/api/purge). Solo acepta llamadas desde este mismo sitio. La SERVICE_ROLE_KEY vive solo en el servidor.

import { esBot, dispositivo, limpiarRuta, esPanel, procedencia, pais, ip, ciudad, visitante } from "./_visitas.js";

export const config = { runtime: "edge" };

const MAX_BODY = 2048;
const CLAVES = ["path", "vid", "ref"];

const listo = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

// Mismo sitio: Origin con nuestro host o, si el navegador no lo manda, Sec-Fetch-Site = same-origin.
function mismoSitio(request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}

export default async function handler(request) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!mismoSitio(request)) return listo();

  try {
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY) return listo();
    const texto = await request.text();
    if (texto.length > MAX_BODY) return listo();
    let body;
    try { body = JSON.parse(texto); } catch { return listo(); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((k) => !CLAVES.includes(k))) return listo();

    const ruta = limpiarRuta(body.path);
    if (!ruta || esPanel(ruta)) return listo();
    const ua = request.headers.get("user-agent");
    if (esBot(ua)) return listo();

    const env = process.env;
    // Acepta tanto los nombres estándar como los que quedaron puestos en Vercel.
    const SUPA_URL = env.SUPABASE_URL || env.ProjectURL || "";
    const SUPA_SERVICE = env.SUPABASE_SERVICE_ROLE_KEY || env.service_role || "";
    if (!SUPA_URL || !SUPA_SERVICE) return listo();

    await fetch(`${SUPA_URL}/rest/v1/rpc/registrar_visita`, {
      method: "POST",
      headers: { apikey: SUPA_SERVICE, Authorization: `Bearer ${SUPA_SERVICE}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_ruta: ruta,
        p_visitante: visitante(body.vid),
        p_pais: pais(request.headers),
        p_dispositivo: dispositivo(ua),
        p_procedencia: procedencia(body.ref, new URL(request.url).host),
        p_ip: ip(request.headers),
        p_ciudad: ciudad(request.headers),
      }),
    });
  } catch {
    // Es un contador: si algo falla, la visita simplemente no se cuenta.
  }
  return listo();
}
