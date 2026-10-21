// fechas.js no depende de la zona horaria del equipo que abre la página:
// los casos se corren dos veces en otro proceso, con TZ=UTC y con TZ=Asia/Tokyo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.env.FECHAS_CASOS) {
  for (const tz of ["UTC", "Asia/Tokyo"]) {
    test(`fechas con TZ=${tz}`, () => {
      const env = { ...process.env, TZ: tz, FECHAS_CASOS: "1" };
      delete env.NODE_TEST_CONTEXT;
      try {
        execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { env, stdio: "pipe" });
      } catch (e) {
        assert.fail(`TZ=${tz}\n${e.stdout}\n${e.stderr}`);
      }
    });
  }
} else {
  const f = await import("../../jump/comunidad/js/fechas.js");
  const gye = (s) => Date.parse(s + "-05:00");

  test("aISO arma la hora de Guayaquil", () => {
    assert.equal(f.ZONA, "America/Guayaquil");
    assert.equal(f.aISO("2026-10-22", "19:00"), "2026-10-22T19:00:00-05:00");
    assert.equal(f.aISO("2026-01-05", "07:30"), "2026-01-05T07:30:00-05:00");
    assert.throws(() => f.aISO("2026-13-01", "19:00"));
    assert.throws(() => f.aISO("2026-10-22", "25:00"));
  });

  test("partes, rango y fechaCorta en hora de Guayaquil", () => {
    assert.deepEqual(f.partes("2026-10-23T00:00:00Z"), { dow: "JUE", d: "22", mon: "OCT", hora: "19:00" });
    assert.deepEqual(f.partes("2026-11-07T15:00:00Z"), { dow: "SÁB", d: "7", mon: "NOV", hora: "10:00" });
    assert.equal(f.rango("2026-10-23T00:00:00Z", 60), "19:00 – 20:00");
    assert.equal(f.rango("2026-10-23T04:30:00Z", 90), "23:30 – 01:00");
    assert.equal(f.fechaCorta("2026-10-23T00:00:00Z"), "Jue 22 oct");
    assert.equal(f.fechaCorta("2026-11-07T15:00:00Z"), "Sáb 7 nov");
  });

  test("haceCuanto", () => {
    const ahora = gye("2026-10-22T20:00:00");
    assert.equal(f.haceCuanto(new Date(ahora - 30e3).toISOString(), ahora), "ahora");
    assert.equal(f.haceCuanto(new Date(ahora - 5 * 60e3).toISOString(), ahora), "hace 5 min");
    assert.equal(f.haceCuanto(new Date(ahora - 2 * 3600e3).toISOString(), ahora), "hace 2 h");
    assert.equal(f.haceCuanto("2026-10-21T21:00:00-05:00", ahora), "ayer");
    assert.equal(f.haceCuanto("2026-10-12T10:00:00-05:00", ahora), "lun 12 oct");
    assert.equal(f.haceCuanto("2026-10-22T00:30:00-05:00", new Date(ahora)), "hace 19 h");
  });

  test("estadoClase en los cuatro tramos (ventana de Zoom: −15 min hasta fin + 30 min)", () => {
    const c = { iniciaEn: "2026-10-22T19:00:00-05:00", duracionMin: 60 };
    assert.equal(f.estadoClase(c, gye("2026-10-22T18:44:59")), "programada");
    assert.equal(f.estadoClase(c, gye("2026-10-22T18:45:00")), "abre-pronto");
    assert.equal(f.estadoClase(c, gye("2026-10-22T18:59:59")), "abre-pronto");
    assert.equal(f.estadoClase(c, gye("2026-10-22T19:00:00")), "en-vivo");
    assert.equal(f.estadoClase(c, new Date(gye("2026-10-22T20:29:59"))), "en-vivo");
    assert.equal(f.estadoClase(c, gye("2026-10-22T20:30:00")), "terminada");
  });
}
