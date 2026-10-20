// /admin/panel-visitas.js: lo que el panel calcula y muestra de las visitas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const P = require("../../admin/panel-visitas.js");
const leer = (f) => readFileSync(new URL("../../" + f, import.meta.url), "utf8");

test("agrupar: una fila por navegador con N visitas, última y primera vez y páginas distintas", () => {
  const filas = [
    { creada_en: "2026-10-19T17:00:00Z", ruta: "/", visitante: "abc123-xyz", pais: "EC", ciudad: null, dispositivo: "movil", ip: null },
    { creada_en: "2026-10-19T16:00:00Z", ruta: "/terminos.html", visitante: "abc123-xyz", pais: "EC", ciudad: "Daule", dispositivo: "movil", ip: "186.4.20.7" },
    { creada_en: "2026-10-19T15:00:00Z", ruta: "/", visitante: null, pais: "US", ciudad: "Miami", dispositivo: "escritorio", ip: "8.8.4.4" },
    { creada_en: "2026-10-19T14:00:00Z", ruta: "/", visitante: "zz9", pais: null, ciudad: null, dispositivo: "tablet", ip: null },
    { creada_en: "2026-10-19T13:00:00Z", ruta: "/", visitante: null, pais: null, ciudad: null, dispositivo: null, ip: null },
  ];
  assert.deepEqual(P.agrupar(filas), [
    { codigo: "ABC123", anonimo: false, visitas: 2, ultima: "2026-10-19T17:00:00Z", primera: "2026-10-19T16:00:00Z", pais: "EC", ciudad: "Daule", dispositivo: "movil", ip: "186.4.20.7", paginas: 2 },
    { codigo: null, anonimo: true, visitas: 2, ultima: "2026-10-19T15:00:00Z", primera: "2026-10-19T13:00:00Z", pais: "US", ciudad: "Miami", dispositivo: "escritorio", ip: "8.8.4.4", paginas: 1 },
    { codigo: "ZZ9", anonimo: false, visitas: 1, ultima: "2026-10-19T14:00:00Z", primera: "2026-10-19T14:00:00Z", pais: null, ciudad: null, dispositivo: "tablet", ip: null, paginas: 1 },
  ]);
});

test("textos: hora de Ecuador, nombre de la página, aparato y país", () => {
  assert.match(P.hora("2026-10-19T19:05:00Z"), /^19 oct.* 14:05$/);
  assert.match(P.hora("2026-10-20T03:30:00Z"), /^19 oct.* 22:30$/); // todavía 19 en Ecuador
  assert.equal(P.pagina("/"), "Portada");
  assert.equal(P.pagina("/politica-datos.html"), "Política de datos");
  assert.equal(P.pagina("/otra"), "/otra");
  assert.equal(P.aparato("movil"), "Celular");
  assert.equal(P.aparato("escritorio"), "Computadora");
  assert.equal(P.aparato(null), "—");
  assert.equal(P.lugar("Daule", "EC"), "Daule, Ecuador");
  assert.equal(P.lugar(null, "US"), "Estados Unidos");
  assert.equal(P.lugar(null, null), "—");
});

test("cargar: si falta la migración 0006 avisa que no está activado; si no, trae resumen y visitas", async () => {
  const falta = { rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.estadisticas_visitas" } }), from: () => { throw new Error("no debería leer"); } };
  assert.deepEqual(await P.cargar(falta), { listo: false });

  const pedidos = [];
  const stats = { visitas_total: 3, personas_total: 2, visitas_hoy: 1, personas_hoy: 1, visitas_semana: 3, personas_semana: 2 };
  const filas = [{ creada_en: "2026-10-19T17:00:00Z", ruta: "/", visitante: "a", pais: "EC", dispositivo: "movil", procedencia: null }];
  const consulta = {
    select(c) { pedidos.push(["select", c]); return this; },
    order(c, o) { pedidos.push(["order", c, o]); return this; },
    limit(n) { pedidos.push(["limit", n]); return Promise.resolve({ data: filas, error: null }); },
  };
  const db = { rpc: async (f) => { pedidos.push(["rpc", f]); return { data: stats, error: null }; }, from: (t) => { pedidos.push(["from", t]); return consulta; } };
  assert.deepEqual(await P.cargar(db), { listo: true, stats, filas });
  assert.deepEqual(pedidos, [
    ["rpc", "estadisticas_visitas"], ["from", "visitas"],
    ["select", "creada_en,ruta,visitante,pais,ciudad,dispositivo,procedencia,ip"], ["order", "creada_en", { ascending: false }], ["limit", 1000],
  ]);

  const roto = { rpc: async () => ({ data: null, error: { code: "500", message: "boom" } }) };
  await assert.rejects(P.cargar(roto), /boom/);
});

test("el panel carga /admin/panel-visitas.js con ruta absoluta y tiene su sección de visitas", () => {
  const html = leer("admin/index.html");
  assert.match(html, /<script src="\/admin\/panel-visitas\.js"><\/script>/);
  assert.match(html, /id="visitasPanel"/);
  assert.match(html, /AuroraVisitas\.montar\(db, \$\('#visitasPanel'\)\)/);
});
