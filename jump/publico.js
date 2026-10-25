// Lo público de JUMP para la landing: la próxima clase y la encuesta, de /api/jump-publico.
// Una sola petición por visita (la comparten la encuesta y JC). Si algo falla, resuelve sin datos y la página sigue.
// Siempre fresca (no-cache): con la caché del navegador, quien recarga después de votar vería su voto sin contar.
let pedido = null;

export function cargarPublico() {
  pedido ??= fetch("/api/jump-publico", { headers: { Accept: "application/json" }, cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => ({ clase: d?.clase ?? null, encuesta: d?.encuesta ?? null }))
    .catch(() => ({ clase: null, encuesta: null }));
  return pedido;
}
