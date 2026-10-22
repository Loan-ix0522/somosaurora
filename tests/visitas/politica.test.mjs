// La política de datos tiene que contar lo que hace el contador de visitas, y su fecha es la versión
// del consentimiento que guarda /api/submit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const leer = (f) => readFileSync(new URL("../../" + f, import.meta.url), "utf8");
const texto = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

test("la política avisa del registro de visitas con IP, su base legal y que la IP se borra a los 30 días", () => {
  const t = texto(leer("politica-datos.html"));
  assert.doesNotMatch(t, /No guardamos tu dirección IP en claro/);
  assert.match(t, /Cuando visitas cualquier página de este sitio, registramos la visita/);
  assert.match(t, /tu dirección IP/);
  assert.match(t, /interés legítimo/);
  assert.match(t, /La dirección IP de cada visita se elimina a los 30 días/);
});

test("CONSENT_VERSION de /api/submit es la fecha de «Última actualización» de la política", () => {
  const m = leer("politica-datos.html").match(/Última actualización: (\d{1,2}) de (\w+) de (\d{4})/);
  assert.ok(m, "no encontré la fecha de la política");
  const fecha = `${m[3]}-${String(MESES.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const version = leer("api/submit.js").match(/CONSENT_VERSION = "([\d-]+)"/)[1];
  assert.equal(version, fecha);
  assert.equal(fecha, "2026-10-19");
});
