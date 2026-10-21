// GET /api/informe — Porcentajes del informe ciudadano, calculados en vivo con las opiniones
// reales de los últimos 30 días (público). Solo devuelve conteos por tema: nada personal.
// Vercel Edge Function. Lee `submissions` con la service role porque esa tabla no se puede leer
// en público (guarda nombres, celulares y fotos); por eso mismo aquí no sale nada más que números.

import { TEMAS, VENTANA_DIAS, repartir } from "./_informe.js";

export const config = { runtime: "edge" };

const json = (obj, status = 200, cache = "no-store", extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": cache, ...extra } });

// Unos minutos en la caché de Vercel, así que una oleada de visitas no golpea la base; el navegador
// vuelve a pedir al minuto. Las cifras se ponen al día sola en cuanto vence.
const CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

export default async function handler(request) {
  if (request.method !== "GET") return json({ ok: false, error: "Método no permitido" }, 405, "no-store", { Allow: "GET" });
  // Sin ?consulta: cada consulta distinta saltaría la caché y mandaría 9 preguntas a la base.
  if (new URL(request.url).search) return json({ ok: false, error: "Solicitud inválida." }, 400);

  // Acepta tanto los nombres estándar como los que quedaron puestos en Vercel.
  const env = process.env;
  const SUPA_URL = env.SUPABASE_URL || env.ProjectURL || "";
  const SUPA_SERVICE = env.SUPABASE_SERVICE_ROLE_KEY || env.service_role || "";
  if (!SUPA_URL || !SUPA_SERVICE) return json({ ok: false, error: "No disponible." }, 503);

  const ahora = new Date();
  const desde = new Date(ahora.getTime() - VENTANA_DIAS * 864e5).toISOString();
  const headers = { apikey: SUPA_SERVICE, Authorization: `Bearer ${SUPA_SERVICE}`, Prefer: "count=exact" };

  // Solo se pide el CONTEO (HEAD): ninguna fila sale de la base.
  async function contar(tema) {
    const url = `${SUPA_URL}/rest/v1/submissions?select=id&created_at=gte.${encodeURIComponent(desde)}` +
      (tema ? `&tema=eq.${encodeURIComponent(tema)}` : "");
    const r = await fetch(url, { method: "HEAD", headers });
    if (!r.ok) throw new Error("conteo");
    const m = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
    if (!m) throw new Error("conteo");
    return Number(m[1]);
  }

  try {
    const [total, ...cuentas] = await Promise.all([contar(null), ...TEMAS.map(contar)]);
    const porTema = Object.fromEntries(TEMAS.map((t, i) => [t, cuentas[i]]));
    const temas = repartir(porTema, total);
    return json({
      ok: true,
      ventana_dias: VENTANA_DIAS,
      desde,
      actualizado: ahora.toISOString(),
      total: temas.reduce((a, t) => a + t.total, 0),
      temas,
    }, 200, CACHE);
  } catch {
    return json({ ok: false, error: "No se pudo calcular el informe." }, 502);
  }
}
