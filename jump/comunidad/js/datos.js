// Acceso a Supabase y a /api/jump-* de la Comunidad JUMP.
// Ninguna función devuelve errores crudos: todas lanzan ErrorJump { codigo, mensaje, campo? }.
//   codigo: "credenciales" | "suspendida" | "sin_acceso" | "limite" | "red" | "sesion" | "prohibido" | "invalido" | "servidor"
//           | "limite_publicaciones" | "limite_comentarios" | "foto_ilegible" (muro)
import { correoEmprendedor, correoEquipo, limpiarCedula } from "./cedula.js";
import { aISO, fechaCorta, partes } from "./fechas.js";
import { reducirFoto, esImagenReducible, nombreReducido, sumarMaterial } from "./medios.js";

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
  try { cfg = await (await fetch("/api/jump-config", { cache: "no-store" })).json(); } catch { throw new ErrorJump("red"); }
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

// ---------- equipo ----------

export const adminApi = (accion, cuerpo = {}) => api("/api/jump-admin", { accion, ...cuerpo });

// Las mismas reglas que las restricciones de la base (migración de JUMP).
export const RE_VIDEO = /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\//;
export const RE_ZOOM = /^https:\/\/([a-z0-9-]+\.)?zoom\.us\//;
export const MAX_MATERIAL = 20 * 1024 * 1024;
export const TIPOS_MATERIAL = [
  "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg", "image/png", "image/webp",
];

const ahoraISO = () => new Date().toISOString();

// Todo lo que ve el equipo: el contenido sin filtrar por estado, las cuentas, los conteos y la cuenta de Zoom.
export async function cargarAdmin() {
  await iniciar();
  const [m, men, mods, mats, cls, zm, avs, mie, bit, con, zoom] = await Promise.all([
    yo(),
    q(sb.from("jump_mentorias").select("*").order("creada_en", { ascending: false })),
    q(sb.from("jump_modulos").select("*").order("orden")),
    q(sb.from("jump_materiales").select("*").order("orden").order("creado_en")),
    q(sb.from("jump_clases").select("*").order("inicia_en")),
    q(sb.from("jump_clases_zoom").select("clase_id,meeting_id,join_url")),
    q(sb.from("jump_avisos").select("*").order("creado_en", { ascending: false }).limit(100)),
    q(sb.from("jump_miembros").select("*").order("creado_en", { ascending: false })),
    q(sb.from("jump_bitacora").select("*").order("creado_en", { ascending: false }).limit(12)),
    q(sb.rpc("jump_conteos")),
    adminApi("zoom-estado").catch(() => ({ configurada: false, conectada: false, error: true })),
  ]);
  if (!m) throw new ErrorJump("sin_acceso");
  if (m.estado !== "activa") throw new ErrorJump("suspendida");
  if (m.rol !== "admin") throw new ErrorJump("sin_acceso");
  const c = con.data || { progreso: {}, asistencia: {}, avisos: {}, mentorias: {} };
  const mentorias = armarMentorias(men.data, mods.data, mats.data).map((x) => ({ ...x, vistos: c.mentorias[x.id] || 0 }));
  const enlaces = new Map(zm.data.map((z) => [z.clase_id, z]));
  const clases = cls.data.map(aClase).map((x) => ({
    ...x, joinUrl: enlaces.get(x.id)?.join_url || "", meetingId: enlaces.get(x.id)?.meeting_id || null,
    confirmados: c.asistencia[x.id]?.confirmados || 0, entraron: c.asistencia[x.id]?.entraron || 0,
  }));
  const avisos = avs.data.map(aAviso).map((a) => ({ ...a, vistos: c.avisos[a.id] || 0 }));
  const miembros = mie.data.map(miembro).map((x) => ({ ...x, hechos: c.progreso[x.userId] || 0 }));
  const bitacora = bit.data.map((b) => ({ id: b.id, actorId: b.actor_id, accion: b.accion, objetivo: b.objetivo, detalle: b.detalle, creadoEn: b.creado_en }));
  return { yo: m, mentorias, clases, avisos, miembros, bitacora, zoom, almacenamiento: sumarMaterial(mats.data), cargadoEn: Date.now() };
}

// Clase de un módulo en vivo: el título del módulo si alcanza (la clase pide de 3 a 120 caracteres).
const tituloClase = (mod, mentoria) => (mod.titulo.trim().length >= 3 ? mod.titulo.trim() : mentoria).slice(0, 120);

// Guarda la mentoría del editor y sus módulos. Devuelve el id y deja en `E` los ids nuevos (para no duplicar al volver a guardar).
//   E = { id?, titulo, descripcion, mentor, portadaRuta, modulos: [{ id?, titulo, tipo, videoUrl, duracion, descripcion, claseId?, fecha, hora, zoom }],
//         modulosBorrados: [{ id, claseId, rutas }] }
export async function guardarMentoria(E) {
  await iniciar();
  const titulo = E.titulo.trim() || "Mentoría sin título";
  const fila = { titulo, descripcion: E.descripcion.trim(), mentor: E.mentor.trim() || null, portada: E.portadaRuta || null };
  if (E.id) await q(sb.from("jump_mentorias").update(fila).eq("id", E.id));
  else E.id = (await q(sb.from("jump_mentorias").insert(fila).select("id").single())).data.id;
  const id = E.id;

  // Lo que se quitó: primero sus clases (con sus avisos y asistencia), después los módulos.
  const quitados = E.modulosBorrados || [];
  const clasesFuera = quitados.map((x) => x.claseId).filter(Boolean);
  if (clasesFuera.length) await q(sb.from("jump_clases").delete().in("id", clasesFuera));
  const modsFuera = quitados.map((x) => x.id).filter(Boolean);
  if (modsFuera.length) await q(sb.from("jump_modulos").delete().in("id", modsFuera));
  // Sus archivos: las filas se van con el módulo; los objetos de Storage se borran aparte.
  const rutasFuera = quitados.flatMap((x) => x.rutas || []);
  if (rutasFuera.length) await sb.storage.from("jump-material").remove(rutasFuera).catch(() => {});
  E.modulosBorrados = [];

  for (const [i, mod] of E.modulos.entries()) {
    const vivo = mod.tipo === "vivo";
    if (vivo && mod.fecha && mod.hora) {
      const clase = { titulo: tituloClase(mod, titulo), mentoria_id: id, inicia_en: aISO(mod.fecha, mod.hora), duracion_min: Number(mod.duracion) || 60 };
      if (mod.claseId) await q(sb.from("jump_clases").update(clase).eq("id", mod.claseId));
      else mod.claseId = (await q(sb.from("jump_clases").insert(clase).select("id").single())).data.id;
    } else if (!vivo && mod.claseId) {
      // Pasó de clase en vivo a video: la clase ya no existe.
      await q(sb.from("jump_clases").delete().eq("id", mod.claseId));
      mod.claseId = null;
    }
    if (vivo && mod.claseId) {
      const z = (mod.zoom || "").trim();
      if (z) await q(sb.from("jump_clases_zoom").upsert({ clase_id: mod.claseId, join_url: z, actualizado_en: ahoraISO() }, { onConflict: "clase_id" }));
      else await q(sb.from("jump_clases_zoom").delete().eq("clase_id", mod.claseId));
    }
    const filaMod = {
      mentoria_id: id, orden: i, titulo: mod.titulo.trim().slice(0, 120) || "Módulo sin título", tipo: mod.tipo,
      video_url: vivo ? null : mod.videoUrl.trim() || null,
      duracion_min: vivo ? Number(mod.duracion) || 60 : Number(mod.duracion) || null,
      descripcion: mod.descripcion.trim(), clase_id: vivo ? mod.claseId || null : null,
    };
    if (mod.id) await q(sb.from("jump_modulos").update(filaMod).eq("id", mod.id));
    else mod.id = (await q(sb.from("jump_modulos").insert(filaMod).select("id").single())).data.id;
  }
  return id;
}

export const textoInvitacion = (titulo, iniciaEn) =>
  `Te invitamos a la clase en vivo “${titulo}”, el ${fechaCorta(iniciaEn).toLowerCase()} a las ${partes(iniciaEn).hora}. Entra con el botón “Entrar a Zoom” desde la Comunidad JUMP a la hora indicada.`;

// Publica. Con `avisar`: un aviso de mentoría nueva (si no lo tenía) y una invitación por cada clase futura que no tenga.
export async function publicarMentoria(id, { avisar = true } = {}) {
  await iniciar();
  const m = (await q(sb.from("jump_mentorias").select("titulo,publicada_en").eq("id", id).single())).data;
  await q(sb.from("jump_mentorias").update({ estado: "publicada", publicada_en: m.publicada_en || ahoraISO() }).eq("id", id));
  if (!avisar) return { avisoNuevo: false, invitaciones: 0 };
  const ya = await q(sb.from("jump_avisos").select("id").eq("mentoria_id", id).eq("tipo", "mentoria").limit(1));
  if (!ya.data.length) await q(sb.from("jump_avisos").insert({ tipo: "mentoria", texto: `Ya está disponible la mentoría “${m.titulo}”.`, mentoria_id: id }));
  const futuras = (await q(sb.from("jump_clases").select("id,titulo,inicia_en").eq("mentoria_id", id).gt("inicia_en", ahoraISO()))).data;
  let nuevas = [];
  if (futuras.length) {
    const invitadas = new Set((await q(sb.from("jump_avisos").select("clase_id").eq("tipo", "invitacion").in("clase_id", futuras.map((c) => c.id)))).data.map((a) => a.clase_id));
    nuevas = futuras.filter((c) => !invitadas.has(c.id)).map((c) => ({ tipo: "invitacion", clase_id: c.id, texto: textoInvitacion(c.titulo, c.inicia_en) }));
    if (nuevas.length) await q(sb.from("jump_avisos").insert(nuevas));
  }
  return { avisoNuevo: !ya.data.length, invitaciones: nuevas.length };
}

export async function pasarABorrador(id) {
  await iniciar();
  await q(sb.from("jump_mentorias").update({ estado: "borrador" }).eq("id", id));
}

// Borra la mentoría (la base se lleva sus módulos, material, clases, avisos y avance) y después sus archivos de Storage.
export async function borrarMentoria(id) {
  await iniciar();
  const [mats, men] = await Promise.all([
    q(sb.from("jump_materiales").select("ruta").eq("mentoria_id", id).eq("tipo", "archivo")),
    q(sb.from("jump_mentorias").select("portada").eq("id", id).maybeSingle()),
  ]);
  await q(sb.from("jump_mentorias").delete().eq("id", id));
  // Si esto falla, los archivos quedan huérfanos en Storage, pero nadie los puede ver (la política pide la mentoría).
  const rutas = mats.data.map((x) => x.ruta).filter(Boolean);
  if (rutas.length) await sb.storage.from("jump-material").remove(rutas).catch(() => {});
  const portada = men.data?.portada;
  if (portada && !portada.startsWith("assets/")) await sb.storage.from("jump-portadas").remove([portada]).catch(() => {});
}

// Portada: reducida y sin metadatos, en una carpeta propia del bucket público.
export async function subirPortada(file) {
  await iniciar();
  let blob;
  try { blob = await reducirFoto(file, 1600); } catch { throw new ErrorJump("invalido", "No pudimos leer esa foto. Prueba con otra (JPG, PNG o WebP)."); }
  const ruta = `${crypto.randomUUID()}/portada.${blob.type === "image/webp" ? "webp" : "jpg"}`;
  await q(sb.storage.from("jump-portadas").upload(ruta, blob, { contentType: blob.type, upsert: false }));
  return ruta;
}

// "Guía de Precios (2026).PDF" → "guia-de-precios-2026.pdf" (para la ruta en Storage; el nombre original va en la fila).
export function nombreSeguro(nombre) {
  const s = String(nombre || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/-(\.[a-z0-9]+)$/, "$1").replace(/^[-.]+|[-.]+$/g, "");
  return (s.length > 80 ? s.slice(-80).replace(/^[-.]+/, "") : s) || "archivo";
}

export function errorMaterial(file) {
  if (file.size > MAX_MATERIAL) return `${file.name} pesa más de 20 MB. Súbelo comprimido o compártelo como enlace.`;
  if (!TIPOS_MATERIAL.includes(file.type)) return `${file.name}: solo se aceptan PDF, Word, Excel, PowerPoint o imágenes.`;
  return "";
}

// Material de la mentoría (moduloId nulo) o de un módulo. La ruta empieza por el id de la mentoría (la usa la política de lectura).
export async function subirMaterial(mentoriaId, moduloId, file, orden = 0) {
  await iniciar();
  const malo = errorMaterial(file);
  if (malo) throw new ErrorJump("invalido", malo);
  // Una imagen se sube reducida (WebP, máx. 2000 px), como las fotos del muro y las portadas. Si no queda más liviana, se sube la original.
  // PDF, Word, Excel y PowerPoint no se pueden recomprimir en el navegador sin dañarlos: se suben tal cual.
  let blob = file, nombre = file.name;
  if (esImagenReducible(file.type)) {
    let reducida;
    try { reducida = await reducirFoto(file, 2000); } catch { throw new ErrorJump("invalido", `${file.name}: no pudimos leer esa imagen. Prueba con otra.`); }
    if (reducida.size < file.size) { blob = reducida; nombre = nombreReducido(file.name, reducida.type); }
  }
  const ruta = `${mentoriaId}/${crypto.randomUUID()}-${nombreSeguro(nombre)}`;
  await q(sb.storage.from("jump-material").upload(ruta, blob, { contentType: blob.type, upsert: false }));
  try {
    const r = await q(sb.from("jump_materiales").insert({
      mentoria_id: mentoriaId, modulo_id: moduloId || null, nombre: nombre.trim().slice(0, 160) || "Archivo", tipo: "archivo",
      ruta, bytes: blob.size, mime: blob.type, orden,
    }).select("*").single());
    return aMaterial(r.data);
  } catch (e) {
    await sb.storage.from("jump-material").remove([ruta]).catch(() => {});
    throw e;
  }
}

export async function agregarEnlace(mentoriaId, moduloId, url, orden = 0) {
  await iniciar();
  let nombre = url;
  try { const u = new URL(url); nombre = (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "")).slice(0, 160); } catch { /* queda la URL */ }
  const r = await q(sb.from("jump_materiales").insert({ mentoria_id: mentoriaId, modulo_id: moduloId || null, nombre, tipo: "enlace", url, orden }).select("*").single());
  return aMaterial(r.data);
}

export async function quitarMaterial(material) {
  await iniciar();
  await q(sb.from("jump_materiales").delete().eq("id", material.id));
  if (material.ruta) await sb.storage.from("jump-material").remove([material.ruta]).catch(() => {});
}

export const crearReunionZoom = (claseId) => adminApi("zoom-reunion", { claseId });

// ---------- ajustes (equipo) ----------
export const zoomIniciar = () => adminApi("zoom-iniciar");
export const zoomDesconectar = () => adminApi("zoom-desconectar");
export const crearAdmin = ({ usuario, nombres }) => adminApi("crear-cuenta", { rol: "admin", usuario, nombres });
export const ejemplosContar = () => adminApi("ejemplos-contar");
export const ejemplosCargar = () => adminApi("ejemplos-cargar");
export const ejemplosBorrar = () => adminApi("ejemplos-borrar", { confirmacion: "BORRAR" });

export async function guardarZoomManual(claseId, url) {
  await iniciar();
  await q(sb.from("jump_clases_zoom").upsert({ clase_id: claseId, join_url: url, meeting_id: null, passcode: null, actualizado_en: ahoraISO() }, { onConflict: "clase_id" }));
}

// Clase suelta (o de una mentoría) con su invitación. zoom: "crear" | "manual" | "despues".
// Si la reunión de Zoom no se pudo crear, la clase igual queda programada: el error lleva { clase }.
export async function programarClase({ titulo, mentoriaId, fecha, hora, duracionMin, mensaje, zoom, enlace }) {
  await iniciar();
  const r = await q(sb.from("jump_clases").insert({
    titulo: titulo.trim(), mentoria_id: mentoriaId || null, inicia_en: aISO(fecha, hora), duracion_min: Number(duracionMin) || 60, mensaje: mensaje.trim() || null,
  }).select("*").single());
  const clase = aClase(r.data);
  if (zoom === "manual" && enlace) await guardarZoomManual(clase.id, enlace);
  await q(sb.from("jump_avisos").insert({ tipo: "invitacion", clase_id: clase.id, texto: mensaje.trim() || textoInvitacion(clase.titulo, clase.iniciaEn) }));
  if (zoom === "crear") {
    try { await crearReunionZoom(clase.id); } catch (e) { e.clase = clase; throw e; }
  }
  return clase;
}

export async function guardarGrabacion(claseId, url) {
  await iniciar();
  await q(sb.from("jump_clases").update({ grabacion_url: url }).eq("id", claseId));
}

// Un recordatorio es otra invitación a la misma clase: sale arriba en Avisos y vuelve a contar como nuevo.
export async function reenviarInvitacion(clase) {
  await iniciar();
  await q(sb.from("jump_avisos").insert({ tipo: "invitacion", clase_id: clase.id,
    texto: `Recordatorio: la clase en vivo “${clase.titulo}” es el ${fechaCorta(clase.iniciaEn).toLowerCase()} a las ${partes(clase.iniciaEn).hora}. Confirma tu asistencia desde Clases en vivo.` }));
}

export async function publicarAviso(texto) {
  await iniciar();
  const r = await q(sb.from("jump_avisos").insert({ tipo: "aviso", texto: texto.trim() }).select("*").single());
  return aAviso(r.data);
}

// ---------- muro ----------

export const MSG_MURO = {
  limite_publicaciones: "Llegaste al límite de 10 publicaciones por día.",
  limite_comentarios: "Llegaste al límite de 50 comentarios por día.",
  foto_ilegible: "Esa foto no se pudo leer. Prueba con otra o toma una captura de pantalla.",
};
// Los límites diarios los pone la base (triggers de la migración de JUMP) con raise exception.
async function qMuro(consulta) {
  let r;
  try { r = await consulta; } catch { throw new ErrorJump("red"); }
  const c = r.error && ["limite_publicaciones", "limite_comentarios"].find((x) => (r.error.message || "").includes(x));
  if (c) throw new ErrorJump(c, MSG_MURO[c]);
  return q(Promise.resolve(r));
}

// Nombre corto y negocio de cada miembro activo (jump_directorio). Se renueva con cada página del muro.
let directorio = new Map();
const autorDe = (id) => directorio.get(id) || { nombre: "Integrante de JUMP", negocio: null, rol: "emprendedor" };
const aComentario = (c) => ({
  id: c.id, postId: c.post_id, autorId: c.autor_id, texto: c.texto, creadoEn: c.creado_en,
  oculto: !!c.oculto_en, esEjemplo: !!c.es_ejemplo, autor: autorDe(c.autor_id),
});
const aPost = (p) => ({
  id: p.id, autorId: p.autor_id, texto: p.texto, foto: p.foto, fotoUrl: null, creadoEn: p.creado_en,
  oculto: !!p.oculto_en, esEjemplo: !!p.es_ejemplo, autor: autorDe(p.autor_id), comentarios: [],
});

// Una página del muro, de la más nueva a la más vieja, con sus comentarios y las fotos firmadas por 10 min.
// RLS deja fuera lo oculto (salvo para su autor y el equipo).
export async function listarPosts({ antesDe, limite = 20 } = {}) {
  await iniciar();
  let c = sb.from("jump_posts").select("*").order("creado_en", { ascending: false }).limit(limite + 1);
  if (antesDe) c = c.lt("creado_en", antesDe);
  const [ps, dir] = await Promise.all([q(c), q(sb.rpc("jump_directorio"))]);
  directorio = new Map(dir.data.map((d) => [d.user_id, { nombre: d.nombre, negocio: d.negocio, rol: d.rol }]));
  const posts = ps.data.slice(0, limite).map(aPost);
  if (posts.length) {
    const conFoto = posts.filter((p) => p.foto);
    const [cs, fs] = await Promise.all([
      q(sb.from("jump_comentarios").select("*").in("post_id", posts.map((p) => p.id)).order("creado_en")),
      conFoto.length ? q(sb.storage.from("jump-muro").createSignedUrls(conFoto.map((p) => p.foto), 600)) : { data: [] },
    ]);
    const porId = new Map(posts.map((p) => [p.id, p]));
    for (const x of cs.data) porId.get(x.post_id)?.comentarios.push(aComentario(x));
    const urls = new Map(fs.data.filter((f) => f.signedUrl).map((f) => [f.path, f.signedUrl]));
    for (const p of conFoto) p.fotoUrl = urls.get(p.foto) || null;
  }
  return { posts, hayMas: ps.data.length > limite };
}

// La foto se reduce (sin metadatos) y se sube antes que la fila; si la fila no entra, se borra la foto.
export async function publicarPost({ texto, foto }) {
  const s = await sesion();
  if (!s) throw new ErrorJump("sesion");
  let ruta = null, blob = null;
  if (foto) {
    try { blob = await reducirFoto(foto, 1600); } catch { throw new ErrorJump("foto_ilegible", MSG_MURO.foto_ilegible); }
    ruta = `${s.user.id}/${crypto.randomUUID()}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
    await q(sb.storage.from("jump-muro").upload(ruta, blob, { contentType: blob.type, upsert: false }));
  }
  let r;
  try {
    r = await qMuro(sb.from("jump_posts").insert({ texto: texto.trim(), foto: ruta }).select("*").single());
  } catch (e) {
    if (ruta) await sb.storage.from("jump-muro").remove([ruta]).catch(() => {});
    throw e;
  }
  const p = aPost(r.data);
  if (blob) p.fotoUrl = URL.createObjectURL(blob); // la que ya está en el navegador: se ve sin esperar otra descarga
  return p;
}

// Solo su autor puede borrarla (RLS); la foto se va con ella.
export async function borrarPost(id) {
  await iniciar();
  const r = await q(sb.from("jump_posts").delete().eq("id", id).select("foto"));
  const foto = r.data?.[0]?.foto;
  if (foto) await sb.storage.from("jump-muro").remove([foto]).catch(() => {});
}

export async function comentar(postId, texto) {
  await iniciar();
  let r;
  try { r = await sb.from("jump_comentarios").insert({ post_id: postId, texto: texto.trim() }).select("*").single(); } catch { throw new ErrorJump("red"); }
  // RLS no deja comentar una publicación que el equipo acaba de ocultar (o que su autor borró).
  if (r.error?.code === "42501") throw new ErrorJump("prohibido", "Ya no se puede comentar en esta publicación.");
  return aComentario((await qMuro(Promise.resolve(r))).data);
}

export async function borrarComentario(id) {
  await iniciar();
  await q(sb.from("jump_comentarios").delete().eq("id", id));
}

// Equipo: ocultar o volver a mostrar una publicación o un comentario.
export async function ocultar(tipo, id, si) {
  const s = await sesion();
  if (!s) throw new ErrorJump("sesion");
  await q(sb.from(tipo === "post" ? "jump_posts" : "jump_comentarios")
    .update(si ? { oculto_en: ahoraISO(), oculto_por: s.user.id } : { oculto_en: null, oculto_por: null }).eq("id", id));
}
