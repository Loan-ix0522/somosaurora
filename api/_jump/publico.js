// Lo público de la página de JUMP (/jump/): la próxima clase, la encuesta y el voto de cualquier visitante.
// Se llama desde api/jump-publico.js con service_role, así que aquí se elige con cuidado qué sale: nada de ejemplos,
// borradores, mensajes, grabaciones ni Zoom; de la encuesta, solo porcentajes.
import { json } from "./http.js";
import { rest } from "./supa.js";
import { huellaIp, huellaDispositivo, esUuid } from "./secretos.js";

export const TOPE_POR_CONEXION = 30; // aparatos distintos por conexión y encuesta: una casa o una feria con el mismo wifi, no un script
const DISPOSITIVO = /^[A-Za-z0-9_-]{16,64}$/;
const EN_VIVO_DESPUES = 30; // min después del fin, como la ventana de Zoom

// Falta la migración 0003: la tabla no existe (PostgREST responde PGRST205; Postgres, 42P01).
async function sinTabla(r) {
  if (r.status !== 404 && r.status !== 400) return false;
  const e = await r.clone().json().catch(() => ({}));
  return ["PGRST205", "42P01"].includes(e.code) || r.status === 404;
}

async function leer(path) {
  const r = await rest(path);
  if (!r.ok) {
    if (await sinTabla(r)) return null;
    throw new Error(`leer ${path.split("?")[0]} ${r.status}`);
  }
  return r.json();
}

// La que está en vivo o la siguiente: suelta o de una mentoría publicada, nunca de ejemplo.
export async function proximaClase(ahora = Date.now()) {
  const desde = new Date(ahora - 24 * 3600e3).toISOString(); // ninguna clase dura un día
  const clases = await leer(`jump_clases?es_ejemplo=eq.false&inicia_en=gte.${encodeURIComponent(desde)}` +
    "&select=titulo,inicia_en,duracion_min,mentoria_id&order=inicia_en&limit=40");
  if (!clases?.length) return null;
  const ids = [...new Set(clases.map((c) => c.mentoria_id).filter(Boolean))];
  const publicadas = new Set(ids.length
    ? (await leer(`jump_mentorias?estado=eq.publicada&id=in.(${ids.join(",")})&select=id`) || []).map((m) => m.id) : []);
  const c = clases.find((x) => (!x.mentoria_id || publicadas.has(x.mentoria_id))
    && Date.parse(x.inicia_en) + ((x.duracion_min || 60) + EN_VIVO_DESPUES) * 60e3 > ahora);
  return c ? { titulo: c.titulo, iniciaEn: c.inicia_en, duracionMin: c.duracion_min } : null;
}

// La encuesta con sus opciones y el porcentaje de cada una (votos públicos e inscritos sumados).
async function armar(e) {
  const opciones = await leer(`jump_encuesta_opciones?encuesta_id=eq.${e.id}&select=id,texto&order=orden,creada_en`) || [];
  const r = await rest("rpc/jump_encuesta_resultados", { method: "POST", body: { p_encuesta: e.id } });
  if (!r.ok) throw new Error(`resultados ${r.status}`);
  const pct = new Map((await r.json()).map((x) => [x.opcion_id, x.porcentaje]));
  return { id: e.id, pregunta: e.pregunta, estado: e.estado, opciones: opciones.map((o) => ({ id: o.id, texto: o.texto, porcentaje: pct.get(o.id) ?? 0 })) };
}

// La abierta; si no hay, la última cerrada; si no, null. Nunca las de ejemplo. Sin la 0003 (no hay tabla), undefined.
export async function encuestaPublica() {
  const campos = "select=id,pregunta,estado";
  const abiertas = await leer(`jump_encuestas?estado=eq.abierta&es_ejemplo=eq.false&${campos}&limit=1`);
  if (!abiertas) return undefined;
  let [e] = abiertas;
  if (!e) [e] = await leer(`jump_encuestas?estado=eq.cerrada&es_ejemplo=eq.false&${campos}&order=cerrada_en.desc.nullslast,creada_en.desc&limit=1`) || [];
  return e ? armar(e) : null;
}

// Las huellas del voto público se borran 30 días después de cerrar la encuesta (lo decide la base). Se pide en cada
// lectura; si falla (o falta la 0003), la página sigue igual.
export async function olvidarHuellas() {
  const r = await rest("rpc/jump_olvidar_huellas", { method: "POST", body: {} }).catch(() => null);
  return !!r?.ok;
}

// La conexión que cuenta para el tope. En IPv6 a cada casa le dan una red /64 entera y el aparato cambia de dirección
// dentro de ella, así que cuenta la red; en IPv4, la dirección.
export function conexion(ip) {
  const s = String(ip ?? "").trim().toLowerCase().split("%")[0];
  if (!s.includes(":")) return s;
  const v4 = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) return v4[1];
  const [a, b = ""] = s.split("::");
  const izq = a ? a.split(":") : [], der = b ? b.split(":") : [];
  const todo = s.includes("::") ? [...izq, ...Array(Math.max(0, 8 - izq.length - der.length)).fill("0"), ...der] : izq;
  return todo.slice(0, 4).map((h) => parseInt(h || "0", 16).toString(16)).join(":") + "::/64";
}

const mal = (campo, error) => json({ ok: false, campo, error }, 400);
const cerrada = () => json({ ok: false, error: "Esta encuesta ya cerró. Recarga la página para ver la de ahora." }, 409);

export async function votarPublico(b, ip) {
  if (!esUuid(b.opcion)) return mal("opcion", "Elige una opción.");
  if (typeof b.dispositivo !== "string" || !DISPOSITIVO.test(b.dispositivo)) return mal("dispositivo", "Recarga la página e intenta de nuevo.");

  // La opción tiene que ser de la encuesta abierta (y no de una de ejemplo).
  const [o] = await leer(`jump_encuesta_opciones?id=eq.${b.opcion}&select=id,encuesta_id`) || [];
  if (!o) return cerrada();
  const [e] = await leer(`jump_encuestas?id=eq.${o.encuesta_id}&estado=eq.abierta&es_ejemplo=eq.false&select=id,pregunta,estado`) || [];
  if (!e) return cerrada();

  // Guardamos huellas (HMAC), nunca el id del aparato ni la IP. El tope y el guardado los hace la base en un paso.
  const [dispositivo_hash, ip_hash] = await Promise.all([huellaDispositivo(b.dispositivo), huellaIp(conexion(ip))]);
  const rv = await rest("rpc/jump_voto_publico", {
    method: "POST", body: { p_opcion: o.id, p_dispositivo: dispositivo_hash, p_ip: ip_hash, p_tope: TOPE_POR_CONEXION },
  });
  if (rv.status === 409) return cerrada(); // la opción se borró justo ahora
  if (!rv.ok) throw new Error(`guardar voto ${rv.status}`);
  const r = await rv.json();
  if (r === "cerrada") return cerrada();
  if (r === "tope") return json({ ok: false, error: "Ya votaron muchas personas desde esta conexión. Intenta desde otra red." }, 429);
  return json({ ok: true, encuesta: await armar(e) });
}
