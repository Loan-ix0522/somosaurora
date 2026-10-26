// Permisos de la migración 0003: encuestas. En la comunidad votan los inscritos (por RPC); en la página de JUMP vota
// cualquiera, pero ese voto lo guarda la API con service_role. Desde el navegador nadie escribe votos directo.
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { crearBase, aplicarMigracion, como } from "./sim/db.mjs";
import { crearEscenario } from "./sim/escenario.mjs";

let db, X, enc, o1, o2;
before(async () => { db = await crearBase(); X = await crearEscenario(db); });

const filas = async (quien, sql, params) => (await como(db, quien, sql, params)).rows;
const una = async (quien, sql, params) => (await filas(quien, sql, params))[0];
const nueva = async (pregunta, estado = "borrador") =>
  (await una("service", "insert into jump_encuestas (pregunta, estado) values ($1, $2) returning id", [pregunta, estado])).id;
const opcion = async (encuesta, texto, orden = 0) =>
  (await una("service", "insert into jump_encuesta_opciones (encuesta_id, texto, orden) values ($1, $2, $3) returning id", [encuesta, texto, orden])).id;

// Cada caso arranca con una encuesta abierta nueva y dos opciones del equipo (solo puede haber una abierta).
beforeEach(async () => {
  await como(db, "service", "update jump_encuestas set estado = 'cerrada' where estado = 'abierta'");
  enc = await nueva("¿Qué curso quieres para el próximo mes?", "abierta");
  o1 = await opcion(enc, "Feria de Navidad", 1);
  o2 = await opcion(enc, "Fotos para redes", 2);
});

test("anon no lee ni ejecuta nada de encuestas", async () => {
  for (const t of ["jump_encuestas", "jump_encuesta_opciones", "jump_encuesta_votos"])
    await assert.rejects(como(db, "anon", `select * from ${t}`), /permission denied/);
  const rpc = [["jump_votar($1)", [o1]], ["jump_proponer($1, $2)", [enc, "Algo nuevo"]], ["jump_encuesta_resultados($1)", [enc]],
    ["jump_encuesta_conteos($1)", [enc]], ["jump_abrir_encuesta($1)", [enc]]];
  for (const [f, args] of rpc) await assert.rejects(como(db, "anon", `select * from ${f}`, args), /permission denied/, f);
});

test("el emprendedor ve la abierta y las cerradas, no los borradores", async () => {
  const b = await nueva("Borrador del equipo");
  const c = await nueva("Encuesta que ya cerró", "cerrada");
  await opcion(b, "Opción todavía oculta");
  const ids = (await filas(X.E, "select id from jump_encuestas")).map((r) => r.id);
  assert.ok(ids.includes(enc) && ids.includes(c));
  assert.ok(!ids.includes(b), "el borrador no se ve");
  assert.equal((await filas(X.E, "select 1 from jump_encuesta_opciones where encuesta_id = $1", [b])).length, 0);
  assert.equal((await filas(X.E, "select 1 from jump_encuesta_opciones where encuesta_id = $1", [enc])).length, 2);
  assert.ok((await filas(X.A, "select id from jump_encuestas")).some((r) => r.id === b), "el equipo sí ve el borrador");
  for (const quien of [X.S, X.N, X.U]) assert.equal((await filas(quien, "select 1 from jump_encuestas")).length, 0);
});

test("el emprendedor vota, cambia su voto y queda uno solo", async () => {
  await como(db, X.E, "select jump_votar($1)", [o1]);
  await como(db, X.E, "select jump_votar($1)", [o2]);
  const v = await filas("service", "select user_id, opcion_id, origen from jump_encuesta_votos where encuesta_id = $1", [enc]);
  assert.deepEqual(v, [{ user_id: X.E.id, opcion_id: o2, origen: "inscrito" }]);
  assert.equal((await una(X.E, "select opcion_id from jump_encuesta_votos where encuesta_id = $1", [enc])).opcion_id, o2);
  assert.equal((await filas(X.E2, "select 1 from jump_encuesta_votos where encuesta_id = $1", [enc])).length, 0, "no ve votos ajenos");
});

test("nadie inserta votos directo ni lee las huellas", async () => {
  await assert.rejects(como(db, X.E, "insert into jump_encuesta_votos (encuesta_id, opcion_id, origen, user_id) values ($1, $2, 'inscrito', $3)",
    [enc, o1, X.E.id]), /permission denied|row-level security/);
  for (const col of ["ip_hash", "dispositivo_hash"]) await assert.rejects(como(db, X.A, `select ${col} from jump_encuesta_votos`), /permission denied/);
  await como(db, X.E, "select jump_votar($1)", [o1]);
  await assert.rejects(como(db, X.E, "update jump_encuesta_votos set opcion_id = $1", [o2]), /permission denied/);
  await assert.rejects(como(db, X.E, "delete from jump_encuesta_votos"), /permission denied/);
});

test("el voto público solo lo guarda la API (service_role), con el tope por conexión en la base", async () => {
  for (const quien of ["anon", X.E, X.A])
    await assert.rejects(como(db, quien, "select jump_voto_publico($1, 'disp-z', 'ip-z', 30)", [o1]), /permission denied/);
  const votar = async (disp, ip, op = o1) => (await una("service", "select jump_voto_publico($1, $2, $3, 2) r", [op, disp, ip])).r;
  assert.equal(await votar("disp-1", "ip-z"), "ok");
  assert.equal(await votar("disp-2", "ip-z"), "ok");
  assert.equal(await votar("disp-3", "ip-z"), "tope");
  assert.equal(await votar("disp-1", "ip-z", o2), "ok", "quien ya votó puede cambiar su voto");
  assert.equal((await filas("service", "select 1 from jump_encuesta_votos where encuesta_id = $1", [enc])).length, 2);
  await como(db, "service", "update jump_encuestas set estado = 'cerrada' where id = $1", [enc]);
  assert.equal(await votar("disp-4", "ip-y"), "cerrada");
});

test("suspendida no vota", async () => {
  for (const quien of [X.S, X.N, X.U]) await assert.rejects(como(db, quien, "select jump_votar($1)", [o1]), /sin_acceso/);
  await assert.rejects(como(db, X.S, "select jump_proponer($1, $2)", [enc, "Idea de alguien suspendido"]), /sin_acceso/);
});

test("en una encuesta cerrada no se vota ni se propone", async () => {
  await como(db, "service", "update jump_encuestas set estado = 'cerrada' where id = $1", [enc]);
  await assert.rejects(como(db, X.E, "select jump_votar($1)", [o1]), /jump_encuesta_cerrada/);
  await assert.rejects(como(db, X.E, "select jump_proponer($1, $2)", [enc, "Una idea que llega tarde"]), /jump_encuesta_cerrada/);
  const b = await nueva("Borrador que nadie ve");
  await assert.rejects(como(db, X.E, "select jump_votar($1)", [await opcion(b, "Opción del borrador")]), /jump_encuesta_cerrada/);
});

test("proponer crea la opción, vota por ella y solo una vez", async () => {
  const { id } = await una(X.E, "select jump_proponer($1, $2) id", [enc, "  Contabilidad   básica "]);
  assert.deepEqual(await una("service", "select texto, propuesta_por from jump_encuesta_opciones where id = $1", [id]),
    { texto: "Contabilidad básica", propuesta_por: X.E.id });
  assert.equal((await una("service", "select opcion_id from jump_encuesta_votos where encuesta_id = $1 and user_id = $2", [enc, X.E.id])).opcion_id, id);
  await assert.rejects(como(db, X.E, "select jump_proponer($1, $2)", [enc, "Otra idea más"]), /jump_ya_propuso/);
  await assert.rejects(como(db, X.E2, "select jump_proponer($1, $2)", [enc, "  feria de NAVIDAD "]),
    (e) => e.code === "23505" && /jump_idea_repetida/.test(e.message));
  await como(db, X.E2, "select jump_proponer($1, $2)", [enc, "Atención al cliente"]); // la repetida no le cuenta
  await assert.rejects(como(db, X.A, "select jump_proponer($1, $2)", [enc, " x "]), /check constraint/); // muy corta
});

test("una idea por persona y encuesta, aunque proponga desde dos pestañas a la vez", async () => {
  await una(X.E, "select jump_proponer($1, $2) id", [enc, "Contabilidad básica"]);
  // Dos pestañas pasan la revisión antes de que la otra guarde: la base deja entrar solo una idea de esa persona.
  await assert.rejects(como(db, "service", "insert into jump_encuesta_opciones (encuesta_id, texto, propuesta_por) values ($1, 'Segunda idea de E', $2)",
    [enc, X.E.id]), /jump_encuesta_opciones_una_por_persona/);
  // En otra encuesta, y otra persona en esta, sí.
  await como(db, "service", "update jump_encuestas set estado = 'cerrada' where id = $1", [enc]);
  const otra = await nueva("¿Qué curso quieres en febrero?", "abierta");
  await una(X.E, "select jump_proponer($1, $2) id", [otra, "Contabilidad básica"]);
  await una(X.E2, "select jump_proponer($1, $2) id", [otra, "Atención al cliente"]);
});

test("las huellas del voto público se borran 30 días después de cerrar la encuesta; el voto sigue contando", async () => {
  for (const quien of ["anon", X.E, X.A]) await assert.rejects(como(db, quien, "select jump_olvidar_huellas()"), /permission denied/);
  await assert.rejects(una("service", "select jump_voto_publico($1, null, 'ip-h', 30) r", [o1]), /sin_huella/);
  const votar = async (disp, op = o1) => (await una("service", "select jump_voto_publico($1, $2, 'ip-h', 30) r", [op, disp])).r;
  const huellas = async (e) => (await una("service", "select count(*)::int n from jump_encuesta_votos where encuesta_id = $1 and (ip_hash is not null or dispositivo_hash is not null)", [e])).n;
  assert.equal(await votar("disp-h1"), "ok");
  assert.equal(await votar("disp-h2", o2), "ok");
  await como(db, "service", "update jump_encuestas set estado = 'cerrada' where id = $1", [enc]);
  await como(db, "service", "select jump_olvidar_huellas()");
  assert.equal(await huellas(enc), 2, "recién cerrada se guardan: si el equipo la vuelve a abrir, cada aparato sigue con un voto");
  await como(db, "service", "update jump_encuestas set cerrada_en = now() - interval '31 days' where id = $1", [enc]);
  await como(db, "service", "select jump_olvidar_huellas()");
  assert.equal(await huellas(enc), 0);
  const r = await filas(X.E, "select opcion_id, porcentaje from jump_encuesta_resultados($1)", [enc]);
  assert.deepEqual(Object.fromEntries(r.map((x) => [x.opcion_id, x.porcentaje])), { [o1]: 50, [o2]: 50 }, "los votos siguen contando");
  // Un voto en la encuesta abierta también limpia lo viejo.
  const vieja = await nueva("Encuesta de hace meses", "cerrada");
  const ov = await opcion(vieja, "Opción vieja");
  await como(db, "service", "insert into jump_encuesta_votos (encuesta_id, opcion_id, origen, dispositivo_hash, ip_hash) values ($1, $2, 'publico', 'disp-v', 'ip-v')", [vieja, ov]);
  await como(db, "service", "update jump_encuestas set cerrada_en = now() - interval '40 days' where id = $1", [vieja]);
  await como(db, "service", "update jump_encuestas set estado = 'abierta' where id = $1", [enc]);
  assert.equal(await votar("disp-h3"), "ok");
  assert.equal(await huellas(vieja), 0);
});

test("el equipo guarda la encuesta en un paso: puede intercambiar dos textos y, si algo falla, no cambia nada", async () => {
  const guardar = async (quien, id, pregunta, ops, quitar = []) =>
    (await una(quien, "select jump_guardar_encuesta($1, $2, $3::jsonb, $4::uuid[]) id", [id, pregunta, JSON.stringify(ops), quitar])).id;
  const opciones = async (e) => (await filas("service", "select id, texto, orden from jump_encuesta_opciones where encuesta_id = $1 order by orden, creada_en", [e]));
  for (const quien of ["anon", X.E]) await assert.rejects(guardar(quien, enc, "Cambiada sin permiso", [{ id: o1, texto: "Otra" }]), /permission denied|sin_acceso/);
  await como(db, X.E, "select jump_votar($1)", [o1]);
  const { id: idea } = await una(X.E2, "select jump_proponer($1, $2) id", [enc, "Atención al cliente"]);
  // o1 y o2 se cambian el texto (cada voto sigue en su opción) y se agrega una nueva; la idea de E2 no se toca.
  assert.equal(await guardar(X.A, enc, "¿Qué curso quieres en enero?", [{ id: o1, texto: "Fotos para redes" }, { id: o2, texto: "Feria de Navidad" }, { texto: "Ventas por WhatsApp" }]), enc);
  let o = await opciones(enc);
  assert.deepEqual(o.map((x) => [x.id === o1 ? "o1" : x.id === o2 ? "o2" : x.id === idea ? "idea" : "nueva", x.texto, x.orden]),
    [["o1", "Fotos para redes", 1], ["o2", "Feria de Navidad", 2], ["idea", "Atención al cliente", 3], ["nueva", "Ventas por WhatsApp", 3]]);
  const nuevaId = o.find((x) => x.texto === "Ventas por WhatsApp").id;
  assert.equal((await una("service", "select pregunta from jump_encuestas where id = $1", [enc])).pregunta, "¿Qué curso quieres en enero?");
  assert.equal((await una("service", "select opcion_id from jump_encuesta_votos where user_id = $1 and encuesta_id = $2", [X.E.id, enc])).opcion_id, o1);
  // Dos textos iguales: no se guarda nada (ni la pregunta, ni lo que se quitaba).
  await assert.rejects(guardar(X.A, enc, "Pregunta que no debe quedar", [{ id: o1, texto: "Lo mismo" }, { id: o2, texto: "LO MISMO" }, { texto: "Otra más" }], [idea]),
    (e) => e.code === "23505");
  assert.deepEqual(await opciones(enc), o);
  assert.equal((await una("service", "select pregunta from jump_encuestas where id = $1", [enc])).pregunta, "¿Qué curso quieres en enero?");
  // Quitar borra solo las de esa encuesta, con sus votos.
  const ajena = await opcion(await nueva("Encuesta ajena"), "Opción ajena");
  await guardar(X.A, enc, "¿Qué curso quieres en enero?", [{ id: o2, texto: "Feria de Navidad" }], [o1, nuevaId, ajena]);
  o = await opciones(enc);
  assert.deepEqual(o.map((x) => x.texto), ["Feria de Navidad", "Atención al cliente"]);
  assert.equal((await filas("service", "select 1 from jump_encuesta_votos where opcion_id = $1", [o1])).length, 0);
  assert.equal((await filas("service", "select 1 from jump_encuesta_opciones where id = $1", [ajena])).length, 1, "la de otra encuesta sigue");
  // Sin id crea un borrador con sus opciones en orden.
  const n = await guardar(X.A, null, "¿Qué taller quieres en marzo?", [{ texto: "Costos" }, { texto: "Precios" }]);
  assert.equal((await una("service", "select estado from jump_encuestas where id = $1", [n])).estado, "borrador");
  assert.deepEqual((await opciones(n)).map((x) => [x.texto, x.orden]), [["Costos", 1], ["Precios", 2]]);
});

test("quién propuso cada idea lo ve solo el equipo; cada inscrito sabe cuál es la suya", async () => {
  const { id } = await una(X.E, "select jump_proponer($1, $2) id", [enc, "Contabilidad básica"]);
  // Con el directorio de la comunidad, propuesta_por diría quién la propuso (y por qué votó al proponerla).
  for (const quien of [X.E, X.E2, X.A]) await assert.rejects(como(db, quien, "select propuesta_por from jump_encuesta_opciones"), /permission denied/);
  const propias = async (quien) => Object.fromEntries((await filas(quien, "select opcion_id, propia from jump_encuesta_resultados($1)", [enc])).map((x) => [x.opcion_id, x.propia]));
  assert.deepEqual(await propias(X.E), { [o1]: false, [o2]: false, [id]: true });
  assert.deepEqual(await propias(X.E2), { [o1]: false, [o2]: false, [id]: false });
  const c = await filas(X.A, "select opcion_id, propuesta_por from jump_encuesta_conteos($1)", [enc]);
  assert.equal(c.find((x) => x.opcion_id === id).propuesta_por, X.E.id);
  assert.equal(c.find((x) => x.opcion_id === o1).propuesta_por, null);
});

test("resultados: porcentajes sin conteos para el emprendedor; conteos por origen solo para el equipo", async () => {
  await como(db, X.E, "select jump_votar($1)", [o1]);
  await como(db, "service", "insert into jump_encuesta_votos (encuesta_id, opcion_id, origen, dispositivo_hash, ip_hash) values ($1, $2, 'publico', 'disp-1', 'ip-1')", [enc, o2]);
  const r = await filas(X.E, "select * from jump_encuesta_resultados($1)", [enc]);
  assert.deepEqual(Object.keys(r[0]).sort(), ["opcion_id", "porcentaje", "propia"]);
  assert.deepEqual(Object.fromEntries(r.map((x) => [x.opcion_id, x.porcentaje])), { [o1]: 50, [o2]: 50 });
  assert.equal((await filas("service", "select * from jump_encuesta_resultados($1)", [enc])).length, 2, "la API pública también");
  await assert.rejects(como(db, X.E, "select * from jump_encuesta_conteos($1)", [enc]), /sin_acceso/);
  const c = await filas(X.A, "select opcion_id, publico, inscritos from jump_encuesta_conteos($1)", [enc]);
  const m = Object.fromEntries(c.map((x) => [x.opcion_id, { publico: x.publico, inscritos: x.inscritos }]));
  assert.deepEqual(m[o1], { publico: 0, inscritos: 1 });
  assert.deepEqual(m[o2], { publico: 1, inscritos: 0 });
  const vacia = await nueva("Encuesta sin votos", "cerrada");
  await opcion(vacia, "Nadie votó aquí");
  assert.deepEqual((await filas(X.E, "select porcentaje from jump_encuesta_resultados($1)", [vacia])).map((x) => x.porcentaje), [0]);
});

test("solo una abierta: abrir otra cierra la anterior", async () => {
  const b = await nueva("La siguiente encuesta");
  await assert.rejects(como(db, X.E, "select jump_abrir_encuesta($1)", [b]), /sin_acceso/);
  await como(db, X.A, "select jump_abrir_encuesta($1)", [b]);
  const a = await una("service", "select estado, cerrada_en from jump_encuestas where id = $1", [enc]);
  assert.equal(a.estado, "cerrada");
  assert.ok(a.cerrada_en, "cerrada_en puesto");
  const nb = await una("service", "select estado, abierta_en from jump_encuestas where id = $1", [b]);
  assert.equal(nb.estado, "abierta");
  assert.ok(nb.abierta_en, "abierta_en puesto");
  await assert.rejects(como(db, "service", "update jump_encuestas set estado = 'abierta' where id = $1", [enc]), /jump_encuestas_una_abierta/);
});

test("el equipo arma la encuesta; un emprendedor no", async () => {
  await como(db, X.A, "insert into jump_encuesta_opciones (encuesta_id, texto) values ($1, 'Opción del equipo')", [enc]);
  await como(db, X.A, "update jump_encuestas set pregunta = '¿Qué taller prefieres?' where id = $1", [enc]);
  assert.equal((await una("service", "select pregunta from jump_encuestas where id = $1", [enc])).pregunta, "¿Qué taller prefieres?");
  await assert.rejects(como(db, X.E, "insert into jump_encuesta_opciones (encuesta_id, texto) values ($1, 'Opción colada')", [enc]),
    /permission denied|row-level security/);
  await como(db, X.E, "update jump_encuestas set pregunta = 'Cambiada por E' where id = $1", [enc]).catch(() => {});
  assert.equal((await una("service", "select pregunta from jump_encuestas where id = $1", [enc])).pregunta, "¿Qué taller prefieres?");
  await assert.rejects(como(db, X.A, "insert into jump_encuesta_opciones (encuesta_id, texto) values ($1, ' con espacios ')", [enc]), /check constraint/);
});

test("borrar una opción borra sus votos", async () => {
  await como(db, X.E, "select jump_votar($1)", [o1]);
  await como(db, X.A, "delete from jump_encuesta_opciones where id = $1", [o1]);
  assert.equal((await filas("service", "select 1 from jump_encuesta_votos where opcion_id = $1", [o1])).length, 0);
});

test("un voto no puede apuntar a una opción de otra encuesta", async () => {
  const otra = await nueva("Otra encuesta", "cerrada");
  await assert.rejects(como(db, "service", "insert into jump_encuesta_votos (encuesta_id, opcion_id, origen, dispositivo_hash) values ($1, $2, 'publico', 'disp-x')",
    [otra, o1]), /foreign key/);
});

test("la migración se puede correr dos veces", async () => {
  await aplicarMigracion(db, "0003");
  await como(db, X.E, "select jump_votar($1)", [o1]);
});
