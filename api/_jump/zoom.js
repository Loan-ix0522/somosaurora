// Zoom por OAuth (app "General", user-managed): cliente, tokens cifrados en jump_zoom y acciones del equipo.
// Los tokens nunca salen del servidor; el navegador solo ve email y nombre de la cuenta conectada.
import { json } from "./http.js";
import { rest, bitacora } from "./supa.js";
import { zoomCfg, publicUrl } from "./env.js";
import { cifrar, descifrar, firmar, esUuid } from "./secretos.js";

const OAUTH = "https://zoom.us/oauth";
const API = "https://api.zoom.us/v2";
export const ZONA = "America/Guayaquil";
export const COOKIE_NONCE = "jump_zoom_nonce";
export const RUTA_CALLBACK = "/api/jump-zoom-callback";

// Zoom rechazó el refresh token (revocado o vencido): hay que volver a conectar.
export class ZoomDesconectado extends Error {}

const basic = (cfg) => "Basic " + btoa(`${cfg.id}:${cfg.secret}`);
export const redirectUri = () => publicUrl() + RUTA_CALLBACK;

export function urlAutorizacion(state) {
  const q = new URLSearchParams({ response_type: "code", client_id: zoomCfg().id, redirect_uri: redirectUri(), state });
  return `${OAUTH}/authorize?${q}`;
}

async function pedirToken(params) {
  const cfg = zoomCfg();
  if (!cfg) throw new Error("zoom sin configurar");
  const r = await fetch(`${OAUTH}/token`, {
    method: "POST",
    headers: { Authorization: basic(cfg), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!r.ok) {
    if (params.grant_type === "refresh_token" && (r.status === 400 || r.status === 401)) throw new ZoomDesconectado(`refresh ${r.status}`);
    throw new Error(`zoom token ${r.status}`);
  }
  const t = await r.json();
  if (!t.access_token || !t.refresh_token) throw new Error("zoom token incompleto");
  return { access: t.access_token, refresh: t.refresh_token, expiraEn: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString() };
}

export const canjear = (code) => pedirToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
export const refrescar = (refresh) => pedirToken({ grant_type: "refresh_token", refresh_token: refresh });

// Nunca falla: si Zoom no responde, igual seguimos (desconectar, cambiar de cuenta).
export async function revocar(token) {
  const cfg = zoomCfg();
  if (!cfg || !token) return;
  try {
    await fetch(`${OAUTH}/revoke`, {
      method: "POST",
      headers: { Authorization: basic(cfg), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch { /* sin efecto */ }
}

export async function yoZoom(access) {
  const r = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${access}` } });
  if (!r.ok) throw new Error(`zoom users/me ${r.status}`);
  const u = await r.json();
  if (!u.id) throw new Error("zoom users/me sin id");
  const nombre = [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.display_name || null;
  return { id: String(u.id), email: u.email || null, nombre };
}

// "2026-10-22T19:00:00" en hora de Guayaquil (sin Z), como lo pide Zoom junto a `timezone`.
export function horaLocal(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

export async function crearReunion(access, { tema, iniciaEn, duracionMin }) {
  const r = await fetch(`${API}/users/me/meetings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: String(tema).slice(0, 200), type: 2, start_time: horaLocal(iniciaEn), duration: duracionMin, timezone: ZONA,
      settings: { waiting_room: true, join_before_host: false },
    }),
  });
  if (!r.ok) throw new Error(`zoom crear reunión ${r.status}`);
  const m = await r.json();
  if (!/^https:\/\/([a-z0-9-]+\.)?zoom\.us\//.test(m.join_url || "")) throw new Error("zoom join_url inesperado");
  return { meetingId: String(m.id), joinUrl: m.join_url, passcode: m.password || null };
}

export async function leerConexion() {
  const r = await rest("jump_zoom?id=eq.true&select=*");
  if (!r.ok) throw new Error(`leer jump_zoom ${r.status}`);
  return (await r.json())[0] || null;
}

export async function guardarConexion(fila) {
  const r = await rest("jump_zoom?on_conflict=id", { method: "POST", body: { id: true, ...fila }, prefer: "resolution=merge-duplicates,return=minimal" });
  if (!r.ok) throw new Error(`guardar jump_zoom ${r.status}`);
}

async function borrarConexion(filtro = "") {
  const r = await rest(`jump_zoom?id=eq.true${filtro}`, { method: "DELETE", prefer: "return=minimal" });
  if (!r.ok) throw new Error(`borrar jump_zoom ${r.status}`);
}
export const borrarConexionDe = (zoomUserId) => borrarConexion(`&zoom_user_id=eq.${encodeURIComponent(zoomUserId)}`);

const intentar = async (sobre) => { try { return sobre ? await descifrar(sobre) : null; } catch { return null; } };

export async function revocarConexion(fila) {
  await revocar(await intentar(fila.access_token_cifrado));
  await revocar(await intentar(fila.refresh_token_cifrado));
}

// Access token listo para usar, o null si no hay cuenta conectada. Refresca si vence en menos de 60 s
// y guarda el refresh nuevo (Zoom lo rota en cada uso).
export async function accesoVigente() {
  const f = await leerConexion();
  if (!f) return null;
  if (f.access_token_cifrado && f.expira_en && new Date(f.expira_en).getTime() - Date.now() > 60e3) return descifrar(f.access_token_cifrado);
  const t = await refrescar(await descifrar(f.refresh_token_cifrado));
  const r = await rest("jump_zoom?id=eq.true", {
    method: "PATCH", prefer: "return=minimal",
    body: { refresh_token_cifrado: await cifrar(t.refresh), access_token_cifrado: await cifrar(t.access), expira_en: t.expiraEn },
  });
  if (!r.ok) throw new Error(`guardar refresh ${r.status}`);
  return t.access;
}

// ---- Acciones de /api/jump-admin ----------------------------------------------------------

async function estado() {
  const f = await leerConexion();
  return json({ ok: true, configurada: !!zoomCfg(), conectada: !!f,
    ...(f ? { email: f.email, nombre: f.nombre, conectadaEn: f.conectada_en } : {}) });
}

async function iniciar(ctx) {
  if (!zoomCfg()) return json({ ok: false, error: "Zoom todavía no está configurado en el servidor." }, 503);
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const state = await firmar({ adminId: ctx.userId, nonce }, 600);
  const res = json({ ok: true, url: urlAutorizacion(state) });
  // Ata el flujo a este navegador: un state filtrado no sirve para conectar otra cuenta desde otro lado.
  const seguro = publicUrl().startsWith("https://") ? "; Secure" : "";
  res.headers.append("Set-Cookie", `${COOKIE_NONCE}=${nonce}; Path=${RUTA_CALLBACK}; Max-Age=600; HttpOnly; SameSite=Lax${seguro}`);
  return res;
}

async function desconectar(ctx) {
  const f = await leerConexion();
  if (f) {
    await revocarConexion(f);
    await borrarConexion();
    await bitacora(ctx.userId, "zoom-desconectar", null, f.email ? { email: f.email } : null);
  }
  return json({ ok: true });
}

async function reunion(ctx, b) {
  if (!esUuid(b.claseId)) return json({ ok: false, campo: "claseId", error: "Clase no válida." }, 400);
  const rc = await rest(`jump_clases?id=eq.${b.claseId}&select=id,titulo,inicia_en,duracion_min`);
  if (!rc.ok) throw new Error(`leer clase ${rc.status}`);
  const clase = (await rc.json())[0];
  if (!clase) return json({ ok: false, error: "No encontramos esa clase." }, 404);
  let access;
  try {
    access = zoomCfg() ? await accesoVigente() : null;
  } catch (e) {
    if (e instanceof ZoomDesconectado)
      return json({ ok: false, error: "La conexión con Zoom se perdió. Vuelve a conectar la cuenta en Ajustes o pega el enlace a mano." }, 409);
    throw e;
  }
  if (!access) return json({ ok: false, error: "Conecta una cuenta de Zoom en Ajustes o pega el enlace a mano." }, 409);
  const m = await crearReunion(access, { tema: clase.titulo, iniciaEn: clase.inicia_en, duracionMin: clase.duracion_min });
  const r = await rest("jump_clases_zoom?on_conflict=clase_id", {
    method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
    body: { clase_id: clase.id, meeting_id: m.meetingId, join_url: m.joinUrl, passcode: m.passcode, actualizado_en: new Date().toISOString() },
  });
  if (!r.ok) throw new Error(`guardar reunión ${r.status}`);
  await bitacora(ctx.userId, "zoom-reunion", clase.id, { meeting_id: m.meetingId });
  return json({ ok: true, meetingId: m.meetingId, joinUrl: m.joinUrl });
}

export const zoom = { "zoom-estado": estado, "zoom-iniciar": iniciar, "zoom-desconectar": desconectar, "zoom-reunion": reunion };
