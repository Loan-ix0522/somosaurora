// Lo público de JUMP para la landing: la próxima clase y la encuesta, de /api/jump-publico.
// Una sola petición por visita (la comparten la encuesta y JC). Si algo falla, resuelve sin datos y la página sigue.
// La red de Vercel guarda la respuesta unos segundos. Quien acaba de votar pide otra dirección (?v=) para ver su voto
// contado al recargar, en vez de esa copia.
const RECIENTE = 2 * 60e3; // más de lo que la red puede servir una copia vieja (30 s y 60 s más mientras la renueva)
let pedido = null;

export function cargarPublico() {
  let votoEn = 0;
  try { votoEn = Number(localStorage.getItem("jump.votoEn")) || 0; } catch { /* sin almacenamiento */ }
  const url = Date.now() - votoEn < RECIENTE ? `/api/jump-publico?v=${votoEn}` : "/api/jump-publico";
  pedido ??= fetch(url, { headers: { Accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => ({ clase: d?.clase ?? null, encuesta: d?.encuesta ?? null }))
    .catch(() => ({ clase: null, encuesta: null }));
  return pedido;
}
