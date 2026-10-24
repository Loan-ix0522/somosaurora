-- ============================================================
-- Comunidad JUMP — migración 0002: postulaciones
-- Lo que la gente envía desde el formulario «Postula» de la página de JUMP (/jump/).
--
-- PROYECTO PROPIO: va en el proyecto de Supabase de JUMP, igual que la 0001. NO en el de La Aurora Escucha.
-- CÓMO APLICARLA: Supabase (proyecto jump) → SQL Editor → pegar TODO este archivo → Run.
-- Se puede volver a correr sin problema (no duplica nada). Necesita la 0001 ya aplicada.
--
-- Quién hace qué:
--   · El formulario no escribe directo en la base: lo recibe /api/jump-postular (service_role), que valida,
--     frena abusos y guarda. Desde el navegador nadie puede crear filas.
--   · El equipo (admin activo) las ve, cambia su estado y las borra desde el panel.
--   · Nadie más las ve. El hash de la conexión (para frenar envíos repetidos) solo lo lee la API.
-- ============================================================

create table if not exists public.jump_postulaciones (
  id         uuid primary key default gen_random_uuid(),
  nombres    text not null,
  whatsapp   text not null,
  negocio    text not null,
  rubro      text not null,
  sector     text not null,
  ruc        text not null,
  estado     text not null default 'nueva',
  ip_hash    text,
  creado_en  timestamptz not null default now(),
  constraint jump_postulaciones_nombres_chk  check (char_length(nombres) between 2 and 80),
  constraint jump_postulaciones_whatsapp_chk check (whatsapp ~ '^09\d{8}$'),
  constraint jump_postulaciones_negocio_chk  check (char_length(negocio) between 2 and 80),
  constraint jump_postulaciones_rubro_chk    check (rubro in ('Comida y bebidas', 'Ropa y accesorios', 'Belleza y cuidado personal',
                                                              'Mascotas', 'Artesanías y decoración', 'Servicios', 'Otro')),
  constraint jump_postulaciones_sector_chk   check (char_length(sector) between 2 and 80),
  constraint jump_postulaciones_ruc_chk      check (ruc in ('si', 'no', 'tramite')),
  constraint jump_postulaciones_estado_chk   check (estado in ('nueva', 'contactada', 'descartada'))
);

create index if not exists jump_postulaciones_creado_idx on public.jump_postulaciones (creado_en desc);
create index if not exists jump_postulaciones_ip_idx on public.jump_postulaciones (ip_hash, creado_en);
create index if not exists jump_postulaciones_whatsapp_idx on public.jump_postulaciones (whatsapp);

alter table public.jump_postulaciones enable row level security;

-- Permisos de tabla: anon nada; el equipo lee (sin ip_hash), cambia solo el estado y borra.
revoke all on table public.jump_postulaciones from anon, authenticated;
grant select (id, nombres, whatsapp, negocio, rubro, sector, ruc, estado, creado_en) on table public.jump_postulaciones to authenticated;
grant update (estado) on table public.jump_postulaciones to authenticated;
grant delete on table public.jump_postulaciones to authenticated;

drop policy if exists jump_postulaciones_leer on public.jump_postulaciones;
create policy jump_postulaciones_leer on public.jump_postulaciones
  for select to authenticated using (public.jump_es_admin());
drop policy if exists jump_postulaciones_estado on public.jump_postulaciones;
create policy jump_postulaciones_estado on public.jump_postulaciones
  for update to authenticated using (public.jump_es_admin()) with check (public.jump_es_admin());
drop policy if exists jump_postulaciones_borrar on public.jump_postulaciones;
create policy jump_postulaciones_borrar on public.jump_postulaciones
  for delete to authenticated using (public.jump_es_admin());
