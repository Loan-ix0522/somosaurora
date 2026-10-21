// Videos incrustados (solo YouTube sin cookies y Vimeo) y archivo de calendario de una clase.
import { test } from "node:test";
import assert from "node:assert/strict";
import { embedVideo, icsDeClase } from "../../jump/comunidad/js/medios.js";

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
