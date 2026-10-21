// Ayudas del informe ciudadano en vivo (para /api/informe). Funciones puras: sin red ni base de datos.
// (El guion bajo del nombre hace que Vercel no lo publique como una ruta /api/.)

// Los temas del formulario. Tiene que ser la misma lista que TEMAS de api/submit.js (una prueba lo vigila).
export const TEMAS = [
  "Agua potable y cortes", "Alcantarillado e inundaciones", "Tráfico y movilidad", "Calles y baches",
  "Basura y aseo", "Alumbrado público", "Áreas verdes y parques", "Otro servicio",
];

// El informe cuenta las opiniones de los últimos 30 días: es lo que se conserva antes de la
// limpieza automática (api/purge.js), así que nunca hay opiniones más viejas que contar.
export const VENTANA_DIAS = 30;

// Opiniones guardadas con un tema que ya no está en la lista (si algún día cambia el formulario).
export const OTROS = "Otros temas";

// El ciclo del informe oficial: sale solo cada 5 días y solo si llegaron al menos 10 opiniones
// nuevas; si no, se mantiene el que ya está y se sigue sumando hasta que alcancen.
export const DIAS_ENTRE_INFORMES = 5;
export const MIN_OPINIONES = 10;

const DIA = 864e5;
const ORIGENES = ["automatico", "manual"];

// Reparte `total` opiniones entre los temas. `porTema` = { tema: cantidad }.
// Devuelve [{ tema, total, porcentaje }] de mayor a menor (empates en el orden del formulario) con
// porcentajes enteros que siempre suman 100 (el resto va a quien tiene la fracción más grande).
export function repartir(porTema, total) {
  const filas = TEMAS.map((tema, i) => ({ tema, total: Math.max(0, Number(porTema?.[tema]) || 0), i }));
  const conocidas = filas.reduce((a, f) => a + f.total, 0);
  if (total > conocidas) filas.push({ tema: OTROS, total: total - conocidas, i: TEMAS.length });
  filas.sort((a, b) => b.total - a.total || a.i - b.i);

  // Se reparte sobre lo contado fila por fila: así la suma da 100 aunque entre un conteo y otro
  // haya llegado una opinión nueva.
  const suma = filas.reduce((a, f) => a + f.total, 0);
  if (!suma) return filas.map(({ tema }) => ({ tema, total: 0, porcentaje: 0 }));
  const bases = filas.map((f) => Math.floor((f.total * 100) / suma));
  let faltan = 100 - bases.reduce((a, b) => a + b, 0);
  const porResto = filas.map((f, k) => k).sort((a, b) => ((filas[b].total * 100) % suma) - ((filas[a].total * 100) % suma) || a - b);
  for (const k of porResto) { if (faltan <= 0) break; bases[k] += 1; faltan -= 1; }
  return filas.map((f, k) => ({ tema: f.tema, total: f.total, porcentaje: bases[k] }));
}

// ---- El ciclo ----
// `ultimo` es el informe publicado más reciente ({ periodo_hasta }) o null si todavía no hay ninguno.

// Dónde arranca el periodo que se está juntando: donde terminó el informe anterior (así ninguna
// opinión se cuenta dos veces ni se pierde) o, si es el primero, los últimos 30 días.
export function desdeDelPeriodo(ultimo, ahora) {
  return ultimo ? new Date(ultimo.periodo_hasta) : new Date(ahora.getTime() - VENTANA_DIAS * DIA);
}

// Cuándo le toca salir al siguiente informe automático (null si todavía no hay ninguno).
export function proximoInforme(ultimo) {
  return ultimo ? new Date(new Date(ultimo.periodo_hasta).getTime() + DIAS_ENTRE_INFORMES * DIA) : null;
}

export function tocaPublicar(ultimo, ahora) {
  const proximo = proximoInforme(ultimo);
  // Si la fecha estuviera dañada, mejor publicar que quedarse con un informe viejo para siempre.
  return !proximo || !(ahora.getTime() < proximo.getTime());
}

// Qué hace el cron: { accion: "publicar" } o { accion: "mantener", motivo }.
// `nuevas` = opiniones llegadas desde el corte del informe anterior.
export function decidir(ultimo, ahora, nuevas) {
  if (!tocaPublicar(ultimo, ahora)) return { accion: "mantener", motivo: "aun-no-toca" };
  if (!(Number(nuevas) >= MIN_OPINIONES)) return { accion: "mantener", motivo: "pocas-opiniones" };
  return { accion: "publicar" };
}

// La fila que se guarda en informe_publico. `porTema` = { tema: cantidad } contado en [desde, hasta).
export function armarFila(origen, desde, hasta, porTema, total) {
  if (!ORIGENES.includes(origen)) throw new Error("origen no válido");
  const temas = repartir(porTema, total);
  const suma = temas.reduce((a, t) => a + t.total, 0);
  if (!suma) throw new Error("No hay opiniones: no se arma un informe vacío.");
  return { origen, periodo_desde: desde.toISOString(), periodo_hasta: hasta.toISOString(), total: suma, por_tema: temas };
}
