// /api/jump-publico — lo público de la página de JUMP (/jump/). No pide sesión.
//   GET  → la próxima clase y la encuesta (con porcentajes) y si existen las encuestas (hayEncuestas: falta la 0003).
//          Caché corto en la red de Vercel, no en el navegador: la página tiene tráfico público.
//   POST → el voto de un visitante: { opcion, dispositivo }. Solo desde este mismo sitio, con tope por conexión.
// Vercel Edge Function; lee y guarda con service_role (api/_jump/publico.js decide qué sale).
import { json, leerJson, mismoOrigen } from "./_jump/http.js";
import { supa } from "./_jump/env.js";
import { proximaClase, encuestaPublica, olvidarHuellas, votarPublico } from "./_jump/publico.js";

export const config = { runtime: "edge" };

const ipDe = (request) => (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "").split(",")[0].trim();

async function leerTodo() {
  const [clase, encuesta] = await Promise.all([proximaClase(), encuestaPublica(), olvidarHuellas()]);
  // Vercel-CDN-Cache-Control solo lo usa la red de Vercel (no llega al navegador); el navegador siempre vuelve a pedir.
  return new Response(JSON.stringify({ clase, encuesta: encuesta ?? null, hayEncuestas: encuesta !== undefined }), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache", "Vercel-CDN-Cache-Control": "max-age=30, stale-while-revalidate=60" },
  });
}

export default async function handler(request) {
  if (request.method !== "GET" && request.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405);
  const { url, service } = supa();
  if (request.method === "GET") {
    if (!url || !service) return json({ clase: null, encuesta: null }, 503);
    try {
      return await leerTodo();
    } catch (e) {
      console.error("[jump-publico]", e && e.message);
      return json({ clase: null, encuesta: null }, 500);
    }
  }
  if (!mismoOrigen(request)) return json({ ok: false, error: "No permitido." }, 403);
  if (!url || !service) return json({ ok: false, error: "Las encuestas todavía no están abiertas." }, 503);
  const body = await leerJson(request, 1024);
  if (!body) return json({ ok: false, error: "Solicitud no válida." }, 400);
  try {
    return await votarPublico(body, ipDe(request));
  } catch (e) {
    console.error("[jump-publico]", e && e.message);
    return json({ ok: false, error: "No se pudo guardar tu voto. Intenta de nuevo en unos minutos." }, 500);
  }
}
