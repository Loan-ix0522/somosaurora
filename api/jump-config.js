// GET /api/jump-config — Config pública de la Comunidad JUMP (supabase-js en el navegador).
// Vercel Edge Function. Solo devuelve URL + ANON key (públicas) del proyecto de Supabase de JUMP. Nunca la service_role.
// Es aparte de /api/config (que es del panel de La Aurora Escucha): JUMP no lee ni cae en la base de La Aurora.

import { supa } from "./_jump/env.js";

export const config = { runtime: "edge" };

const cabeceras = { "Content-Type": "application/json", "Cache-Control": "no-store" };

export default async function handler() {
  const { url, anon } = supa();
  if (!url || !anon) return new Response(JSON.stringify({ error: "La Comunidad JUMP todavía no está configurada." }), { status: 503, headers: cabeceras });
  return new Response(JSON.stringify({ url, anonKey: anon }), { headers: cabeceras });
}
