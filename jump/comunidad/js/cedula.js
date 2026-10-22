// Cédula ecuatoriana y usuarios del equipo. Lo usan la página y la API (mismo archivo).
// Las cuentas de Supabase usan un correo interno que nadie lee: el emprendedor solo escribe su cédula.

export const DOMINIO_CEDULA = "cuentas.laauroraescucha.com";
export const DOMINIO_EQUIPO = "equipo.laauroraescucha.com";

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

export const usuarioValido = (u) => /^[a-z0-9._-]{3,30}$/.test(String(u ?? ""));
export const correoEmprendedor = (cedula) => `c${cedula}@${DOMINIO_CEDULA}`;
export const correoEquipo = (usuario) => `${String(usuario).trim().toLowerCase()}@${DOMINIO_EQUIPO}`;
