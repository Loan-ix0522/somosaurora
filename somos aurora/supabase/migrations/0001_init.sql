-- 0001_init.sql — Somos Aurora
-- Esquema inicial: tablas, RLS, bucket de Storage.
-- Ejecutar en un proyecto Supabase nuevo (SQL Editor o `supabase db push`).

create extension if not exists pgcrypto;

-- ============================================================
-- TABLAS
-- ============================================================

-- Informes semanales (PERSISTE)
create table if not exists public.weekly_reports (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  week_start      date not null,
  week_end        date not null,
  total_opiniones int  not null default 0,
  por_categoria   jsonb not null default '{}'::jsonb,
  por_sector      jsonb not null default '{}'::jsonb,
  resumen         text
);

-- Opiniones crudas (se purgan cada semana)
create table if not exists public.submissions (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),  -- fecha y hora del envío
  tipo           text not null,
  tema           text not null,
  sector         text,
  referencia     text,
  detalle        text not null,
  evidencia_path text,
  nombre         text,
  celular        text,
  consentimiento boolean not null default false,
  ip_hash        text,
  status         text not null default 'nuevo',
  constraint submissions_tipo_chk   check (tipo in ('Propuesta','Queja o problema','Otro tema')),
  constraint submissions_detalle_len check (char_length(detalle) between 1 and 1000),
  constraint submissions_status_chk check (status in ('nuevo','revisado','destacado','archivado'))
);
create index if not exists submissions_created_idx on public.submissions (created_at desc);
create index if not exists submissions_tema_idx    on public.submissions (tema);
create index if not exists submissions_sector_idx  on public.submissions (sector);

-- Top semanal destacado y público (PERSISTE)
create table if not exists public.featured_opinions (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid references public.weekly_reports(id) on delete cascade,
  created_at    timestamptz not null default now(),
  rank          int not null default 1,
  tipo          text,
  tema          text,
  sector        text,
  texto         text not null,
  autor_display text not null default 'Vecino de La Aurora'
);
create index if not exists featured_report_idx on public.featured_opinions (report_id);
create index if not exists featured_rank_idx   on public.featured_opinions (rank);

-- ============================================================
-- RLS
-- ============================================================
alter table public.submissions      enable row level security;
alter table public.weekly_reports   enable row level security;
alter table public.featured_opinions enable row level security;

-- submissions: SOLO admins autenticados. anon no ve nada.
-- (La inserción pública entra por la Cloudflare Function con service_role, que ignora RLS.)
drop policy if exists submissions_admin_all on public.submissions;
create policy submissions_admin_all on public.submissions
  for all to authenticated using (true) with check (true);

-- weekly_reports: lectura pública, escritura admin.
drop policy if exists weekly_reports_public_read on public.weekly_reports;
create policy weekly_reports_public_read on public.weekly_reports
  for select to anon, authenticated using (true);
drop policy if exists weekly_reports_admin_write on public.weekly_reports;
create policy weekly_reports_admin_write on public.weekly_reports
  for all to authenticated using (true) with check (true);

-- featured_opinions: lectura pública, escritura admin.
drop policy if exists featured_public_read on public.featured_opinions;
create policy featured_public_read on public.featured_opinions
  for select to anon, authenticated using (true);
drop policy if exists featured_admin_write on public.featured_opinions;
create policy featured_admin_write on public.featured_opinions
  for all to authenticated using (true) with check (true);

-- ============================================================
-- STORAGE: bucket privado para fotos de evidencia
-- ============================================================
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', false)
on conflict (id) do nothing;

-- Solo admins autenticados gestionan el bucket desde el navegador.
-- (Las subidas públicas entran por la Function con service_role.)
drop policy if exists evidencias_admin_all on storage.objects;
create policy evidencias_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'evidencias')
  with check (bucket_id = 'evidencias');

-- ============================================================
-- NOTAS
-- ============================================================
-- 1) En Auth > Providers, DESHABILITAR "Allow new users to sign up".
--    Crear el/los admin manualmente (Auth > Users > Add user).
-- 2) service_role key: solo en variables de entorno de Cloudflare. Nunca en el repo.
