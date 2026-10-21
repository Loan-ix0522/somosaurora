// Comunidad JUMP — acciones del equipo (cuentas; luego Zoom y datos de ejemplo).
// Una sola función para que la verificación de acceso viva en un solo lugar.
import { json, leerJson } from "./_jump/http.js";
import { exigirAdmin } from "./_jump/acceso.js";
import { cuentas } from "./_jump/cuentas.js";
import { zoom } from "./_jump/zoom.js";
import { ejemplos } from "./_jump/ejemplos.js";

export const config = { runtime: "edge" };

const ACCIONES = { ...cuentas, ...zoom, ...ejemplos };

export default async function handler(request) {
  if (request.method !== "POST") return json({ ok: false, error: "Método no permitido." }, 405);
  let accion = "";
  try {
    const acceso = await exigirAdmin(request); // incluye la comprobación de mismo origen
    if (!acceso.ok) return acceso.res;
    const body = await leerJson(request);
    if (!body) return json({ ok: false, error: "Solicitud no válida." }, 400);
    accion = typeof body.accion === "string" ? body.accion : "";
    const fn = Object.hasOwn(ACCIONES, accion) ? ACCIONES[accion] : null;
    if (!fn) return json({ ok: false, error: "Acción no válida." }, 400);
    return await fn({ userId: acceso.userId }, body);
  } catch (e) {
    console.error("[jump-admin]", accion.slice(0, 40), e && e.message);
    return json({ ok: false, error: "No se pudo completar. Intenta de nuevo." }, 500);
  }
}
