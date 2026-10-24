// Postulaciones del formulario «Postula» de la página de JUMP (/jump/). Se llama desde api/jump-postular.js.
import { json } from "./http.js";
import { rest } from "./supa.js";
import { huellaIp } from "./secretos.js";
import { whatsapp, texto, nombre } from "./normalizar.js";

// Las mismas opciones del <select id="f-rubro"> de jump/index.html y del check de la migración 0002 (una prueba lo verifica).
export const RUBROS = ["Comida y bebidas", "Ropa y accesorios", "Belleza y cuidado personal", "Mascotas", "Artesanías y decoración", "Servicios", "Otro"];
const RUC = ["si", "no", "tramite"];
const POR_CONEXION_AL_DIA = 5;

const mal = (campo, error) => json({ ok: false, campo, error }, 400);
const linea = (s) => texto(s, 81).replace(/\s+/g, " ");
const largoOk = (s) => s.length >= 2 && [...s].length <= 80;

export async function postular(b, ip) {
  if (String(b.sitio ?? "").trim()) return json({ ok: true }); // campo trampa: solo lo llenan los robots

  const fila = { nombres: nombre(b.nombres) };
  if (!fila.nombres) return mal("nombres", "Escribe tu nombre y apellido.");
  fila.whatsapp = whatsapp(b.whatsapp);
  if (!fila.whatsapp) return mal("whatsapp", "Revisa el número: debe ser un celular de Ecuador, por ejemplo 0991234567.");
  fila.negocio = linea(b.negocio);
  if (!largoOk(fila.negocio)) return mal("negocio", "Escribe el nombre de tu emprendimiento, aunque sea provisional.");
  if (!RUBROS.includes(b.rubro)) return mal("rubro", "Elige qué vendes. Si no aparece, marca «Otro».");
  fila.rubro = b.rubro;
  fila.sector = linea(b.sector);
  if (!largoOk(fila.sector)) return mal("sector", "Cuéntanos en qué sector de La Aurora estás.");
  if (!RUC.includes(b.ruc)) return mal("ruc", "Elige una opción. No tener RUC no te descalifica.");
  fila.ruc = b.ruc;
  if (b.aurora !== true) return mal("aurora", "JUMP es exclusivo para emprendimientos de La Aurora: marca la casilla si es tu caso.");

  // Freno a los envíos en masa: guardamos una huella de la conexión, nunca la IP.
  fila.ip_hash = await huellaIp(ip);
  const desde = new Date(Date.now() - 864e5).toISOString();
  const rc = await rest(`jump_postulaciones?ip_hash=eq.${encodeURIComponent(fila.ip_hash)}&creado_en=gte.${encodeURIComponent(desde)}&select=id&limit=${POR_CONEXION_AL_DIA}`);
  if (!rc.ok) throw new Error(`contar envíos ${rc.status}`);
  if ((await rc.json()).length >= POR_CONEXION_AL_DIA)
    return json({ ok: false, error: "Recibimos varias postulaciones desde esta conexión. Intenta de nuevo mañana." }, 429);

  // El mismo WhatsApp ya postuló: no se duplica, y a la persona le decimos que ya la tenemos.
  const rd = await rest(`jump_postulaciones?whatsapp=eq.${fila.whatsapp}&select=id&limit=1`);
  if (!rd.ok) throw new Error(`buscar whatsapp ${rd.status}`);
  if ((await rd.json()).length > 0) return json({ ok: true, repetida: true });

  const ri = await rest("jump_postulaciones", { method: "POST", body: fila, prefer: "return=minimal" });
  if (!ri.ok) throw new Error(`guardar postulación ${ri.status}`);
  return json({ ok: true }, 201);
}
