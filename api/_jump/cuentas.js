// Acciones del equipo sobre las cuentas: crear, clave nueva, suspender y reactivar.
// Se llaman desde api/jump-admin.js, siempre después de exigirAdmin().
import { json } from "./http.js";
import { rest, authAdmin, miembro, actualizarMiembro, bitacora } from "./supa.js";
import { claveTemporal, esUuid } from "./secretos.js";
import { whatsapp, texto, nombre } from "./normalizar.js";
import { limpiarCedula, cedulaValida, usuarioValido, correoEmprendedor, correoEquipo } from "../../jump/comunidad/js/cedula.js";

const VENCE_MS = 7 * 864e5;
const BAN_INDEFINIDO = "876000h"; // 100 años: Supabase no tiene "para siempre"

const mal = (campo, error) => json({ ok: false, campo, error }, 400);
const noEncontrada = () => json({ ok: false, error: "No encontramos esa cuenta." }, 404);
const vence = () => new Date(Date.now() + VENCE_MS).toISOString();
const correoValido = (c) => c.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);

async function existe(columna, valor) {
  const r = await rest(`jump_miembros?${columna}=eq.${encodeURIComponent(valor)}&select=user_id`);
  if (!r.ok) throw new Error(`buscar ${columna} ${r.status}`);
  return (await r.json()).length > 0;
}

async function crearCuenta(ctx, b) {
  const rol = b.rol;
  if (rol !== "emprendedor" && rol !== "admin") return mal("rol", "Elige si la cuenta es de un emprendedor o del equipo.");
  const fila = { rol, debe_cambiar_clave: true, clave_temporal_vence: vence(), creado_por: ctx.userId };
  let email, columna, duplicado;

  if (rol === "emprendedor") {
    const cedula = limpiarCedula(b.cedula);
    if (!cedulaValida(cedula)) return mal("cedula", "Revisa la cédula: son 10 dígitos y no coincide con una cédula válida.");
    fila.cedula = cedula;
    email = correoEmprendedor(cedula);
    columna = "cedula";
    duplicado = "Ya existe una cuenta con esa cédula.";
  } else {
    const usuario = String(b.usuario ?? "").trim().toLowerCase();
    if (!usuarioValido(usuario)) return mal("usuario", "El usuario lleva de 3 a 30 caracteres: letras sin tildes, números, punto, guion o guion bajo.");
    fila.usuario = usuario;
    email = correoEquipo(usuario);
    columna = "usuario";
    duplicado = "Ya existe una cuenta con ese usuario.";
  }

  fila.nombres = nombre(b.nombres);
  if (!fila.nombres) return mal("nombres", "Escribe nombre y apellido (de 2 a 80 caracteres).");

  if (rol === "emprendedor") {
    const negocio = texto(b.negocio, 81).replace(/\s+/g, " ");
    if (!negocio) return mal("negocio", "Escribe el nombre del negocio.");
    if ([...negocio].length > 80) return mal("negocio", "El nombre del negocio puede tener hasta 80 caracteres.");
    fila.negocio = negocio;
    if (String(b.whatsapp ?? "").trim()) {
      fila.whatsapp = whatsapp(b.whatsapp);
      if (!fila.whatsapp) return mal("whatsapp", "Escribe un celular de Ecuador, por ejemplo 0991234567.");
    }
    const correo = String(b.correo ?? "").trim();
    if (correo) {
      if (!correoValido(correo)) return mal("correo", "Revisa el correo.");
      fila.correo = correo;
    }
  }

  if (await existe(columna, fila[columna])) return json({ ok: false, campo: columna, error: duplicado }, 409);

  const clave = claveTemporal();
  const ra = await authAdmin("users", { method: "POST", body: { email, password: clave, email_confirm: true } });
  if (ra.status === 422) {
    const e = await ra.json().catch(() => ({}));
    if (e.error_code === "email_exists" || /already been registered/i.test(e.msg || e.message || ""))
      return json({ ok: false, campo: columna, error: duplicado }, 409);
  }
  if (!ra.ok) throw new Error(`crear usuario ${ra.status}`);
  const userId = (await ra.json()).id;
  fila.user_id = userId;

  const ri = await rest("jump_miembros", { method: "POST", body: fila, prefer: "return=minimal" });
  if (!ri.ok) {
    // Compensación: sin fila en jump_miembros el usuario de Auth quedaría huérfano.
    await authAdmin(`users/${userId}`, { method: "DELETE" });
    const e = await ri.json().catch(() => ({}));
    if (ri.status === 409 || e.code === "23505") return json({ ok: false, campo: columna, error: duplicado }, 409);
    throw new Error(`insertar miembro ${ri.status}`);
  }
  await bitacora(ctx.userId, "crear-cuenta", userId, { rol });
  return json({ ok: true, userId, clave }, 201);
}

async function claveNueva(ctx, b) {
  if (!esUuid(b.userId)) return mal("userId", "Cuenta no válida.");
  if (!(await miembro(b.userId))) return noEncontrada();
  // Primero la marca: si el cambio en Auth fallara, la persona igual tendría que cambiar su clave al entrar.
  await actualizarMiembro(b.userId, { debe_cambiar_clave: true, clave_temporal_vence: vence() });
  const clave = claveTemporal();
  const r = await authAdmin(`users/${b.userId}`, { method: "PUT", body: { password: clave } });
  if (!r.ok) throw new Error(`clave nueva ${r.status}`);
  await bitacora(ctx.userId, "clave-nueva", b.userId);
  return json({ ok: true, clave });
}

async function suspender(ctx, b) {
  if (!esUuid(b.userId)) return mal("userId", "Cuenta no válida.");
  if (b.userId === ctx.userId) return json({ ok: false, error: "No puedes suspender tu propia cuenta." }, 400);
  const m = await miembro(b.userId);
  if (!m) return noEncontrada();
  if (m.rol === "admin") {
    // Cuenta solo a quien hoy puede actuar como equipo (activa y sin clave temporal pendiente).
    const r = await rest(`jump_miembros?rol=eq.admin&estado=eq.activa&debe_cambiar_clave=is.false&user_id=neq.${b.userId}&select=user_id`);
    if (!r.ok) throw new Error(`contar equipo ${r.status}`);
    if ((await r.json()).length === 0) return json({ ok: false, error: "Debe quedar al menos una persona del equipo activa." }, 400);
  }
  const motivo = texto(b.motivo, 200) || null;
  // Primero la base: las políticas cortan el acceso al contenido aunque el token siga vivo.
  await actualizarMiembro(b.userId, { estado: "suspendida", motivo_suspension: motivo });
  const r = await authAdmin(`users/${b.userId}`, { method: "PUT", body: { ban_duration: BAN_INDEFINIDO } });
  if (!r.ok) throw new Error(`suspender ${r.status}`);
  await bitacora(ctx.userId, "suspender", b.userId, motivo ? { motivo } : null);
  return json({ ok: true });
}

async function reactivar(ctx, b) {
  if (!esUuid(b.userId)) return mal("userId", "Cuenta no válida.");
  if (!(await miembro(b.userId))) return noEncontrada();
  await actualizarMiembro(b.userId, { estado: "activa", motivo_suspension: null });
  const r = await authAdmin(`users/${b.userId}`, { method: "PUT", body: { ban_duration: "none" } });
  if (!r.ok) throw new Error(`reactivar ${r.status}`);
  await bitacora(ctx.userId, "reactivar", b.userId);
  return json({ ok: true });
}

export const cuentas = { "crear-cuenta": crearCuenta, "clave-nueva": claveNueva, suspender, reactivar };
