-- 0006_contador_visitas.sql — Somos Aurora
-- Contador de visitas de la web pública, con la hora de cada ingreso, para el panel /admin/.
-- (La 0005 es la de la Comunidad JUMP, que se entrega aparte. Esta no depende de ella.)
--
-- Una fila por cada página pública que se abre: la página, la hora, la IP, la ciudad y el país
-- aproximados (los da Vercel), el tipo de aparato, de qué sitio llegó y un código anónimo al
-- azar que el navegador genera para poder contar personas únicas. No se guarda el nombre ni
-- nada que la persona escriba.
--
-- La IP es un dato personal: se guarda solo 30 días. La limpieza nocturna (/api/purge) llama a
-- borrar_ip_visitas() y la deja vacía; la visita, su hora y la ciudad se conservan.
--
-- Quién escribe: solo /api/track (el servidor, con la service role). Quién lee: solo los
-- correos de la tabla `admins`. El público no puede ni escribir ni leer por la API.
--
-- Cómo aplicarla: Supabase → SQL Editor → pegar todo → Run. Se puede correr varias veces.

-- ============================================================
-- 1. TABLA
-- ============================================================
create table if not exists public.visitas (
  id          uuid primary key default gen_random_uuid(),
  ruta        text not null,          -- página pública, sin ?consulta ni #ancla
  visitante   text,                   -- código anónimo del navegador (null en modo incógnito)
  pais        text,                   -- país aproximado (código de 2 letras)
  dispositivo text,                   -- 'movil' | 'tablet' | 'escritorio'
  procedencia text,                   -- sitio del que llegó (solo el dominio)
  ip          inet,                   -- IP de la conexión; se borra a los 30 días
  ciudad      text,                   -- ciudad aproximada según la IP
  creada_en   timestamptz not null default now(),
  constraint visitas_ruta_ok check (ruta ~ '^/' and length(ruta) <= 200),
  constraint visitas_visitante_ok check (visitante is null or visitante ~ '^[A-Za-z0-9_-]{1,64}$'),
  constraint visitas_pais_ok check (pais is null or pais ~ '^[A-Z]{2}$'),
  constraint visitas_dispositivo_ok check (dispositivo is null or dispositivo in ('movil', 'tablet', 'escritorio')),
  constraint visitas_procedencia_ok check (procedencia is null or length(procedencia) <= 120),
  constraint visitas_ciudad_ok check (ciudad is null or length(ciudad) <= 80)
);
create index if not exists visitas_creada_idx on public.visitas (creada_en desc);
create index if not exists visitas_recarga_idx on public.visitas (visitante, ruta, creada_en desc) where visitante is not null;
create index if not exists visitas_ip_vieja_idx on public.visitas (creada_en) where ip is not null;

comment on table public.visitas is
  'Una fila por visita a una página pública. La escribe api/track.js. La IP se borra a los 30 días (borrar_ip_visitas, desde api/purge.js).';

-- RLS: solo los admins leen. Nadie escribe por la API pública (registrar_visita lo hace el servidor).
alter table public.visitas enable row level security;
revoke all on table public.visitas from anon, authenticated;
grant select on table public.visitas to authenticated;
drop policy if exists visitas_admin_lee on public.visitas;
create policy visitas_admin_lee on public.visitas
  for select to authenticated
  using (public.is_admin());

-- ============================================================
-- 2. REGISTRAR UNA VISITA (solo el servidor)
-- ============================================================
-- Limpia lo que llega (lo raro se guarda vacío) y no cuenta las recargas: la misma persona en
-- la misma página dentro de 10 segundos cuenta una sola vez. Devuelve si se contó.
create or replace function public.registrar_visita(
  p_ruta text, p_visitante text, p_pais text, p_dispositivo text, p_procedencia text, p_ip text, p_ciudad text
) returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v text := case when p_visitante ~ '^[A-Za-z0-9_-]{1,64}$' then p_visitante end;
  v_ip inet;
begin
  begin
    v_ip := nullif(p_ip, '')::inet;
  exception when others then
    v_ip := null; -- IP mal formada: la visita se cuenta igual, sin IP
  end;
  if p_ruta is null or p_ruta !~ '^/' or length(p_ruta) > 200 or p_ruta ~* '^/admin(/|\.html|$)' then
    return false;
  end if;
  if v is not null and exists (
    select 1 from public.visitas
    where visitante = v and ruta = p_ruta and creada_en > now() - interval '10 seconds'
  ) then
    return false;
  end if;
  insert into public.visitas (ruta, visitante, pais, dispositivo, procedencia, ip, ciudad) values (
    p_ruta,
    v,
    case when p_pais ~ '^[A-Z]{2}$' then p_pais end,
    case when p_dispositivo in ('movil', 'tablet', 'escritorio') then p_dispositivo end,
    case when length(p_procedencia) between 1 and 120 then p_procedencia end,
    v_ip,
    case when length(p_ciudad) between 1 and 80 then p_ciudad end
  );
  return true;
end;
$$;
revoke all on function public.registrar_visita(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_visita(text, text, text, text, text, text, text) to service_role;

-- ============================================================
-- 3. BORRAR LAS IP DE MÁS DE 30 DÍAS (la llama /api/purge cada noche)
-- ============================================================
create or replace function public.borrar_ip_visitas()
returns integer
language sql
volatile
security definer
set search_path = public
as $$
  with b as (
    update public.visitas set ip = null
    where ip is not null and creada_en < now() - interval '30 days'
    returning 1
  )
  select count(*)::int from b;
$$;
revoke all on function public.borrar_ip_visitas() from public, anon, authenticated;
grant execute on function public.borrar_ip_visitas() to service_role;

-- ============================================================
-- 4. RESUMEN PARA EL PANEL
-- ============================================================
-- "Hoy" empieza a la medianoche de Ecuador; "semana" son las últimas 7 x 24 horas.
-- Corre con los permisos de quien la llama: un admin cuenta todo; otra cuenta, cero.
create or replace function public.estadisticas_visitas()
returns jsonb
language sql
stable
set search_path = public
as $$
  with b as (
    select (date_trunc('day', now() at time zone 'America/Guayaquil') at time zone 'America/Guayaquil') as hoy,
           now() - interval '7 days' as semana
  )
  select jsonb_build_object(
    'visitas_total',   count(v.id),
    'personas_total',  count(distinct v.visitante),
    'visitas_hoy',     count(v.id) filter (where v.creada_en >= b.hoy),
    'personas_hoy',    count(distinct v.visitante) filter (where v.creada_en >= b.hoy),
    'visitas_semana',  count(v.id) filter (where v.creada_en >= b.semana),
    'personas_semana', count(distinct v.visitante) filter (where v.creada_en >= b.semana)
  )
  from b left join public.visitas v on true;
$$;
revoke all on function public.estadisticas_visitas() from public, anon;
grant execute on function public.estadisticas_visitas() to authenticated;
