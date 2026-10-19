// Variables de entorno de la Comunidad JUMP.
// Acepta los nombres estándar y los que quedaron puestos en Vercel (ProjectURL, anonpublic, service_role).

export function supa() {
  const e = process.env;
  return {
    url: (e.SUPABASE_URL || e.ProjectURL || "").replace(/\/+$/, ""),
    anon: e.SUPABASE_ANON_KEY || e.anonpublic || "",
    service: e.SUPABASE_SERVICE_ROLE_KEY || e.service_role || "",
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
