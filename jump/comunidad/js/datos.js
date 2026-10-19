// Acceso a Supabase y a /api/jump-* de la Comunidad JUMP.
// Ninguna función devuelve errores crudos: todas lanzan ErrorJump { codigo, mensaje, campo? }.
//   codigo: "credenciales" | "suspendida" | "sin_acceso" | "limite" | "red" | "sesion" | "prohibido" | "invalido" | "servidor"
import { correoEmprendedor, correoEquipo, limpiarCedula } from "./cedula.js";

// Debe coincidir con la fecha de jump/comunidad/privacidad.html y con api/jump-clave.js.
export const VERSION_PRIVACIDAD = "2026-10-19";

export class ErrorJump extends Error {
  constructor(codigo, mensaje = "", campo) {
    super(mensaje || codigo);
    this.codigo = codigo;
    this.mensaje = mensaje;
    if (campo) this.campo = campo;
  }
}

let sb = null;

export async function iniciar() {
  if (sb) return sb;
  let cfg;
  try { cfg = await (await fetch("/api/config", { cache: "no-store" })).json(); } catch { throw new ErrorJump("red"); }
  if (!cfg || !cfg.url || !cfg.anonKey || !window.supabase) throw new ErrorJump("red");
  // Sesión propia de JUMP: no se mezcla con la del panel de La Aurora Escucha (otra clave de localStorage).
  sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { storageKey: "jump-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return sb;
}

const esRed = (e) => !!e && (e.name === "AuthRetryableFetchError" || e.status === 0 || e instanceof TypeError || /failed to fetch|network|load failed/i.test(e.message || ""));
const esSesion = (e) => !!e && (e.code === "PGRST301" || e.code === "PGRST302" || e.status === 401 || /jwt (expired|invalid)|invalid jwt/i.test(e.message || ""));

// Espera una consulta de supabase-js ({data, error, count}) y traduce el error.
// `permitidos`: códigos de Postgres que no son error para quien llama (p. ej. "23505", ya existía).
export async function q(consulta, permitidos = []) {
  let r;
  try { r = await consulta; } catch (e) { throw esRed(e) ? new ErrorJump("red") : new ErrorJump("servidor", e && e.message); }
  if (r.error && !permitidos.includes(r.error.code)) {
    if (esSesion(r.error)) throw new ErrorJump("sesion");
    if (esRed(r.error)) throw new ErrorJump("red");
    throw new ErrorJump("servidor", r.error.message);
  }
  return r;
}

// Fila de jump_miembros en camelCase.
export const miembro = (m) => ({
  userId: m.user_id, rol: m.rol, cedula: m.cedula, usuario: m.usuario, nombres: m.nombres, negocio: m.negocio,
  whatsapp: m.whatsapp, correo: m.correo, edicion: m.edicion, estado: m.estado, motivoSuspension: m.motivo_suspension,
  debeCambiarClave: m.debe_cambiar_clave, claveTemporalVence: m.clave_temporal_vence,
  privacidadAceptadaEn: m.privacidad_aceptada_en, privacidadVersion: m.privacidad_version,
  ultimoIngreso: m.ultimo_ingreso, creadoEn: m.creado_en, esEjemplo: m.es_ejemplo,
});

export async function sesion() {
  await iniciar();
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

// El miembro que tiene la sesión abierta, o null.
export async function yo() {
  if (!(await sesion())) return null;
  const { data } = await q(sb.rpc("jump_yo").maybeSingle());
  return data ? miembro(data) : null;
}

export async function salir() {
  if (!sb) return;
  try { await sb.auth.signOut({ scope: "local" }); } catch { /* sin red: igual se borra la sesión local */ }
  try { localStorage.removeItem("jump-auth"); } catch { /* sin acceso a localStorage */ }
}

export async function entrar({ tipo, id, clave }) {
  await iniciar();
  const email = tipo === "cedula" ? correoEmprendedor(limpiarCedula(id)) : correoEquipo(id);
  let r;
  try { r = await sb.auth.signInWithPassword({ email, password: clave }); } catch { throw new ErrorJump("red"); }
  if (r.error) {
    const e = r.error;
    if (e.code === "user_banned" || /banned/i.test(e.message || "")) throw new ErrorJump("suspendida");
    if (e.status === 429 || e.code === "over_request_rate_limit") throw new ErrorJump("limite");
    if (esRed(e)) throw new ErrorJump("red");
    throw new ErrorJump("credenciales");
  }
  const m = await yo();
  if (!m) { await salir(); throw new ErrorJump("sin_acceso"); }
  if (m.estado !== "activa") { await salir(); throw new ErrorJump("suspendida"); }
  return m;
}

// POST a una función /api/jump-* con el token de la sesión.
export async function api(ruta, cuerpo) {
  const s = await sesion();
  if (!s) throw new ErrorJump("sesion");
  let r;
  try {
    r = await fetch(ruta, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.access_token}` }, body: JSON.stringify(cuerpo) });
  } catch { throw new ErrorJump("red"); }
  let b = {};
  try { b = await r.json(); } catch { /* respuesta sin cuerpo */ }
  if (r.status === 401) throw new ErrorJump("sesion", b.error);
  if (!r.ok || b.ok === false) {
    const codigo = r.status === 403 ? "prohibido" : r.status >= 500 ? "servidor" : "invalido";
    throw new ErrorJump(codigo, b.error || "No se pudo completar. Intenta de nuevo.", b.campo);
  }
  return b;
}

export const cambiarClave = ({ nueva, actual, aceptaPrivacidad, versionPrivacidad }) =>
  api("/api/jump-clave", { nueva, actual, aceptaPrivacidad, versionPrivacidad });

// ---------- contenido (emprendedor) ----------

// Portada: una de las imágenes del sitio ("assets/x.webp") o una subida al bucket público jump-portadas.
export function urlPortada(ruta) {
  if (!ruta) return "/jump/comunidad/assets/g-master.webp";
  if (ruta.startsWith("assets/")) return "/jump/comunidad/" + ruta;
  return sb.storage.from("jump-portadas").getPublicUrl(ruta).data.publicUrl;
}

export const aMentoria = (r) => ({
  id: r.id, titulo: r.titulo, descripcion: r.descripcion || "", mentor: r.mentor || "", portadaRuta: r.portada, portada: urlPortada(r.portada),
  estado: r.estado, publicadaEn: r.publicada_en, actualizadaEn: r.actualizada_en, creadaEn: r.creada_en, esEjemplo: r.es_ejemplo,
  modulos: [], materiales: [],
});
export const aModulo = (r) => ({
  id: r.id, mentoriaId: r.mentoria_id, orden: r.orden, titulo: r.titulo, tipo: r.tipo, videoUrl: r.video_url,
  duracionMin: r.duracion_min, descripcion: r.descripcion || "", claseId: r.clase_id, esEjemplo: r.es_ejemplo, materiales: [],
});
export const aMaterial = (r) => ({
  id: r.id, mentoriaId: r.mentoria_id, moduloId: r.modulo_id, nombre: r.nombre, tipo: r.tipo, ruta: r.ruta, url: r.url,
  bytes: r.bytes, mime: r.mime, orden: r.orden,
});
export const aClase = (r) => ({
  id: r.id, titulo: r.titulo, mentoriaId: r.mentoria_id, iniciaEn: r.inicia_en, duracionMin: r.duracion_min, mensaje: r.mensaje || "",
  grabacionUrl: r.grabacion_url, esEjemplo: r.es_ejemplo,
});
export const aAviso = (r) => ({
  id: r.id, tipo: r.tipo, texto: r.texto, claseId: r.clase_id, mentoriaId: r.mentoria_id, creadoEn: r.creado_en, esEjemplo: r.es_ejemplo,
});

// Mentorías con sus módulos (en orden) y su material: el de la mentoría y el de cada módulo.
export function armarMentorias(filasM, filasMod, filasMat) {
  const ms = filasM.map(aMentoria), porId = new Map(ms.map((m) => [m.id, m])), mods = new Map();
  for (const r of filasMod) {
    const m = porId.get(r.mentoria_id);
    if (!m) continue;
    const x = aModulo(r);
    m.modulos.push(x);
    mods.set(x.id, x);
  }
  for (const m of ms) m.modulos.sort((a, b) => a.orden - b.orden);
  for (const r of filasMat) {
    const x = aMaterial(r);
    const destino = x.moduloId ? mods.get(x.moduloId) : porId.get(x.mentoriaId);
    if (destino) destino.materiales.push(x);
  }
  return ms;
}

// Todo lo que ve el emprendedor, en una consulta por tabla (en paralelo). RLS deja pasar solo lo suyo y lo publicado.
export async function cargarEmprendedor() {
  await iniciar();
  const [m, men, mods, mats, cls, prog, asis, avs, vis] = await Promise.all([
    yo(),
    q(sb.from("jump_mentorias").select("*").eq("estado", "publicada").order("publicada_en", { ascending: false })),
    q(sb.from("jump_modulos").select("*").order("orden")),
    q(sb.from("jump_materiales").select("*").order("orden").order("creado_en")),
    q(sb.from("jump_clases").select("*").order("inicia_en")),
    q(sb.from("jump_progreso").select("modulo_id,visto_en")),
    q(sb.from("jump_asistencia").select("clase_id,confirmado_en,entro_en")),
    q(sb.from("jump_avisos").select("*").order("creado_en", { ascending: false }).limit(60)),
    q(sb.from("jump_avisos_vistos").select("aviso_id")),
  ]);
  if (!m) throw new ErrorJump("sin_acceso");
  if (m.estado !== "activa") throw new ErrorJump("suspendida");
  const mentorias = armarMentorias(men.data, mods.data, mats.data);
  const vistos = new Map(prog.data.map((p) => [p.modulo_id, p.visto_en]));
  for (const x of mentorias) for (const mod of x.modulos) { mod.visto = vistos.has(mod.id); mod.vistoEn = vistos.get(mod.id) || null; }
  const asistencia = new Map(asis.data.map((a) => [a.clase_id, a]));
  const clases = cls.data.map(aClase).map((c) => ({ ...c, asistire: !!asistencia.get(c.id)?.confirmado_en, entro: !!asistencia.get(c.id)?.entro_en }));
  const leidos = new Set(vis.data.map((v) => v.aviso_id));
  const avisos = avs.data.map(aAviso).map((a) => ({ ...a, visto: leidos.has(a.id) }));
  return { yo: m, mentorias, clases, avisos, cargadoEn: Date.now() };
}

export async function marcarVisto(moduloId) {
  await iniciar();
  await q(sb.from("jump_progreso").insert({ modulo_id: moduloId }), ["23505"]); // ya estaba visto: no es error
}

export async function confirmarAsistencia(claseId, si) {
  await iniciar();
  if (si) await q(sb.from("jump_asistencia").upsert({ clase_id: claseId, confirmado_en: new Date().toISOString() }, { onConflict: "clase_id,user_id" }));
  else await q(sb.from("jump_asistencia").update({ confirmado_en: null }).eq("clase_id", claseId));
}

// El enlace de Zoom solo sale de la base dentro de la ventana de la clase (jump_entrar_clase).
export async function entrarClase(claseId) {
  await iniciar();
  let r;
  try { r = await sb.rpc("jump_entrar_clase", { p_clase: claseId }); } catch { throw new ErrorJump("red"); }
  if (r.error) {
    const c = ["fuera_de_ventana", "sin_enlace", "no_encontrada", "sin_acceso"].find((x) => (r.error.message || "").includes(x));
    if (c) throw new ErrorJump(c);
    await q(Promise.resolve(r));
  }
  return r.data;
}

export async function marcarAvisosVistos(ids) {
  if (!ids.length) return;
  await iniciar();
  await q(sb.from("jump_avisos_vistos").upsert(ids.map((aviso_id) => ({ aviso_id })), { onConflict: "aviso_id,user_id", ignoreDuplicates: true }));
}

export async function actualizarPerfil({ negocio, whatsapp }) {
  await iniciar();
  let r;
  try { r = await sb.rpc("jump_actualizar_perfil", { p_negocio: negocio, p_whatsapp: whatsapp || "" }); } catch { throw new ErrorJump("red"); }
  if (r.error) {
    const msg = r.error.message || "";
    if (msg.includes("negocio_invalido")) throw new ErrorJump("invalido", "Escribe el nombre de tu negocio (hasta 80 caracteres).", "negocio");
    if (msg.includes("whatsapp_invalido")) throw new ErrorJump("invalido", "Escribe un celular de Ecuador, por ejemplo 0991234567.", "whatsapp");
    await q(Promise.resolve(r));
  }
}

// Material: los enlaces van directo; los archivos, con una URL firmada que vence en 120 s.
// PDF e imágenes se abren en la pestaña; Word, Excel y PowerPoint se descargan con su nombre y extensión.
export async function enlaceMaterial(material) {
  if (material.tipo === "enlace") return material.url;
  await iniciar();
  const ext = (/\.[a-z0-9]{1,5}$/i.exec(material.ruta) || [""])[0];
  const verEnPestana = /^(application\/pdf|image\/)/.test(material.mime || "") || /\.(pdf|jpe?g|png|webp)$/i.test(ext);
  const nombre = material.nombre.toLowerCase().endsWith(ext.toLowerCase()) ? material.nombre : material.nombre + ext;
  const r = await q(sb.storage.from("jump-material").createSignedUrl(material.ruta, 120, verEnPestana ? {} : { download: nombre }));
  return r.data.signedUrl;
}
