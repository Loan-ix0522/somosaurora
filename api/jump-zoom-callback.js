// Comunidad JUMP — vuelta de Zoom después de autorizar la app (GET ?code&state).
// Siempre termina en Ajustes con ?zoom=ok | error | cancelado.
import { verificar, cifrar, esUuid } from "./_jump/secretos.js";
import { miembro, bitacora } from "./_jump/supa.js";
import { publicUrl } from "./_jump/env.js";
import { canjear, yoZoom, leerConexion, guardarConexion, revocarConexion, COOKIE_NONCE, RUTA_CALLBACK } from "./_jump/zoom.js";

export const config = { runtime: "edge" };

function volver(resultado) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${publicUrl()}/jump/comunidad/#a/ajustes?zoom=${resultado}`,
      "Cache-Control": "no-store",
      "Set-Cookie": `${COOKIE_NONCE}=; Path=${RUTA_CALLBACK}; Max-Age=0; HttpOnly; SameSite=Lax`,
    },
  });
}

function cookie(request, nombre) {
  for (const parte of (request.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nombre) return v.join("=");
  }
  return "";
}

export default async function handler(request) {
  if (request.method !== "GET") return new Response(null, { status: 405 });
  try {
    const q = new URL(request.url).searchParams;
    if (q.get("error")) return volver(q.get("error") === "access_denied" ? "cancelado" : "error");
    const st = await verificar(q.get("state") || "");
    const code = q.get("code") || "";
    if (!st || !esUuid(st.adminId) || typeof st.nonce !== "string" || !code || code.length > 512) return volver("error");
    if (cookie(request, COOKIE_NONCE) !== st.nonce) return volver("error");
    const m = await miembro(st.adminId);
    if (!m || m.rol !== "admin" || m.estado !== "activa" || m.debe_cambiar_clave) return volver("error");

    const t = await canjear(code);
    const yo = await yoZoom(t.access);
    const anterior = await leerConexion();
    await guardarConexion({
      zoom_user_id: yo.id, email: yo.email, nombre: yo.nombre,
      refresh_token_cifrado: await cifrar(t.refresh), access_token_cifrado: await cifrar(t.access), expira_en: t.expiraEn,
      conectada_por: st.adminId, conectada_en: new Date().toISOString(),
    });
    // Cambio de cuenta: los tokens de la cuenta anterior ya no sirven para nada.
    // (Si es la misma cuenta no se revoca: Zoom podría quitar también la autorización nueva.)
    if (anterior && anterior.zoom_user_id !== yo.id) await revocarConexion(anterior);
    await bitacora(st.adminId, "zoom-conectar", null, yo.email ? { email: yo.email } : null);
    return volver("ok");
  } catch (e) {
    console.error("[jump-zoom-callback]", e && e.message);
    return volver("error");
  }
}
