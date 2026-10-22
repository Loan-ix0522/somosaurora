// POST /api/informe-admin — Informe manual del panel /admin/ (pestaña «Informe público»).
// Vercel Edge Function. Body: { accion: "calcular" | "publicar", desde: "AAAA-MM-DD", hasta: "AAAA-MM-DD" }.
//
//  · calcular → cuenta por tema las opiniones de ese rango y devuelve los porcentajes (vista previa).
//  · publicar → hace lo mismo y lo guarda en `informe_publico` como informe «manual»: desde ese
//    momento es el que ve el público, y el siguiente automático sale 5 días después de su corte.
//
// Seguridad: solo admins. El panel manda la sesión del admin (`Authorization: Bearer <token>`) y aquí se
// confirma con la función is_admin() de la base, con ese mismo token (la misma regla que protege las
// opiniones). Solo desde este mismo sitio. Del navegador solo llegan las fechas: las cifras las cuenta el
// servidor con la service role, que vive solo en variables de Vercel. Nada personal sale ni se guarda.

import { armarFila, rangoManual, repartir } from "./_informe.js";
import { conexion, contarPorTema, guardarInforme } from "./_informe_db.js";

export const config = { runtime: "edge" };

const MAX_BODY = 1024;
const CLAVES = ["accion", "desde", "hasta"];

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
const error = (mensaje, status) => json({ ok: false, error: mensaje }, status);

// Mismo sitio: Origin con nuestro host o, si el navegador no lo manda, Sec-Fetch-Site = same-origin.
function mismoSitio(request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}

// ¿La sesión es de un admin? Se lo pregunta a la base con el token de quien llama.
// Devuelve "si" | "no" (sesión válida pero no admin) | "invalida" | "error".
async function verificarAdmin(c, token) {
  try {
    const r = await fetch(`${c.url}/rest/v1/rpc/is_admin`, {
      method: "POST",
      headers: { apikey: c.anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (r.status === 401 || r.status === 403) return "invalida";
    if (!r.ok) return "error";
    return (await r.json()) === true ? "si" : "no";
  } catch { return "error"; }
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405, { Allow: "POST" });
  if (!mismoSitio(request)) return error("No permitido.", 403);

  const c = conexion();
  if (!c.url || !c.service || !c.anon) return error("No disponible.", 503);

  const token = /^Bearer (\S{1,4096})$/.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) return error("Inicia sesión de nuevo.", 401);
  const acceso = await verificarAdmin(c, token);
  if (acceso === "invalida") return error("Inicia sesión de nuevo.", 401);
  if (acceso === "no") return error("Solo para administradores.", 403);
  if (acceso !== "si") return error("No se pudo verificar la sesión.", 503);

  let cuerpo;
  try {
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY) return error("Solicitud inválida.", 400);
    const texto = await request.text();
    if (texto.length > MAX_BODY) return error("Solicitud inválida.", 400);
    cuerpo = JSON.parse(texto);
  } catch { return error("Solicitud inválida.", 400); }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)
      || Object.keys(cuerpo).length !== CLAVES.length || !CLAVES.every((k) => k in cuerpo)
      || !["calcular", "publicar"].includes(cuerpo.accion)) return error("Solicitud inválida.", 400);

  let rango;
  try { rango = rangoManual(cuerpo.desde, cuerpo.hasta, new Date()); }
  catch (e) { return error(e.message, 400); }

  let conteo;
  try { conteo = await contarPorTema(c, rango.desde, rango.hasta); }
  catch { return error("No se pudo calcular el informe.", 500); }

  if (cuerpo.accion === "calcular") {
    const temas = repartir(conteo.porTema, conteo.total);
    return json({ ok: true, accion: "calcular", desde: rango.desde.toISOString(), hasta: rango.hasta.toISOString(), total: temas.reduce((a, t) => a + t.total, 0), temas });
  }

  let fila;
  try { fila = armarFila("manual", rango.desde, rango.hasta, conteo.porTema, conteo.total); }
  catch { return error("No hay opiniones en ese periodo: no se publica un informe vacío.", 400); }
  try { await guardarInforme(c, fila); }
  catch (e) { return error(e?.sinTabla ? "Falta aplicar la migración 0007_informe_publico.sql." : "No se pudo guardar el informe.", 500); }
  console.log(JSON.stringify({ informe_manual: { desde: fila.periodo_desde, hasta: fila.periodo_hasta, total: fila.total } }));
  return json({ ok: true, accion: "publicar", publicado: true, total: fila.total, desde: fila.periodo_desde, hasta: fila.periodo_hasta });
}
