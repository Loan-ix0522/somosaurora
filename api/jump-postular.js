// POST /api/jump-postular — formulario «Postula» de la página de JUMP (/jump/). Público: no pide sesión.
// Vercel Edge Function. Solo desde este mismo sitio; valida, frena envíos repetidos y guarda con service_role.
import { json, leerJson, mismoOrigen } from "./_jump/http.js";
import { supa } from "./_jump/env.js";
import { postular } from "./_jump/postulaciones.js";

export const config = { runtime: "edge" };

const ipDe = (request) => (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "").split(",")[0].trim();

export default async function handler(request) {
  if (request.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405);
  if (!mismoOrigen(request)) return json({ ok: false, error: "No permitido." }, 403);
  const { url, service } = supa();
  if (!url || !service) return json({ ok: false, error: "Las postulaciones todavía no están abiertas." }, 503);
  const body = await leerJson(request, 4096);
  if (!body) return json({ ok: false, error: "Solicitud no válida." }, 400);
  try {
    return await postular(body, ipDe(request));
  } catch (e) {
    console.error("[jump-postular]", e && e.message);
    return json({ ok: false, error: "No se pudo enviar. Intenta de nuevo en unos minutos." }, 500);
  }
}
