// Comunidad JUMP — avisos de Zoom (webhook): validación del endpoint y app_deauthorized.
// Toda petición debe venir firmada con ZOOM_WEBHOOK_SECRET, también la validación del endpoint:
// si no, responder el HMAC de un texto cualquiera serviría para firmar eventos falsos.
import { json } from "./_jump/http.js";
import { zoomCfg } from "./_jump/env.js";
import { bitacora } from "./_jump/supa.js";
import { borrarConexionDe } from "./_jump/zoom.js";

export const config = { runtime: "edge" };

const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
const clave = (secreto) => crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

async function firmaValida(request, cuerpo, secreto) {
  const ts = request.headers.get("x-zm-request-timestamp") || "";
  const firma = request.headers.get("x-zm-signature") || "";
  const m = /^v0=([0-9a-f]{64})$/.exec(firma);
  if (!m || !/^\d{1,13}$/.test(ts)) return false;
  const seg = ts.length > 11 ? Number(ts) / 1000 : Number(ts);
  if (Math.abs(Date.now() / 1000 - seg) > 300) return false;
  const bytes = Uint8Array.from(m[1].match(/../g), (h) => parseInt(h, 16));
  // verify compara en tiempo constante.
  return crypto.subtle.verify("HMAC", await clave(secreto), bytes, enc.encode(`v0:${ts}:${cuerpo}`));
}

export default async function handler(request) {
  if (request.method !== "POST") return json({ ok: false }, 405);
  const cfg = zoomCfg();
  if (!cfg || !cfg.webhook) return json({ ok: false, error: "Zoom no está configurado." }, 503);
  try {
    const cuerpo = await request.text();
    if (cuerpo.length > 65536) return json({ ok: false }, 413);
    if (!(await firmaValida(request, cuerpo, cfg.webhook))) return json({ ok: false }, 401);
    let b;
    try { b = JSON.parse(cuerpo); } catch { return json({ ok: false }, 400); }

    if (b.event === "endpoint.url_validation") {
      const plain = String(b.payload?.plainToken || "");
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(plain)) return json({ ok: false }, 400);
      const firma = await crypto.subtle.sign("HMAC", await clave(cfg.webhook), enc.encode(plain));
      return json({ plainToken: plain, encryptedToken: hex(firma) });
    }
    if (b.event === "app_deauthorized") {
      const zoomUserId = String(b.payload?.user_id || "");
      if (zoomUserId) {
        await borrarConexionDe(zoomUserId); // solo si es la cuenta conectada
        await bitacora(null, "zoom-desautorizado", null, null);
      }
    }
    return json({ ok: true });
  } catch (e) {
    console.error("[jump-zoom-deauth]", e && e.message);
    return json({ ok: false }, 500);
  }
}
