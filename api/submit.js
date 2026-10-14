// POST /api/submit — Entrada pública de opiniones (Vercel Edge Function).
// Valida, aplica honeypot, sube la foto a Storage y guarda la fila en Supabase.
// La SERVICE_ROLE_KEY vive SOLO aquí (variables de entorno de Vercel).

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405);
  const env = process.env;
  // Acepta tanto los nombres estándar como los que quedaron puestos en Vercel.
  const SUPA_URL = env.SUPABASE_URL || env.ProjectURL || "";
  const SUPA_SERVICE = env.SUPABASE_SERVICE_ROLE_KEY || env.service_role || "";
  const IP_SALT = env.IP_SALT || "aurora";
  try {
    const form = await request.formData();

    // Honeypot: si un bot llena este campo, respondemos "ok" y descartamos.
    if (clean(form.get("bot-field"))) return json({ ok: true });

    const tipo    = clean(form.get("tipo"));
    const tema    = clean(form.get("tema"));
    const sector  = clean(form.get("sector"));
    const refer   = clean(form.get("referencia"));
    const detalle = clean(form.get("detalle"));
    const nombre  = clean(form.get("nombre"));
    const celular = clean(form.get("celular"));
    const consRaw = clean(form.get("consentimiento"));
    const consentimiento = consRaw === "si" || consRaw === "true" || consRaw === "on";

    const TIPOS = ["Propuesta", "Queja o problema", "Otro tema"];
    if (!TIPOS.includes(tipo))  return json({ ok: false, error: "Tipo inválido." }, 400);
    if (!tema)                  return json({ ok: false, error: "Falta el tema." }, 400);
    if (detalle.length < 10 || detalle.length > 600)
                                return json({ ok: false, error: "El detalle debe tener entre 10 y 600 caracteres." }, 400);
    if (!consentimiento)        return json({ ok: false, error: "Falta la autorización." }, 400);
    if (celular && !/^[0-9+\s-]{6,15}$/.test(celular))
                                return json({ ok: false, error: "Celular inválido." }, 400);

    // Si no hay URL/clave configuradas, avisamos claro (en vez de "Invalid URL").
    if (!SUPA_URL || !SUPA_SERVICE)
      return json({ ok: false, error: "El servidor no tiene configurada la conexión a la base de datos." }, 500);

    // Foto opcional → Supabase Storage (bucket privado "evidencias")
    let evidencia_path = null;
    const file = form.get("evidencia");
    if (file && typeof file === "object" && file.size > 0) {
      if (file.size > 5 * 1024 * 1024)      return json({ ok: false, error: "La foto pesa más de 5 MB." }, 400);
      if (!/^image\//.test(file.type || "")) return json({ ok: false, error: "El archivo no es una imagen." }, 400);
      const ext = (file.name && file.name.includes(".")) ? file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) : "jpg";
      const key = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext || "jpg"}`;
      const up = await fetch(`${SUPA_URL}/storage/v1/object/evidencias/${key}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPA_SERVICE}`,
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: await file.arrayBuffer(),
      });
      if (up.ok) evidencia_path = key; // si falla, continuamos sin foto
    }

    // Hash de IP (anti-abuso). No guardamos la IP cruda.
    const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const ip_hash = ip ? await sha256(ip + "|" + IP_SALT) : null;

    const row = {
      tipo, tema,
      sector: sector || null,
      referencia: refer || null,
      detalle,
      evidencia_path,
      nombre: nombre || null,
      celular: celular || null,
      consentimiento,
      ip_hash,
    };

    const ins = await fetch(`${SUPA_URL}/rest/v1/submissions`, {
      method: "POST",
      headers: {
        apikey: SUPA_SERVICE,
        Authorization: `Bearer ${SUPA_SERVICE}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });

    if (!ins.ok) {
      const detail = await ins.text();
      return json({ ok: false, error: "No se pudo guardar.", detail }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: "Error del servidor.", detail: String(e) }, 500);
  }
}

function clean(v) { return (v == null ? "" : String(v)).replace(/\s+/g, " ").trim(); }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
