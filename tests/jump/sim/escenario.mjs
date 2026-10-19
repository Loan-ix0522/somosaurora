// Escenario fijo para las pruebas de permisos: personas en cada estado, una mentoría publicada y una en borrador.
import { nuevoUsuario } from "./db.mjs";

// Cédulas con dígito verificador válido (la pantalla de ingreso las valida antes de enviar).
const ced = { E: "0912345675", E2: "0923456784", S: "0934567892", N: "0945678902" };

async function miembro(db, email, campos) {
  const id = await nuevoUsuario(db, { email, password: "clave-prueba-1" });
  const cols = Object.keys(campos);
  await db.query(
    `insert into public.jump_miembros (user_id, ${cols.join(", ")}) values ($1, ${cols.map((_, i) => "$" + (i + 2)).join(", ")})`,
    [id, ...Object.values(campos)]);
  return { id, email };
}

export async function crearEscenario(db) {
  const A = await miembro(db, "ana.admin@equipo.laauroraescucha.com",
    { rol: "admin", usuario: "ana.admin", nombres: "Ana Torres", debe_cambiar_clave: false });
  const p = (k, extra = {}) => miembro(db, `c${ced[k]}@cuentas.laauroraescucha.com`, {
    rol: "emprendedor", cedula: ced[k], nombres: { E: "María José Vera", E2: "Carlos Mendoza", S: "Rosa Quinde", N: "Luis Alvarado" }[k],
    negocio: "Negocio " + k, whatsapp: "0991234567", debe_cambiar_clave: false, ...extra });
  const E = await p("E"), E2 = await p("E2");
  const S = await p("S", { estado: "suspendida" });
  const N = await p("N", { debe_cambiar_clave: true, clave_temporal_vence: new Date(Date.now() + 7 * 864e5).toISOString() });
  const U = { email: "solo.auth@cuentas.laauroraescucha.com" };
  U.id = await nuevoUsuario(db, { email: U.email, password: "x" });

  const one = async (sql, params) => (await db.query(sql + " returning id", params)).rows[0].id;
  const P = await one("insert into public.jump_mentorias (titulo, descripcion, estado, publicada_en) values ('Tu RUC paso a paso', 'd', 'publicada', now())");
  const B = await one("insert into public.jump_mentorias (titulo, descripcion) values ('Factura electrónica', 'borrador')");
  const C1 = await one("insert into public.jump_clases (titulo, mentoria_id, inicia_en, duracion_min) values ('Dudas del RUC', $1, now() + interval '10 minutes', 60)", [P]);
  const C2 = await one("insert into public.jump_clases (titulo, mentoria_id, inicia_en, duracion_min) values ('Dudas de factura', $1, now() + interval '2 days', 60)", [B]);
  const C3 = await one("insert into public.jump_clases (titulo, inicia_en, duracion_min) values ('Ventas por WhatsApp', now() + interval '3 days', 90)");
  const P1 = await one("insert into public.jump_modulos (mentoria_id, orden, titulo, tipo) values ($1, 1, '¿Qué es el RUC?', 'video')", [P]);
  const P2 = await one("insert into public.jump_modulos (mentoria_id, orden, titulo, tipo, clase_id) values ($1, 2, 'Preguntas en vivo', 'vivo', $2)", [P, C1]);
  const B1 = await one("insert into public.jump_modulos (mentoria_id, orden, titulo, tipo) values ($1, 1, 'Qué es la factura', 'video')", [B]);
  await db.query("insert into public.jump_materiales (mentoria_id, nombre, tipo, url) values ($1, 'SRI en línea', 'enlace', 'https://www.sri.gob.ec')", [P]);
  await db.query("insert into public.jump_materiales (mentoria_id, nombre, tipo, url) values ($1, 'Guía de factura', 'enlace', 'https://www.sri.gob.ec/f')", [B]);
  await db.query("insert into public.jump_clases_zoom (clase_id, meeting_id, join_url) values ($1, '111', 'https://us02web.zoom.us/j/111'), ($2, '333', 'https://zoom.us/j/333')", [C1, C3]);
  await db.query("insert into public.jump_avisos (tipo, texto, clase_id) values ('invitacion', 'Te invitamos a la clase', $1)", [C1]);
  return { A, E, E2, S, N, U, P, B, C1, C2, C3, P1, P2, B1 };
}
