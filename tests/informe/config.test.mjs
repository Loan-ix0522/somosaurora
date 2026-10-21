// Configuración de Vercel del informe: el cron que lo publica solo y que no choque con los límites del plan Hobby
// (como mucho 2 crons y cada uno una vez al día como máximo).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const raiz = new URL("../../", import.meta.url);
const vercel = JSON.parse(readFileSync(new URL("vercel.json", raiz), "utf8"));

test("el informe se publica solo: hay un cron diario para /api/informe-auto y existe el endpoint", () => {
  const cron = vercel.crons.find((c) => c.path === "/api/informe-auto");
  assert.ok(cron, "falta el cron de /api/informe-auto");
  assert.ok(existsSync(new URL("api/informe-auto.js", raiz)));
  assert.match(cron.schedule, /^\d{1,2} \d{1,2} \* \* \*$/, "una vez al día, a una hora fija");
});

test("sigue la limpieza diaria y no se pasa de los 2 crons del plan Hobby", () => {
  assert.ok(vercel.crons.some((c) => c.path === "/api/purge"));
  assert.ok(vercel.crons.length <= 2);
  for (const c of vercel.crons) assert.match(c.schedule, /^\d{1,2} \d{1,2} \* \* \*$/, c.path);
});

test("el informe automático corre después de la limpieza (el conteo no se adelanta a la purga de 30 días)", () => {
  const hora = (p) => { const [m, h] = vercel.crons.find((c) => c.path === p).schedule.split(" "); return Number(h) * 60 + Number(m); };
  assert.ok(hora("/api/informe-auto") > hora("/api/purge"));
});
