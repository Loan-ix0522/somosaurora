-- 0007_informe_publico.sql — Somos Aurora
-- Informe ciudadano público (informe-demo.html): cada informe que ve el público es una fila con
-- los porcentajes por tema de las opiniones de un periodo. Solo conteos: ningún texto, nombre,
-- celular, foto ni IP.
--
-- Cómo se llena:
--   · Automático: cada 5 días /api/informe-auto (Vercel Cron) publica uno con las opiniones
--     llegadas desde el informe anterior. Si hay pocas (menos de 10), no publica y se mantiene el
--     que ya está; sigue sumando hasta que alcancen.
--   · Manual: desde /admin/ → «Informe público», el equipo calcula un rango de fechas y lo publica.
-- El que se ve en la web es siempre el más reciente.
--
-- Quién escribe: solo el servidor (service role). Quién lee: cualquiera (es público por diseño).
-- El admin puede retirar un informe (lo borra) desde su panel; el anterior vuelve a verse.
--
-- Requiere la 0002 (is_admin). Cómo aplicarla: Supabase → SQL Editor → pegar todo → Run.
-- Se puede correr varias veces.

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Falta aplicar 0002_admins_y_destacadas.sql antes de esta migración (necesita is_admin()).';
  end if;
end $$;

-- ============================================================
-- 1. TABLA
-- ============================================================
create table if not exists public.informe_publico (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),   -- cuándo se publicó
  origen        text not null,                        -- 'automatico' | 'manual'
  periodo_desde timestamptz not null,                 -- primera opinión posible del periodo
  periodo_hasta timestamptz not null,                 -- corte: opiniones hasta esta hora
  total         int  not null,                        -- opiniones contadas
  por_tema      jsonb not null,                       -- [{ "tema": "...", "total": 8, "porcentaje": 80 }, ...]
  constraint informe_publico_origen_chk  check (origen in ('automatico', 'manual')),
  constraint informe_publico_periodo_chk check (periodo_hasta >= periodo_desde),
  constraint informe_publico_total_chk   check (total > 0),
  constraint informe_publico_tema_chk    check (jsonb_typeof(por_tema) = 'array')
);
create index if not exists informe_publico_created_idx on public.informe_publico (created_at desc);

-- ============================================================
-- 2. ACCESO
-- ============================================================
alter table public.informe_publico enable row level security;

-- Lectura pública: son solo conteos.
drop policy if exists informe_publico_public_read on public.informe_publico;
create policy informe_publico_public_read on public.informe_publico
  for select to anon, authenticated using (true);

-- Retirar un informe: solo admins.
drop policy if exists informe_publico_admin_delete on public.informe_publico;
create policy informe_publico_admin_delete on public.informe_publico
  for delete to authenticated using (public.is_admin());

-- Nadie desde el navegador crea ni cambia informes (ni el admin): lo hace el servidor, que cuenta
-- las opiniones de verdad. Además de no tener política, se quitan los permisos de tabla.
revoke all on public.informe_publico from anon, authenticated;
grant select on public.informe_publico to anon, authenticated;
grant delete on public.informe_publico to authenticated;   -- lo filtra la política de arriba (solo admins)
