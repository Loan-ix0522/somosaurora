// Cifrado de tokens de Zoom, "state" firmado de OAuth, claves temporales y reglas de clave.
// Todo con Web Crypto (funciona igual en Vercel Edge y en Node).
import { secreto } from "./env.js";

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

// Claves derivadas de JUMP_SECRET, una por propósito.
const derivar = async (proposito) => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(secreto() + ":" + proposito)));
const claveAes = async () => crypto.subtle.importKey("raw", await derivar("tokens"), "AES-GCM", false, ["encrypt", "decrypt"]);
const claveHmac = async () => crypto.subtle.importKey("raw", await derivar("state"), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

// "v1.<iv>.<cifrado>" (AES-GCM-256, iv de 12 bytes, base64url).
export async function cifrar(texto) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await claveAes(), enc.encode(texto));
  return `v1.${b64u(iv)}.${b64u(ct)}`;
}

export async function descifrar(sobre) {
  const [v, iv, ct] = String(sobre).split(".");
  if (v !== "v1" || !iv || !ct) throw new Error("sobre inválido");
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64u(iv) }, await claveAes(), deB64u(ct)));
}

// Token "<datos>.<firma>" con vencimiento (exp en ms).
export async function firmar(obj, ttlSeg) {
  const datos = b64u(enc.encode(JSON.stringify({ ...obj, exp: Date.now() + ttlSeg * 1000 })));
  const firma = await crypto.subtle.sign("HMAC", await claveHmac(), enc.encode(datos));
  return `${datos}.${b64u(firma)}`;
}

export async function verificar(token) {
  try {
    const [datos, firma] = String(token).split(".");
    if (!datos || !firma) return null;
    // crypto.subtle.verify compara en tiempo constante.
    const ok = await crypto.subtle.verify("HMAC", await claveHmac(), deB64u(firma), enc.encode(datos));
    if (!ok) return null;
    const obj = JSON.parse(dec.decode(deB64u(datos)));
    return typeof obj.exp === "number" && obj.exp > Date.now() ? obj : null;
  } catch {
    return null;
  }
}

// Huella de una conexión (para frenar envíos repetidos) sin guardar la IP: HMAC con una clave derivada de JUMP_SECRET.
export async function huellaIp(ip) {
  const k = await crypto.subtle.importKey("raw", await derivar("ip"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(String(ip ?? "")))).slice(0, 32);
}

// Huella del aparato que vota en la página pública (su id al azar guardado en el navegador): nunca se guarda el id.
export async function huellaDispositivo(id) {
  const k = await crypto.subtle.importKey("raw", await derivar("dispositivo"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(String(id ?? "")))).slice(0, 32);
}

// Número al azar en [0, n) sin sesgo (muestreo por rechazo).
function azar(n) {
  const limite = Math.floor(0x100000000 / n) * n;
  const b = new Uint32Array(1);
  do crypto.getRandomValues(b); while (b[0] >= limite);
  return b[0] % n;
}
const cuatro = () => String(azar(10000)).padStart(4, "0");
export const claveTemporal = () => `JUMP-${cuatro()}-${cuatro()}`;

export function errorDeClave(clave) {
  const c = String(clave ?? "");
  if (c.length < 8) return "La clave debe tener al menos 8 caracteres.";
  if (c.length > 72) return "La clave puede tener hasta 72 caracteres.";
  if (!/\d/.test(c)) return "La clave debe tener al menos un número.";
  if (/^JUMP-\d{4}-\d{4}$/i.test(c)) return "Elige una clave distinta a la temporal.";
  return null;
}

export const esUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s ?? ""));
