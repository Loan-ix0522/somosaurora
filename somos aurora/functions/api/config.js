// GET /api/config — Config pública para el panel admin (supabase-js en el navegador).
// Solo devuelve la URL y la ANON key (ambas públicas por diseño). Nunca la service_role.

export async function onRequestGet(context) {
  const { env } = context;
  return new Response(
    JSON.stringify({
      url: env.SUPABASE_URL || "",
      anonKey: env.SUPABASE_ANON_KEY || "",
    }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
  );
}
