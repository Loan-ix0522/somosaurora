// Corre todos los grupos de interfaz (cdp.mjs), en escritorio y en celular, uno tras otro.
//
//   node tests/jump/ui/todo.mjs [--fotos <carpeta>]
//
// Cada grupo arranca su propio simulador con la base vacía, por eso van por separado y no dentro de un solo cdp.mjs.
// Sale con código 1 si algún escenario falla o la consola del navegador registra un error.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GRUPOS = ["ingreso", "emprendedor", "admin", "muro", "ajustes", "postulaciones", "jc"];
const cdp = fileURLToPath(new URL("./cdp.mjs", import.meta.url));
const extra = process.argv.slice(2);
let fallas = 0, escenarios = 0;

for (const grupo of GRUPOS) {
  for (const movil of [false, true]) {
    const r = spawnSync(process.execPath, [cdp, grupo, ...(movil ? ["--movil"] : []), ...extra], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const nombre = `${grupo} ${movil ? "celular" : "escritorio"}`;
    let j;
    try { j = JSON.parse(r.stdout); } catch { console.log(`${nombre}: sin resultado (código ${r.status})\n${(r.stderr || "").slice(0, 600)}`); fallas++; continue; }
    const malos = Object.entries(j.resultados).filter(([, v]) => v !== "ok");
    escenarios += Object.keys(j.resultados).length;
    fallas += malos.length + (j.consola.length ? 1 : 0);
    console.log(`${nombre}: ${Object.keys(j.resultados).length} escenarios, ${malos.length} fallas, consola ${j.consola.length}`);
    for (const [k, v] of malos) console.log(`  - ${k}: ${String(v).slice(0, 300)}`);
    for (const c of j.consola) console.log(`  consola: ${c.slice(0, 200)}`);
  }
}
console.log(fallas ? `\nFALLAS: ${fallas}` : `\nTodo en verde: ${escenarios} escenarios, 0 fallas, consola 0.`);
process.exitCode = fallas ? 1 : 0;
