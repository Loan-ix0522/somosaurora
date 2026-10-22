// El ciclo del informe: sale solo cada 5 días y, si llegaron pocas opiniones, se mantiene el anterior.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DIAS_ENTRE_INFORMES, MIN_OPINIONES, VENTANA_DIAS, desdeDelPeriodo, proximoInforme, tocaPublicar, decidir, armarFila, rangoManual } from "../../api/_informe.js";

const DIA = 864e5;
const AHORA = new Date("2026-10-26T13:00:00.000Z");
const informeDe = (hasta) => ({ periodo_hasta: new Date(hasta).toISOString() });

test("las reglas: un informe cada 5 días y mínimo 10 opiniones para publicar uno nuevo", () => {
  assert.equal(DIAS_ENTRE_INFORMES, 5);
  assert.equal(MIN_OPINIONES, 10);
  assert.equal(VENTANA_DIAS, 30);
});

test("el periodo nuevo arranca donde terminó el informe anterior; si no hay ninguno, en los últimos 30 días", () => {
  const ultimo = informeDe("2026-10-21T13:00:00.000Z");
  assert.equal(desdeDelPeriodo(ultimo, AHORA).toISOString(), "2026-10-21T13:00:00.000Z");
  assert.equal(desdeDelPeriodo(null, AHORA).toISOString(), new Date(AHORA.getTime() - 30 * DIA).toISOString());
});

test("el próximo informe es 5 días después del corte del anterior (null si no hay anterior)", () => {
  assert.equal(proximoInforme(informeDe("2026-10-21T13:00:00.000Z")).toISOString(), "2026-10-26T13:00:00.000Z");
  assert.equal(proximoInforme(null), null);
});

test("toca publicar si no hay ninguno o si ya pasaron 5 días; un día antes todavía no", () => {
  assert.equal(tocaPublicar(null, AHORA), true);
  assert.equal(tocaPublicar(informeDe("2026-10-21T13:00:00.000Z"), AHORA), true);                       // justo 5 días
  assert.equal(tocaPublicar(informeDe("2026-10-21T13:00:01.000Z"), AHORA), false);                      // 1 s antes
  assert.equal(tocaPublicar(informeDe("2026-10-25T13:00:00.000Z"), AHORA), false);                      // ayer
  assert.equal(tocaPublicar(informeDe("2026-10-10T13:00:00.000Z"), AHORA), true);                       // hace 16 días
});

test("un informe manual de hoy reinicia el reloj: el automático espera 5 días desde el corte del manual", () => {
  const manualHoy = informeDe(AHORA);
  assert.equal(tocaPublicar(manualHoy, AHORA), false);
  assert.equal(tocaPublicar(manualHoy, new Date(AHORA.getTime() + 5 * DIA)), true);
});

test("decidir: no toca → se mantiene; toca pero hay pocas opiniones → se mantiene; toca y alcanzan → publica", () => {
  const viejo = informeDe("2026-10-21T13:00:00.000Z"), reciente = informeDe("2026-10-25T13:00:00.000Z");
  assert.deepEqual(decidir(reciente, AHORA, 500), { accion: "mantener", motivo: "aun-no-toca" });
  assert.deepEqual(decidir(viejo, AHORA, MIN_OPINIONES - 1), { accion: "mantener", motivo: "pocas-opiniones" });
  assert.deepEqual(decidir(viejo, AHORA, 0), { accion: "mantener", motivo: "pocas-opiniones" });
  assert.deepEqual(decidir(viejo, AHORA, undefined), { accion: "mantener", motivo: "pocas-opiniones" });
  assert.deepEqual(decidir(viejo, AHORA, MIN_OPINIONES), { accion: "publicar" });
  assert.deepEqual(decidir(null, AHORA, 25), { accion: "publicar" });
});

test("si el periodo se alarga porque llegaron pocas, el informe sale en cuanto alcanzan (con un periodo más largo)", () => {
  const viejo = informeDe("2026-10-21T13:00:00.000Z");
  const dia7 = new Date("2026-10-28T13:00:00.000Z");
  assert.equal(decidir(viejo, new Date("2026-10-26T13:00:00.000Z"), 6).accion, "mantener");
  assert.equal(decidir(viejo, new Date("2026-10-27T13:00:00.000Z"), 9).accion, "mantener");
  assert.equal(decidir(viejo, dia7, 12).accion, "publicar");
  assert.equal(desdeDelPeriodo(viejo, dia7).toISOString(), "2026-10-21T13:00:00.000Z"); // el periodo sigue arrancando en el corte anterior
});

test("armarFila: lo que se guarda en informe_publico (conteos por tema, porcentajes que suman 100)", () => {
  const fila = armarFila("automatico", new Date("2026-10-21T13:00:00.000Z"), AHORA, { "Basura y aseo": 8, "Calles y baches": 2 }, 10);
  assert.deepEqual(Object.keys(fila).sort(), ["origen", "periodo_desde", "periodo_hasta", "por_tema", "total"]);
  assert.equal(fila.origen, "automatico");
  assert.equal(fila.periodo_desde, "2026-10-21T13:00:00.000Z");
  assert.equal(fila.periodo_hasta, "2026-10-26T13:00:00.000Z");
  assert.equal(fila.total, 10);
  assert.deepEqual(fila.por_tema.slice(0, 2), [{ tema: "Basura y aseo", total: 8, porcentaje: 80 }, { tema: "Calles y baches", total: 2, porcentaje: 20 }]);
  assert.equal(fila.por_tema.reduce((a, t) => a + t.porcentaje, 0), 100);
});

test("armarFila: no arma un informe vacío ni con un origen raro", () => {
  assert.throws(() => armarFila("manual", AHORA, AHORA, {}, 0), /vac/i);
  assert.throws(() => armarFila("magia", AHORA, AHORA, { "Basura y aseo": 3 }, 3), /origen/i);
});

// ---- Rango de fechas del informe manual (días de Ecuador, UTC-5 sin horario de verano) ----
const HOY = new Date("2026-10-26T15:30:00.000Z"); // 10:30 del 26 de octubre en Ecuador

test("rangoManual: los días son de Ecuador: del 00:00 del primer día al 00:00 del día siguiente al último", () => {
  const r = rangoManual("2026-10-10", "2026-10-12", HOY);
  assert.equal(r.desde.toISOString(), "2026-10-10T05:00:00.000Z");
  assert.equal(r.hasta.toISOString(), "2026-10-13T05:00:00.000Z");
});

test("rangoManual: si 'hasta' es hoy, el corte es ahora (no se cuentan opiniones del futuro)", () => {
  const r = rangoManual("2026-10-20", "2026-10-26", HOY);
  assert.equal(r.hasta.toISOString(), HOY.toISOString());
  const unDia = rangoManual("2026-10-26", "2026-10-26", HOY);
  assert.equal(unDia.desde.toISOString(), "2026-10-26T05:00:00.000Z");
  assert.equal(unDia.hasta.toISOString(), HOY.toISOString());
});

test("rangoManual: pasada la medianoche de Ecuador ya es otro día (04:59 UTC todavía es el día anterior)", () => {
  const r = rangoManual("2026-10-25", "2026-10-25", new Date("2026-10-26T04:59:00.000Z"));
  assert.equal(r.hasta.toISOString(), "2026-10-26T04:59:00.000Z"); // todavía es 25 en Ecuador: corta ahora
  assert.throws(() => rangoManual("2026-10-26", "2026-10-26", new Date("2026-10-26T04:59:00.000Z")), /todavía no/i);
});

test("rangoManual: rechaza lo que no es una fecha real, fechas futuras, al revés o más de 31 días", () => {
  for (const [d, h] of [["2026-10-1", "2026-10-12"], ["10/10/2026", "2026-10-12"], ["2026-02-30", "2026-03-02"], ["2026-13-01", "2026-13-02"], ["", "2026-10-12"], [null, "2026-10-12"], [20261010, "2026-10-12"], ["2026-10-10", undefined]]) {
    assert.throws(() => rangoManual(d, h, HOY), /fecha/i, `${d} → ${h}`);
  }
  assert.throws(() => rangoManual("2026-10-12", "2026-10-10", HOY), /posterior|antes/i);
  assert.throws(() => rangoManual("2026-10-20", "2026-10-27", HOY), /todavía no/i);
  assert.throws(() => rangoManual("2026-10-27", "2026-10-28", HOY), /todavía no/i);
  assert.throws(() => rangoManual("2026-09-01", "2026-10-10", HOY), /31 días/);
  assert.doesNotThrow(() => rangoManual("2026-09-10", "2026-10-10", HOY)); // exactamente 31 días
});
