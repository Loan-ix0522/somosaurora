// Variables de entorno de la Comunidad JUMP.
// JUMP tiene su propio proyecto de Supabase. Sus variables llevan el prefijo JUMP_ y NO hay respaldo en las de
// La Aurora Escucha (SUPABASE_URL, ProjectURL…): si falta una, JUMP se niega a funcionar en vez de caer en la
// base de La Aurora.

export function supa() {
  const e = process.env;
  return {
    url: (e.JUMP_SUPABASE_URL || "").replace(/\/+$/, ""),
    anon: e.JUMP_SUPABASE_ANON_KEY || "",
    service: e.JUMP_SUPABASE_SERVICE_ROLE_KEY || "",
  };
}

export function secreto() {
  const s = process.env.JUMP_SECRET || "";
  if (s.length < 32) throw new Error("JUMP_SECRET falta o es muy corto");
  return s;
}

// Dirección pública del sitio (para Zoom): https://www.laauroraescucha.com
export const publicUrl = () => (process.env.JUMP_PUBLIC_URL || "").replace(/\/+$/, "");

export function zoomCfg() {
  const e = process.env;
  if (!e.ZOOM_CLIENT_ID || !e.ZOOM_CLIENT_SECRET) return null;
  return { id: e.ZOOM_CLIENT_ID, secret: e.ZOOM_CLIENT_SECRET, webhook: e.ZOOM_WEBHOOK_SECRET || "" };
}
