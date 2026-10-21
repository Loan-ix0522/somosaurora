// Acceso a la base para el informe ciudadano (lo comparten /api/informe, /api/informe-auto e
// /api/informe-admin). Todo con la service role, que vive solo en variables de Vercel: las
// opiniones no se pueden leer en público (guardan nombres, celulares y fotos), así que aquí solo
// se CUENTAN (HEAD + count=exact) y nunca sale una fila de `submissions`.
// (El guion bajo del nombre hace que Vercel no lo publique como una ruta /api/.)

import { TEMAS } from "./_informe.js";

// Acepta tanto los nombres estándar como los que quedaron puestos en Vercel.
export function conexion(env = process.env) {
  return {
    url: env.SUPABASE_URL || env.ProjectURL || "",
    service: env.SUPABASE_SERVICE_ROLE_KEY || env.service_role || "",
    anon: env.SUPABASE_ANON_KEY || env.anonpublic || "",
  };
}

const cabeceras = (c) => ({ apikey: c.service, Authorization: `Bearer ${c.service}` });

// Cuántas opiniones hay con created_at en [desde, hasta) (hasta es opcional) y, si se pide, de un tema.
// El corte es cerrado abajo y abierto arriba: el siguiente periodo arranca justo donde termina
// este, así ninguna opinión se cuenta dos veces ni se queda sin contar.
export async function contar(c, desde, hasta, tema) {
  let url = `${c.url}/rest/v1/submissions?select=id&created_at=gte.${encodeURIComponent(desde.toISOString())}`;
  if (hasta) url += `&created_at=lt.${encodeURIComponent(hasta.toISOString())}`;
  if (tema) url += `&tema=eq.${encodeURIComponent(tema)}`;
  const r = await fetch(url, { method: "HEAD", headers: { ...cabeceras(c), Prefer: "count=exact" } });
  if (!r.ok) throw new Error("conteo");
  const m = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
  if (!m) throw new Error("conteo");
  return Number(m[1]);
}

// El total y uno por cada tema del formulario (9 preguntas en paralelo).
export async function contarPorTema(c, desde, hasta) {
  const [total, ...cuentas] = await Promise.all([contar(c, desde, hasta), ...TEMAS.map((t) => contar(c, desde, hasta, t))]);
  return { total, porTema: Object.fromEntries(TEMAS.map((t, i) => [t, cuentas[i]])) };
}

// El informe publicado más recientemente, o null si todavía no hay ninguno.
// Si la tabla no existe (migración 0007 sin aplicar) lanza un error con `sinTabla = true`.
export async function ultimoInforme(c) {
  const r = await fetch(
    `${c.url}/rest/v1/informe_publico?select=id,created_at,origen,periodo_desde,periodo_hasta,total,por_tema&order=created_at.desc&limit=1`,
    { headers: cabeceras(c) });
  if (r.status === 404) throw Object.assign(new Error("sin tabla"), { sinTabla: true });
  if (!r.ok) throw new Error("lectura");
  const filas = await r.json();
  return Array.isArray(filas) && filas[0] ? filas[0] : null;
}

// Guarda un informe (la fila que arma armarFila). Devuelve la fila guardada.
export async function guardarInforme(c, fila) {
  const r = await fetch(`${c.url}/rest/v1/informe_publico`, {
    method: "POST",
    headers: { ...cabeceras(c), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(fila),
  });
  if (r.status === 404) throw Object.assign(new Error("sin tabla"), { sinTabla: true });
  if (!r.ok) throw new Error("escritura");
  const filas = await r.json();
  return Array.isArray(filas) ? filas[0] : filas;
}
