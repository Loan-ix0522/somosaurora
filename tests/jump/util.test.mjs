// Utilidades del servidor y de la cédula: validación, normalización, cifrado y firma.
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JUMP_SECRET = "x".repeat(40);
const { cedulaValida, limpiarCedula, usuarioValido, correoEmprendedor, correoEquipo } = await import("../../jump/comunidad/js/cedula.js");
const { whatsapp, texto, nombre } = await import("../../api/_jump/normalizar.js");
const { cifrar, descifrar, firmar, verificar, claveTemporal, errorDeClave, esUuid } = await import("../../api/_jump/secretos.js");
const { mismoOrigen, json } = await import("../../api/_jump/http.js");

// Implementación de referencia (módulo 10 del Registro Civil) para fabricar cédulas válidas en la prueba.
const verificador = (nueve) => {
  const s = [...nueve].reduce((a, d, i) => { let p = +d * (i % 2 ? 1 : 2); if (p > 9) p -= 9; return a + p; }, 0);
  return String((10 - (s % 10)) % 10);
};
const valida = (nueve) => nueve + verificador(nueve);

// Cambia un carácter interior: el último de un base64url lleva bits de relleno y cambiarlo puede no alterar los bytes.
const alterar = (s, i = s.length - 6) => s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1);

test("cédulas válidas e inválidas", () => {
  for (const c of [valida("091234567"), valida("170000000"), valida("300000001")]) assert.equal(cedulaValida(c), true, c);
  assert.equal(cedulaValida("0912345675"), true);
  assert.equal(cedulaValida("0912345678"), false, "verificador incorrecto");
  assert.equal(cedulaValida(valida("251234567")), false, "provincia 25");
  assert.equal(cedulaValida(valida("000000000")), false, "provincia 00");
  assert.equal(cedulaValida(valida("096234567")), false, "tercer dígito 6");
  assert.equal(cedulaValida("091234567"), false, "9 dígitos");
  assert.equal(cedulaValida(""), false);
});

test("limpiarCedula y correos internos", () => {
  assert.equal(limpiarCedula("091-234 5675"), "0912345675");
  assert.equal(correoEmprendedor("0912345675"), "c0912345675@cuentas.laauroraescucha.com");
  assert.equal(correoEquipo("Ana.Admin"), "ana.admin@equipo.laauroraescucha.com");
  assert.equal(usuarioValido("ana.admin"), true);
  assert.equal(usuarioValido("ab"), false);
  assert.equal(usuarioValido("Ana Admin"), false);
});

test("whatsapp normaliza formatos de Ecuador", () => {
  assert.equal(whatsapp("+593 99 123 4567"), "0991234567");
  assert.equal(whatsapp("099-123-4567"), "0991234567");
  assert.equal(whatsapp("(099) 123 4567"), "0991234567");
  assert.equal(whatsapp("593991234567"), "0991234567");
  assert.equal(whatsapp("12345"), null);
  assert.equal(whatsapp("042123456"), null, "fijo no es WhatsApp");
});

test("texto y nombre", () => {
  assert.equal(texto("  hola   mundo  ", 50), "hola mundo");
  assert.equal(texto("abcdef", 3), "abc");
  assert.equal(nombre("  María   José Vera "), "María José Vera");
  assert.equal(nombre("A"), null);
});

test("clave temporal", () => {
  const vistas = new Set();
  for (let i = 0; i < 200; i++) { const c = claveTemporal(); assert.match(c, /^JUMP-\d{4}-\d{4}$/); vistas.add(c); }
  assert.ok(vistas.size >= 190);
});

test("cifrado ida y vuelta; alterado falla", async () => {
  const sobre = await cifrar("hola");
  assert.match(sobre, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.notEqual(sobre, await cifrar("hola"), "iv distinto cada vez");
  assert.equal(await descifrar(sobre), "hola");
  const malo = alterar(sobre);
  await assert.rejects(descifrar(malo));
});

test("state firmado: válido, alterado y vencido", async () => {
  const t = await firmar({ a: 1 }, 60);
  assert.equal((await verificar(t)).a, 1);
  const [p, f] = t.split(".");
  assert.equal(await verificar(p + "." + alterar(f)), null);
  assert.equal(await verificar(btoa(JSON.stringify({ a: 2, exp: 9e12 })).replace(/=+$/, "") + "." + f), null);
  assert.equal(await verificar(await firmar({ a: 1 }, -1)), null);
  assert.equal(await verificar("basura"), null);
});

test("errorDeClave", () => {
  assert.equal(errorDeClave("abc"), "La clave debe tener al menos 8 caracteres.");
  assert.equal(errorDeClave("abcdefgh"), "La clave debe tener al menos un número.");
  assert.equal(errorDeClave("JUMP-1234-5678"), "Elige una clave distinta a la temporal.");
  assert.equal(errorDeClave("clave2026"), null);
  assert.equal(errorDeClave("x".repeat(73) + "1"), "La clave puede tener hasta 72 caracteres.");
});

test("esUuid", () => {
  assert.equal(esUuid("6f1c2a8e-1b2c-4d3e-8f90-1234567890ab"), true);
  assert.equal(esUuid("../admin"), false);
  assert.equal(esUuid("6f1c2a8e-1b2c-4d3e-8f90-1234567890ab/x"), false);
});

test("mismoOrigen y json", async () => {
  const r = (h) => new Request("https://www.laauroraescucha.com/api/jump-admin", { method: "POST", headers: h });
  assert.equal(mismoOrigen(r({ origin: "https://www.laauroraescucha.com" })), true);
  assert.equal(mismoOrigen(r({})), false);
  assert.equal(mismoOrigen(r({ origin: "https://malo.com" })), false);
  const res = json({ ok: true }, 201);
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { ok: true });
});

test("nombreSeguro y errorMaterial (subidas del equipo)", async () => {
  const { nombreSeguro, errorMaterial } = await import("../../jump/comunidad/js/datos.js");
  assert.equal(nombreSeguro("Guía precios.pdf"), "guia-precios.pdf");
  assert.equal(nombreSeguro("Guía de Precios (2026).PDF"), "guia-de-precios-2026.pdf");
  assert.equal(nombreSeguro("../../etc/passwd"), "etc-passwd");
  assert.equal(nombreSeguro("¿¿??"), "archivo");
  assert.match(nombreSeguro("a".repeat(200) + ".pdf"), /^a{76}\.pdf$/);
  assert.equal(errorMaterial({ name: "x.pdf", size: 1024, type: "application/pdf" }), "");
  assert.match(errorMaterial({ name: "x.pdf", size: 21 * 1024 * 1024, type: "application/pdf" }), /20 MB/);
  assert.match(errorMaterial({ name: "x.exe", size: 10, type: "application/x-msdownload" }), /solo se aceptan/);
});
