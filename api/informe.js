// GET /api/informe — Lo que muestra el informe ciudadano (público). Solo conteos: nada personal.
// Vercel Edge Function.
//
// · Si ya hay un informe publicado (automático cada 5 días o manual desde /admin/), devuelve el
//   más reciente, más cuántas opiniones han llegado desde su corte (modo "informe").
// · Si todavía no hay ninguno, la tabla no existe (migración 0007 sin aplicar) o no se pudo
//   leer, cuenta en vivo los últimos 30 días (modo "en-curso"): la página nunca queda vacía.
//
// Lee con la service role porque `submissions` no se puede leer en público (guarda nombres,
// celulares y fotos); por eso mismo aquí no sale nada más que números y fechas.

import { VENTANA_DIAS, MIN_OPINIONES, repartir, proximoInforme } from "./_informe.js";
import { conexion, contar, contarPorTema, ultimoInforme } from "./_informe_db.js";

export const config = { runtime: "edge" };

const json = (obj, status = 200, cache = "no-store", extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": cache, ...extra } });

// Unos minutos en la caché de Vercel, así que una oleada de visitas no golpea la base; el navegador
// vuelve a pedir al minuto. Las cifras se ponen al día solas en cuanto vence.
const CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

const entero = (n) => Math.max(0, Math.trunc(Number(n)) || 0);

export default async function handler(request) {
  if (request.method !== "GET") return json({ ok: false, error: "Método no permitido" }, 405, "no-store", { Allow: "GET" });
  // Sin ?consulta: cada consulta distinta saltaría la caché y mandaría preguntas a la base.
  if (new URL(request.url).search) return json({ ok: false, error: "Solicitud inválida." }, 400);

  const c = conexion();
  if (!c.url || !c.service) return json({ ok: false, error: "No disponible." }, 503);

  let ultimo = null;
  try { ultimo = await ultimoInforme(c); } catch { /* sin tabla o sin lectura: se cuenta en vivo */ }

  try {
    return ultimo ? json(await informePublicado(c, ultimo), 200, CACHE) : json(await enCurso(c), 200, CACHE);
  } catch {
    return json({ ok: false, error: "No se pudo calcular el informe." }, 502);
  }
}

async function informePublicado(c, ultimo) {
  const hasta = new Date(ultimo.periodo_hasta);
  const cuerpo = {
    ok: true,
    modo: "informe",
    origen: ultimo.origen,
    publicado: new Date(ultimo.created_at).toISOString(),
    desde: new Date(ultimo.periodo_desde).toISOString(),
    hasta: hasta.toISOString(),
    total: entero(ultimo.total),
    temas: (Array.isArray(ultimo.por_tema) ? ultimo.por_tema : []).map((t) => ({
      tema: String(t?.tema ?? ""), total: entero(t?.total), porcentaje: entero(t?.porcentaje),
    })),
    proximo: proximoInforme(ultimo).toISOString(),
    minimo: MIN_OPINIONES,
  };
  // Cuántas llegaron desde el corte: solo informativo, así que si falla se omite y el resto sigue.
  try { cuerpo.nuevas = await contar(c, hasta); } catch { /* sin el dato */ }
  return cuerpo;
}

async function enCurso(c) {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - VENTANA_DIAS * 864e5);
  const { total, porTema } = await contarPorTema(c, desde);
  const temas = repartir(porTema, total);
  return {
    ok: true,
    modo: "en-curso",
    ventana_dias: VENTANA_DIAS,
    desde: desde.toISOString(),
    actualizado: ahora.toISOString(),
    total: temas.reduce((a, t) => a + t.total, 0),
    temas,
  };
}
