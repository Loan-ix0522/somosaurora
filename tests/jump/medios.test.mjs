// Videos incrustados (solo YouTube sin cookies y Vimeo) y archivo de calendario de una clase.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  embedVideo, icsDeClase, esImagenReducible, nombreReducido, sumarMaterial, resumenAlmacenamiento, LIMITE_ALMACENAMIENTO,
} from "../../jump/comunidad/js/medios.js";

const YT = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";

test("embedVideo acepta los formatos de YouTube y Vimeo", () => {
  assert.equal(embedVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), YT);
  assert.equal(embedVideo("https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30"), YT);
  assert.equal(embedVideo("https://youtu.be/dQw4w9WgXcQ?si=abc"), YT);
  assert.equal(embedVideo("https://www.youtube.com/shorts/dQw4w9WgXcQ"), YT);
  assert.equal(embedVideo("https://www.youtube.com/embed/dQw4w9WgXcQ"), YT);
  assert.equal(embedVideo("https://vimeo.com/123456789"), "https://player.vimeo.com/video/123456789");
  assert.equal(embedVideo("https://vimeo.com/123456789/abcdef1234"), "https://player.vimeo.com/video/123456789?h=abcdef1234");
  assert.equal(embedVideo("https://player.vimeo.com/video/123456789"), "https://player.vimeo.com/video/123456789");
});

test("embedVideo devuelve null para todo lo demás", () => {
  for (const u of ["https://evil.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "", null, "no es url",
    "https://www.youtube.com/watch?v=corto", "https://vimeo.com/canal/abc", "https://youtu.be/dQw4w9WgXcQ\"><script>"])
    assert.equal(embedVideo(u), null, String(u));
});

test("icsDeClase arma un VCALENDAR con la hora en UTC", () => {
  const ics = icsDeClase({ id: "c1", titulo: "Dudas, RUC; y más", iniciaEn: "2026-10-22T19:00:00-05:00", duracionMin: 60 });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
  assert.ok(ics.includes("\r\nDTSTART:20261023T000000Z\r\n"));
  assert.ok(ics.includes("\r\nDTEND:20261023T010000Z\r\n"));
  assert.ok(ics.includes("\r\nSUMMARY:Dudas\\, RUC\\; y más\r\n"));
  assert.ok(ics.includes("\r\nUID:c1@comunidad-jump\r\n"));
  assert.doesNotMatch(ics.replace(/\r\n/g, ""), /\n/);
});

test("solo se reducen las imágenes que el navegador sabe volver a codificar", () => {
  for (const tipo of ["image/jpeg", "image/png", "image/webp"]) assert.equal(esImagenReducible(tipo), true, tipo);
  for (const tipo of ["application/pdf", "image/gif", "image/svg+xml", "image/heic", "", null, undefined])
    assert.equal(esImagenReducible(tipo), false, String(tipo));
});

test("nombreReducido cambia la extensión a la del formato en que se sube", () => {
  assert.equal(nombreReducido("Foto del local.PNG", "image/webp"), "Foto del local.webp");
  assert.equal(nombreReducido("catalogo.v2.jpeg", "image/webp"), "catalogo.v2.webp");
  assert.equal(nombreReducido("catalogo.webp", "image/jpeg"), "catalogo.jpg");
  assert.equal(nombreReducido("sin-extension", "image/webp"), "sin-extension.webp");
  assert.equal(nombreReducido("  espacios.png  ", "image/webp"), "espacios.webp");
  assert.equal(nombreReducido("", "image/webp"), "Imagen.webp");
});

test("sumarMaterial cuenta solo los archivos subidos, no los enlaces", () => {
  const filas = [
    { tipo: "archivo", bytes: 1000 }, { tipo: "archivo", bytes: 2500 },
    { tipo: "enlace", bytes: null }, { tipo: "archivo", bytes: null }, { tipo: "archivo", bytes: "300" },
  ];
  assert.deepEqual(sumarMaterial(filas), { archivos: 4, bytes: 3800 });
  assert.deepEqual(sumarMaterial([]), { archivos: 0, bytes: 0 });
  assert.deepEqual(sumarMaterial(null), { archivos: 0, bytes: 0 });
});

test("resumenAlmacenamiento: porcentaje y nivel según lo usado del gigabyte gratis", () => {
  assert.equal(LIMITE_ALMACENAMIENTO, 1024 ** 3);
  const r = (mb) => resumenAlmacenamiento(mb * 1024 * 1024);
  assert.deepEqual(r(0), { porcentaje: 0, nivel: "ok" });
  assert.deepEqual(r(0.01), { porcentaje: 1, nivel: "ok" });      // algo usado nunca se ve como 0 %
  assert.deepEqual(r(512), { porcentaje: 50, nivel: "ok" });
  assert.deepEqual(r(716), { porcentaje: 70, nivel: "atencion" });
  assert.deepEqual(r(900), { porcentaje: 88, nivel: "atencion" });
  assert.deepEqual(r(950), { porcentaje: 93, nivel: "lleno" });
  assert.deepEqual(r(5000), { porcentaje: 100, nivel: "lleno" }); // nunca pasa de 100
  assert.deepEqual(resumenAlmacenamiento(500, 1000), { porcentaje: 50, nivel: "ok" });
});
