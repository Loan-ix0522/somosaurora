// Llamadas a Supabase desde el servidor. Por defecto con service_role: usar SOLO después de exigirAdmin()
// o de verificar el token del usuario.
import { supa } from "./env.js";

export function rest(path, { method = "GET", body, prefer, jwt } = {}) {
  const { url, anon, service } = supa();
  const headers = {
    apikey: jwt ? anon : service,
    Authorization: `Bearer ${jwt || service}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  return fetch(`${url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

export function authAdmin(path, { method = "GET", body } = {}) {
  const { url, service } = supa();
  return fetch(`${url}/auth/v1/admin/${path}`, {
    method,
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Usuario dueño del JWT (lo valida Supabase). null si el token no sirve.
export async function authUsuario(jwt) {
  if (!jwt) return null;
  const { url, anon } = supa();
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${jwt}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? { id: u.id, email: u.email } : null;
}

export async function claveCorrecta(email, clave) {
  const { url, anon } = supa();
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: clave }),
  });
  return r.ok;
}

// Fila de jump_miembros (service_role). null si no existe.
export async function miembro(userId) {
  const r = await rest(`jump_miembros?user_id=eq.${encodeURIComponent(userId)}&select=*`);
  if (!r.ok) throw new Error(`miembro ${r.status}`);
  return (await r.json())[0] || null;
}

export async function bitacora(actorId, accion, objetivo = null, detalle = null) {
  await rest("jump_bitacora", { method: "POST", body: { actor_id: actorId, accion, objetivo, detalle }, prefer: "return=minimal" });
}
