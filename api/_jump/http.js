// Respuestas y lectura de pedidos para las funciones de la Comunidad JUMP.

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

// Mismo criterio que api/submit.js: el Origin debe ser este mismo sitio.
export function mismoOrigen(request) {
  const origin = request.headers.get("origin") || "";
  try {
    return !!origin && new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

// Cuerpo JSON con tope de tamaño. null si no es JSON válido o es muy grande.
export async function leerJson(request, max = 16384) {
  try {
    const t = await request.text();
    if (t.length > max) return null;
    const v = JSON.parse(t);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
