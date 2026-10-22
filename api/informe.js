// GET /api/informe — Lo que muestra el informe ciudadano (público). Solo porcentajes y fechas: ni cantidades ni nada personal.
// Vercel Edge Function.
//
// · Si ya hay un informe publicado (automático cada 5 días o manual desde /admin/), devuelve el
//   más reciente (modo "informe").
// · Si todavía no hay ninguno o la tabla no existe (migración 0007 sin aplicar), cuenta en vivo
//   los últimos 30 días (modo "en-curso"): la página nunca queda vacía.
//
// Lee con la service role porque `submissions` no se puede leer en público (guarda nombres,
// celulares y fotos); por eso mismo aquí solo sale el porcentaje de cada tema y fechas: nunca cuántas opiniones hay.

import { VENTANA_DIAS, repartir, proximoInforme } from "./_informe.js";
import { conexion, contarPorTema, ultimoInforme } from "./_informe_db.js";

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

  try {
    // Sin tabla (migración 0007 sin aplicar) o sin ningún informe: se cuenta en vivo. Cualquier otro fallo de
    // lectura es un error: con un informe publicado, decir «todavía no hay informe» sería falso.
    let ultimo = null;
    try { ultimo = await ultimoInforme(c); } catch (e) { if (!e?.sinTabla) throw e; }
    return ultimo ? json(informePublicado(ultimo), 200, CACHE) : json(await enCurso(c), 200, CACHE);
  } catch {
    return json({ ok: false, error: "No se pudo calcular el informe." }, 502);
  }
}

// Lo que sale en público: el porcentaje de cada tema y, aparte, los temas que no tienen ninguna opinión.
// Nunca cantidades (ni el total ni por tema). Un tema con algunas opiniones pero menos del 1 % no tiene
// tarjeta, y tampoco se dice que no tiene opiniones.
function publico(filas) {
  return {
    temas: filas.filter((t) => t.porcentaje > 0).map((t) => ({ tema: t.tema, porcentaje: t.porcentaje })),
    sin_opiniones: filas.filter((t) => t.total === 0).map((t) => t.tema),
  };
}

function informePublicado(ultimo) {
  const filas = (Array.isArray(ultimo.por_tema) ? ultimo.por_tema : []).map((t) => ({
    tema: String(t?.tema ?? ""), total: entero(t?.total), porcentaje: entero(t?.porcentaje),
  }));
  return {
    ok: true,
    modo: "informe",
    origen: ultimo.origen,
    publicado: new Date(ultimo.created_at).toISOString(),
    desde: new Date(ultimo.periodo_desde).toISOString(),
    hasta: new Date(ultimo.periodo_hasta).toISOString(),
    ...publico(filas),
    proximo: proximoInforme(ultimo).toISOString(),
  };
}

async function enCurso(c) {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - VENTANA_DIAS * 864e5);
  const { total, porTema } = await contarPorTema(c, desde);
  return {
    ok: true,
    modo: "en-curso",
    ventana_dias: VENTANA_DIAS,
    desde: desde.toISOString(),
    actualizado: ahora.toISOString(),
    ...publico(repartir(porTema, total)),
  };
}
