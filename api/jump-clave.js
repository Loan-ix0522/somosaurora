// Comunidad JUMP — cambio de clave: en el primer ingreso (con el aviso de privacidad)
// o desde el perfil (con la clave actual).
import { json, leerJson, mismoOrigen } from "./_jump/http.js";
import { usuarioDelToken } from "./_jump/acceso.js";
import { authAdmin, claveCorrecta, miembro, actualizarMiembro, bitacora } from "./_jump/supa.js";
import { errorDeClave } from "./_jump/secretos.js";

export const config = { runtime: "edge" };

// Debe coincidir con la fecha del aviso en jump/comunidad/privacidad.html.
const VERSION_PRIVACIDAD = "2026-10-19";

const mal = (campo, error) => json({ ok: false, campo, error }, 400);

export default async function handler(request) {
  if (request.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405);
  if (!mismoOrigen(request)) return json({ ok: false, error: "Solicitud no permitida." }, 403);
  try {
    const u = await usuarioDelToken(request);
    if (!u) return json({ ok: false, error: "Tu sesión venció. Vuelve a entrar." }, 401);
    const b = await leerJson(request);
    if (!b) return json({ ok: false, error: "Solicitud no válida." }, 400);
    const m = await miembro(u.id);
    if (!m) return json({ ok: false, error: "Esta cuenta no es de la Comunidad JUMP." }, 403);
    if (m.estado !== "activa") return json({ ok: false, error: "Tu cuenta está suspendida. Habla con el equipo de JUMP." }, 403);

    const primerIngreso = m.debe_cambiar_clave;
    if (primerIngreso) {
      if (b.aceptaPrivacidad !== true || b.versionPrivacidad !== VERSION_PRIVACIDAD)
        return mal("privacidad", "Para continuar, lee y acepta el aviso de privacidad.");
      if (m.clave_temporal_vence && new Date(m.clave_temporal_vence) < new Date())
        return json({ ok: false, error: "Tu clave temporal venció. Pídele una nueva al equipo de JUMP." }, 403);
    }
    const problema = errorDeClave(b.nueva);
    if (problema) return mal("nueva", problema);
    if (!primerIngreso) {
      const actual = typeof b.actual === "string" ? b.actual : "";
      if (!actual || actual.length > 72 || !(await claveCorrecta(u.email, actual)))
        return mal("actual", "La clave actual no es correcta.");
    }

    const r = await authAdmin(`users/${u.id}`, { method: "PUT", body: { password: b.nueva } });
    if (r.status === 422) return mal("nueva", "No se pudo usar esa clave. Elige otra.");
    if (!r.ok) throw new Error(`cambiar clave ${r.status}`);
    const campos = { debe_cambiar_clave: false, clave_temporal_vence: null };
    if (primerIngreso) {
      campos.privacidad_aceptada_en = new Date().toISOString();
      campos.privacidad_version = VERSION_PRIVACIDAD;
    }
    await actualizarMiembro(u.id, campos);
    await bitacora(u.id, primerIngreso ? "primer-ingreso" : "cambiar-clave", u.id);
    return json({ ok: true });
  } catch (e) {
    console.error("[jump-clave]", e && e.message);
    return json({ ok: false, error: "No se pudo completar. Intenta de nuevo." }, 500);
  }
}
