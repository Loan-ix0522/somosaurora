// Fechas de la Comunidad JUMP, siempre en hora de Guayaquil, sin importar la zona del dispositivo.
// Ecuador está en UTC−5 todo el año (sin horario de verano), así que basta con desplazar 5 horas.

export const ZONA = "America/Guayaquil";
const DESFASE = 5 * 3600e3;
const DOW = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MON = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const dos = (n) => String(n).padStart(2, "0");
const ms = (x) => (x instanceof Date ? x.getTime() : typeof x === "number" ? x : Date.parse(x));
// Fecha "de pared" en Guayaquil: se leen sus campos con getUTC*.
const pared = (x) => new Date(ms(x) - DESFASE);
const tit = (s) => s[0] + s.slice(1).toLowerCase();

// "2026-10-22", "19:00" → "2026-10-22T19:00:00-05:00"
export function aISO(fecha, hora) {
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha || ""), h = /^(\d{2}):(\d{2})$/.exec(hora || "");
  if (!f || !h) throw new Error("fecha_invalida");
  const [y, m, d] = [+f[1], +f[2], +f[3]], [hh, mm] = [+h[1], +h[2]];
  const prueba = new Date(Date.UTC(y, m - 1, d));
  if (prueba.getUTCMonth() !== m - 1 || prueba.getUTCDate() !== d || hh > 23 || mm > 59) throw new Error("fecha_invalida");
  return `${fecha}T${hora}:00-05:00`;
}

// Para los campos <input type=date|time> al editar: "2026-10-22" y "19:00".
export function aCampos(iso) {
  const p = pared(iso);
  return { fecha: `${p.getUTCFullYear()}-${dos(p.getUTCMonth() + 1)}-${dos(p.getUTCDate())}`, hora: `${dos(p.getUTCHours())}:${dos(p.getUTCMinutes())}` };
}

export function partes(iso) {
  const p = pared(iso);
  return { dow: DOW[p.getUTCDay()], d: String(p.getUTCDate()), mon: MON[p.getUTCMonth()], hora: `${dos(p.getUTCHours())}:${dos(p.getUTCMinutes())}` };
}

export const rango = (iso, min) => `${partes(iso).hora} – ${partes(ms(iso) + min * 60e3).hora}`;

export function fechaCorta(iso) {
  const p = partes(iso);
  return `${tit(p.dow)} ${p.d} ${p.mon.toLowerCase()}`;
}

const dia = (x) => Math.floor(ms(pared(x)) / 864e5);

export function haceCuanto(iso, ahora = Date.now()) {
  const dif = ms(ahora) - ms(iso);
  const dias = dia(ahora) - dia(iso);
  if (dias <= 0) {
    if (dif < 60e3) return "ahora";
    if (dif < 3600e3) return `hace ${Math.floor(dif / 60e3)} min`;
    return `hace ${Math.floor(dif / 3600e3)} h`;
  }
  if (dias === 1) return "ayer";
  return fechaCorta(iso).toLowerCase();
}

// Ventana de Zoom: desde 15 min antes del inicio hasta 30 min después del fin (igual que jump_entrar_clase).
export function estadoClase(clase, ahora = Date.now()) {
  const t = ms(ahora), ini = ms(clase.iniciaEn), fin = ini + (clase.duracionMin || 60) * 60e3;
  if (t < ini - 15 * 60e3) return "programada";
  if (t < ini) return "abre-pronto";
  if (t < fin + 30 * 60e3) return "en-vivo";
  return "terminada";
}
