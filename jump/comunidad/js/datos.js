// Acceso a Supabase y a /api/jump-* de la Comunidad JUMP.
// Ninguna función devuelve errores crudos: todas lanzan ErrorJump { codigo, mensaje, campo? }.
//   codigo: "credenciales" | "suspendida" | "sin_acceso" | "limite" | "red" | "sesion" | "prohibido" | "invalido" | "servidor"
import { correoEmprendedor, correoEquipo, limpiarCedula } from "./cedula.js";

// Debe coincidir con la fecha de jump/comunidad/privacidad.html y con api/jump-clave.js.
export const VERSION_PRIVACIDAD = "2026-10-19";

export class ErrorJump extends Error {
  constructor(codigo, mensaje = "", campo) {
    super(mensaje || codigo);
    this.codigo = codigo;
    this.mensaje = mensaje;
    if (campo) this.campo = campo;
  }
}

let sb = null;

export async function iniciar() {
  if (sb) return sb;
  let cfg;
  try { cfg = await (await fetch("/api/config", { cache: "no-store" })).json(); } catch { throw new ErrorJump("red"); }
  if (!cfg || !cfg.url || !cfg.anonKey || !window.supabase) throw new ErrorJump("red");
  // Sesión propia de JUMP: no se mezcla con la del panel de La Aurora Escucha (otra clave de localStorage).
  sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { storageKey: "jump-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return sb;
}

const esRed = (e) => !!e && (e.name === "AuthRetryableFetchError" || e.status === 0 || e instanceof TypeError || /failed to fetch|network|load failed/i.test(e.message || ""));
const esSesion = (e) => !!e && (e.code === "PGRST301" || e.code === "PGRST302" || e.status === 401 || /jwt (expired|invalid)|invalid jwt/i.test(e.message || ""));

// Espera una consulta de supabase-js ({data, error, count}) y traduce el error.
export async function q(consulta) {
  let r;
  try { r = await consulta; } catch (e) { throw esRed(e) ? new ErrorJump("red") : new ErrorJump("servidor", e && e.message); }
  if (r.error) {
    if (esSesion(r.error)) throw new ErrorJump("sesion");
    if (esRed(r.error)) throw new ErrorJump("red");
    throw new ErrorJump("servidor", r.error.message);
  }
  return r;
}

// Fila de jump_miembros en camelCase.
export const miembro = (m) => ({
  userId: m.user_id, rol: m.rol, cedula: m.cedula, usuario: m.usuario, nombres: m.nombres, negocio: m.negocio,
  whatsapp: m.whatsapp, correo: m.correo, edicion: m.edicion, estado: m.estado, motivoSuspension: m.motivo_suspension,
  debeCambiarClave: m.debe_cambiar_clave, claveTemporalVence: m.clave_temporal_vence,
  privacidadAceptadaEn: m.privacidad_aceptada_en, privacidadVersion: m.privacidad_version,
  ultimoIngreso: m.ultimo_ingreso, creadoEn: m.creado_en, esEjemplo: m.es_ejemplo,
});

export async function sesion() {
  await iniciar();
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

// El miembro que tiene la sesión abierta, o null.
export async function yo() {
  if (!(await sesion())) return null;
  const { data } = await q(sb.rpc("jump_yo").maybeSingle());
  return data ? miembro(data) : null;
}

export async function salir() {
  if (!sb) return;
  try { await sb.auth.signOut({ scope: "local" }); } catch { /* sin red: igual se borra la sesión local */ }
  try { localStorage.removeItem("jump-auth"); } catch { /* sin acceso a localStorage */ }
}

export async function entrar({ tipo, id, clave }) {
  await iniciar();
  const email = tipo === "cedula" ? correoEmprendedor(limpiarCedula(id)) : correoEquipo(id);
  let r;
  try { r = await sb.auth.signInWithPassword({ email, password: clave }); } catch { throw new ErrorJump("red"); }
  if (r.error) {
    const e = r.error;
    if (e.code === "user_banned" || /banned/i.test(e.message || "")) throw new ErrorJump("suspendida");
    if (e.status === 429 || e.code === "over_request_rate_limit") throw new ErrorJump("limite");
    if (esRed(e)) throw new ErrorJump("red");
    throw new ErrorJump("credenciales");
  }
  const m = await yo();
  if (!m) { await salir(); throw new ErrorJump("sin_acceso"); }
  if (m.estado !== "activa") { await salir(); throw new ErrorJump("suspendida"); }
  return m;
}

// POST a una función /api/jump-* con el token de la sesión.
export async function api(ruta, cuerpo) {
  const s = await sesion();
  if (!s) throw new ErrorJump("sesion");
  let r;
  try {
    r = await fetch(ruta, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.access_token}` }, body: JSON.stringify(cuerpo) });
  } catch { throw new ErrorJump("red"); }
  let b = {};
  try { b = await r.json(); } catch { /* respuesta sin cuerpo */ }
  if (r.status === 401) throw new ErrorJump("sesion", b.error);
  if (!r.ok || b.ok === false) {
    const codigo = r.status === 403 ? "prohibido" : r.status >= 500 ? "servidor" : "invalido";
    throw new ErrorJump(codigo, b.error || "No se pudo completar. Intenta de nuevo.", b.campo);
  }
  return b;
}

export const cambiarClave = ({ nueva, actual, aceptaPrivacidad, versionPrivacidad }) =>
  api("/api/jump-clave", { nueva, actual, aceptaPrivacidad, versionPrivacidad });
