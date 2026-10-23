// Cédula ecuatoriana y correos. Lo usan la página y la API (mismo archivo).
// El equipo entra con su correo real. El emprendedor solo escribe su cédula: su cuenta de Supabase
// lleva un correo interno que nadie lee ni recibe mensajes (Supabase pide un correo por cuenta).

export const DOMINIO_CEDULA = "laauroraescucha.com";

export const limpiarCedula = (s) => String(s ?? "").replace(/\D/g, "");

// 10 dígitos, provincia 01–24 o 30, tercer dígito < 6 y verificador módulo 10.
export function cedulaValida(c) {
  if (!/^\d{10}$/.test(c)) return false;
  const prov = +c.slice(0, 2);
  if (!((prov >= 1 && prov <= 24) || prov === 30)) return false;
  if (+c[2] >= 6) return false;
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let p = +c[i] * (i % 2 ? 1 : 2);
    if (p > 9) p -= 9;
    suma += p;
  }
  return (10 - (suma % 10)) % 10 === +c[9];
}

export const correoValido = (c) => {
  const v = String(c ?? "");
  return v.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
};

// jump_miembros pide un "usuario" interno (3 a 30: minúsculas, números, punto, guion o guion bajo).
// Nadie lo escribe: sale de lo que va antes de la @ del correo.
export function usuarioDesdeCorreo(correo) {
  const local = String(correo ?? "").split("@")[0];
  const limpio = local.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  if (!limpio) return "equipo-jump";
  return limpio.length < 3 ? `${limpio}-jump` : limpio;
}

export const correoEmprendedor = (cedula) => `c${cedula}@${DOMINIO_CEDULA}`;
