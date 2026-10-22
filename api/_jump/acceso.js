// ¿Quién llama? Verifica el JWT con Supabase y el rol en jump_miembros.
import { json, mismoOrigen } from "./http.js";
import { authUsuario, miembro } from "./supa.js";

export async function usuarioDelToken(request) {
  const h = request.headers.get("authorization") || "";
  const jwt = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  return jwt ? authUsuario(jwt) : null;
}

// { ok: true, userId } o { ok: false, res } listo para devolver.
export async function exigirAdmin(request) {
  if (!mismoOrigen(request)) return { ok: false, res: json({ ok: false, error: "Solicitud no permitida." }, 403) };
  const u = await usuarioDelToken(request);
  if (!u) return { ok: false, res: json({ ok: false, error: "Tu sesión venció. Vuelve a entrar." }, 401) };
  const m = await miembro(u.id);
  if (!m || m.rol !== "admin" || m.estado !== "activa" || m.debe_cambiar_clave)
    return { ok: false, res: json({ ok: false, error: "Esta acción es solo para el equipo de JUMP." }, 403) };
  return { ok: true, userId: u.id };
}
