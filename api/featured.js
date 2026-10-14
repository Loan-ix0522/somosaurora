// GET /api/featured — Top de opiniones del informe más reciente (público).
// Vercel Edge Function. Lee con la anon key (solo lectura, permitido por RLS).

export const config = { runtime: "edge" };

export default async function handler(request) {
  if (request.method !== "GET") return new Response("Método no permitido", { status: 405 });
  const env = process.env;
  const headers = { "Content-Type": "application/json", "Cache-Control": "public, max-age=120" };
  try {
    const h = {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    };

    // 1) Informe más reciente
    const rep = await fetch(
      `${env.SUPABASE_URL}/rest/v1/weekly_reports?select=id,week_start,week_end,created_at&order=created_at.desc&limit=1`,
      { headers: h }
    );
    const reports = rep.ok ? await rep.json() : [];
    if (!reports.length) return new Response(JSON.stringify({ ok: true, items: [], report: null }), { headers });

    const report = reports[0];

    // 2) Su top, ordenado por rank
    const feat = await fetch(
      `${env.SUPABASE_URL}/rest/v1/featured_opinions?report_id=eq.${report.id}` +
        `&select=rank,tipo,tema,sector,texto,autor_display,created_at&order=rank.asc`,
      { headers: h }
    );
    const items = feat.ok ? await feat.json() : [];
    return new Response(JSON.stringify({ ok: true, items, report }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, items: [], error: String(e) }), { headers });
  }
}
