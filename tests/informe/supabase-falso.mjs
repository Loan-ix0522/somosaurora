// Un "Supabase" mínimo en memoria para probar los endpoints del informe sin red:
//  · submissions (HEAD/GET con conteo, filtros created_at gte/lt y tema eq),
//  · informe_publico (GET del último, POST de uno nuevo),
//  · rpc/is_admin (según el token de quien llama).
// No imita todo PostgREST, solo lo que usan api/informe*.js.
export const URL_BASE = "https://ejemplo.supabase.co";

export function crearSupabase({ opiniones = [], informes = [], admins = ["token-admin"], usuarios = ["token-vecino"], sinTabla = false } = {}) {
  const estado = { opiniones, informes, admins, usuarios, sinTabla, llamadas: [], falla: null, siguienteId: 1 };

  const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
  const tablaFaltante = () => json({ code: "PGRST205", message: "Could not find the table 'public.informe_publico' in the schema cache" }, 404);

  async function fetchFalso(url, init = {}) {
    const u = new URL(url);
    const metodo = (init.method || "GET").toUpperCase();
    const ruta = u.pathname.replace(/^\/rest\/v1\//, "");
    estado.llamadas.push({ url: String(url), init, metodo, ruta });
    if (estado.falla && estado.falla(ruta, metodo)) return new Response("boom con detalles internos", { status: 500 });

    if (ruta === "submissions") {
      let filas = estado.opiniones;
      for (const f of u.searchParams.getAll("created_at")) {
        const [op, ...resto] = f.split(".");
        const t = Date.parse(resto.join("."));
        filas = filas.filter((x) => (op === "gte" ? Date.parse(x.created_at) >= t : op === "lt" ? Date.parse(x.created_at) < t : true));
      }
      const tema = u.searchParams.get("tema");
      if (tema) filas = filas.filter((x) => x.tema === tema.replace(/^eq\./, ""));
      return new Response(null, { status: 200, headers: { "content-range": filas.length ? `0-0/${filas.length}` : "*/0" } });
    }

    if (ruta === "informe_publico") {
      if (estado.sinTabla) return tablaFaltante();
      if (metodo === "GET") {
        const orden = [...estado.informes].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        const limite = Number(u.searchParams.get("limit")) || orden.length;
        return json(orden.slice(0, limite));
      }
      if (metodo === "POST") {
        const fila = JSON.parse(init.body);
        if (!["automatico", "manual"].includes(fila.origen) || !(fila.total > 0)) return json({ code: "23514", message: "check violation" }, 400);
        const nueva = { id: "inf-" + estado.siguienteId++, created_at: new Date().toISOString(), ...fila };
        estado.informes.push(nueva);
        return json([nueva], 201);
      }
    }

    if (ruta === "rpc/is_admin" && metodo === "POST") {
      const token = String(init.headers?.Authorization || "").replace(/^Bearer /, "");
      if (estado.admins.includes(token)) return json(true);
      if (estado.usuarios.includes(token)) return json(false);
      return json({ message: "JWT invalid" }, 401);
    }
    return json({ message: "ruta no simulada: " + metodo + " " + ruta }, 404);
  }
  return { estado, fetch: fetchFalso, de: (ruta) => estado.llamadas.filter((l) => l.ruta === ruta) };
}

// Una opinión de muestra, `haceMs` antes de `ahora`.
export const opinion = (tema, ahora, haceMs) => ({ tema, created_at: new Date(ahora.getTime() - haceMs).toISOString() });
