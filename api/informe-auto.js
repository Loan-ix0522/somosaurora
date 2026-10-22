// GET /api/informe-auto — Publica solo el informe ciudadano (Vercel Cron, una vez al día).
// Cada 5 días, si llegaron al menos 10 opiniones nuevas desde el informe anterior, cuenta por
// tema las de ese periodo y guarda un informe nuevo en `informe_publico` (migración 0007).
// Si llegaron pocas, no hace nada: se mantiene el informe que ya está y el periodo sigue
// sumando hasta que alcancen. El informe manual de /admin/ también reinicia el reloj de 5 días.
//
// Seguridad: exige `Authorization: Bearer <CRON_SECRET>` (Vercel lo envía solo cuando la variable
// CRON_SECRET existe en el proyecto, la misma de /api/purge). Sin secreto configurado no hace nada.
// Solo cuenta (no lee textos) y guarda conteos: nada personal.
//
// Prueba sin guardar:  GET /api/informe-auto?dry=1  (con el mismo encabezado).

import { MIN_OPINIONES, armarFila, decidir, desdeDelPeriodo, proximoInforme, tocaPublicar } from "./_informe.js";
import { conexion, contarPorTema, guardarInforme, ultimoInforme } from "./_informe_db.js";

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method !== "GET") return json({ ok: false, error: "Método no permitido." }, 405);
  const secreto = process.env.CRON_SECRET || "";
  if (secreto.length < 16) return json({ ok: false, error: "CRON_SECRET no está configurado." }, 503);
  if (!sameString(request.headers.get("authorization") || "", `Bearer ${secreto}`)) return json({ ok: false, error: "No autorizado." }, 401);
  const c = conexion();
  if (!c.url || !c.service) return json({ ok: false, error: "Falta la conexión a la base de datos." }, 500);
  const dry = new URL(request.url).searchParams.get("dry") === "1";

  const ahora = new Date();
  let ultimo;
  try { ultimo = await ultimoInforme(c); }
  catch (e) {
    return json({ ok: false, error: e?.sinTabla ? "Falta aplicar la migración 0007_informe_publico.sql." : "No se pudo calcular el informe." }, 500);
  }

  // Todavía no toca: ni se cuenta (ahorra 9 consultas al día).
  if (!tocaPublicar(ultimo, ahora)) {
    return resultado({ ok: true, publicado: false, motivo: "aun-no-toca", proximo: proximoInforme(ultimo).toISOString() });
  }

  try {
    const desde = desdeDelPeriodo(ultimo, ahora);
    const { total, porTema } = await contarPorTema(c, desde, ahora);
    const d = decidir(ultimo, ahora, total);
    if (d.accion === "mantener") {
      return resultado({ ok: true, publicado: false, motivo: d.motivo, nuevas: total, minimo: MIN_OPINIONES });
    }
    const fila = armarFila("automatico", desde, ahora, porTema, total);
    if (dry) return resultado({ ok: true, dry: true, publicaria: true, total: fila.total, desde: fila.periodo_desde, hasta: fila.periodo_hasta });
    try { await guardarInforme(c, fila); }
    catch { return resultado({ ok: false, error: "No se pudo guardar el informe." }, 500); }
    return resultado({ ok: true, publicado: true, origen: fila.origen, total: fila.total, desde: fila.periodo_desde, hasta: fila.periodo_hasta });
  } catch {
    return resultado({ ok: false, error: "No se pudo calcular el informe." }, 500);
  }
}

// Bitácora de Vercel (solo conteos) + respuesta.
function resultado(obj, status = 200) {
  console.log(JSON.stringify({ informe_auto: obj }));
  return json(obj, status);
}

// Comparación sin salida temprana (evita filtrar el secreto por tiempos).
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
