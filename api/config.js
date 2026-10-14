// GET /api/config — Config pública para el panel admin (supabase-js en el navegador).
// Vercel Edge Function. Solo devuelve URL + ANON key (públicas). Nunca la service_role.

export const config = { runtime: "edge" };

export default async function handler() {
  const env = process.env;
  return new Response(
    JSON.stringify({ url: env.SUPABASE_URL || "", anonKey: env.SUPABASE_ANON_KEY || "" }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
  );
}
