-- ============================================================
-- Comunidad JUMP — migración 0003: encuestas
-- «¿Qué curso quieres?»: el equipo arma la encuesta desde su panel; votan los inscritos en la comunidad y
-- cualquier visitante en la página de JUMP (/jump/).
--
-- PROYECTO PROPIO: va en el proyecto de Supabase de JUMP, igual que la 0001 y la 0002. NO en el de La Aurora Escucha.
-- CÓMO APLICARLA: Supabase (proyecto jump) → SQL Editor → pegar TODO este archivo → Run.
-- Se puede volver a correr sin problema (no duplica nada). Necesita la 0001 ya aplicada.
--
-- Quién hace qué:
--   · El equipo (admin activo) crea, edita, abre, cierra y borra encuestas y opciones desde el panel.
--     Solo puede haber una encuesta abierta a la vez.
--   · Los inscritos ven la abierta y las cerradas (nunca los borradores). Votan y proponen una idea por
--     funciones (jump_votar, jump_proponer); desde el navegador nadie escribe votos directo.
--   · En la página pública, el voto lo recibe /api/jump-publico (service_role), que lo guarda con jump_voto_publico
--     (el tope por conexión se revisa y se guarda en un solo paso). Las huellas del dispositivo y de la conexión
--     solo las lee esa API, y se borran 30 días después de cerrar la encuesta (jump_olvidar_huellas).
--   · Afuera solo se muestran porcentajes; los conteos por origen y quién propuso cada idea los ve solo el equipo.
--   · El panel guarda cada encuesta en un solo paso (jump_guardar_encuesta): o queda todo o no cambia nada.
-- ============================================================

create table if not exists public.jump_encuestas (
  id          uuid primary key default gen_random_uuid(),
  pregunta    text not null,
  estado      text not null default 'borrador',
  abierta_en  timestamptz,
  cerrada_en  timestamptz,
  creada_por  uuid default auth.uid() references auth.users (id) on delete set null,
  creada_en   timestamptz not null default now(),
  es_ejemplo  boolean not null default false,
  constraint jump_encuestas_pregunta_chk check (char_length(pregunta) between 5 and 160 and pregunta = btrim(pregunta)),
  constraint jump_encuestas_estado_chk   check (estado in ('borrador', 'abierta', 'cerrada'))
);
-- Una sola abierta a la vez.
create unique index if not exists jump_encuestas_una_abierta on public.jump_encuestas ((true)) where estado = 'abierta';

create table if not exists public.jump_encuesta_opciones (
  id            uuid primary key default gen_random_uuid(),
  encuesta_id   uuid not null references public.jump_encuestas (id) on delete cascade,
  texto         text not null,
  orden         int not null default 0,
  propuesta_por uuid references auth.users (id) on delete set null,
  creada_en     timestamptz not null default now(),
  es_ejemplo    boolean not null default false,
  constraint jump_encuesta_opciones_texto_chk check (char_length(texto) between 2 and 80 and texto = btrim(texto)),
  constraint jump_encuesta_opciones_id_encuesta_key unique (id, encuesta_id)
);
-- La misma idea no entra dos veces en una encuesta (sin importar mayúsculas ni espacios de los extremos).
create unique index if not exists jump_encuesta_opciones_texto_idx on public.jump_encuesta_opciones (encuesta_id, lower(btrim(texto)));
-- Una idea por persona y encuesta (también si propone desde dos pestañas a la vez).
create unique index if not exists jump_encuesta_opciones_una_por_persona on public.jump_encuesta_opciones (encuesta_id, propuesta_por)
  where propuesta_por is not null;

create table if not exists public.jump_encuesta_votos (
  id               uuid primary key default gen_random_uuid(),
  encuesta_id      uuid not null references public.jump_encuestas (id) on delete cascade,
  opcion_id        uuid not null,
  origen           text not null,
  user_id          uuid references auth.users (id) on delete cascade,
  dispositivo_hash text,
  ip_hash          text,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  -- La opción tiene que ser de la misma encuesta; si se borra la opción, se van sus votos.
  constraint jump_encuesta_votos_opcion_fk foreign key (opcion_id, encuesta_id)
    references public.jump_encuesta_opciones (id, encuesta_id) on delete cascade,
  constraint jump_encuesta_votos_origen_chk check (origen in ('inscrito', 'publico')),
  constraint jump_encuesta_votos_quien_chk  check ((origen = 'inscrito') = (user_id is not null)),
  -- Solo el voto público lleva huellas (jump_voto_publico las exige); se borran al tiempo, el voto queda.
  constraint jump_encuesta_votos_huellas_chk check (origen = 'publico' or (dispositivo_hash is null and ip_hash is null)),
  constraint jump_encuesta_votos_usuario_key unique (encuesta_id, user_id),
  constraint jump_encuesta_votos_dispositivo_key unique (encuesta_id, dispositivo_hash)
);
create index if not exists jump_encuesta_votos_opcion_idx on public.jump_encuesta_votos (opcion_id);
create index if not exists jump_encuesta_votos_ip_idx on public.jump_encuesta_votos (ip_hash, creado_en);

-- Fechas de apertura y cierre: las pone la base al cambiar el estado (el panel no manda la hora).
create or replace function public.jump_encuesta_estado()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.estado = 'abierta' and (tg_op = 'INSERT' or old.estado <> 'abierta') then
    new.abierta_en := now();
    new.cerrada_en := null;
  elsif new.estado = 'cerrada' and (tg_op = 'INSERT' or old.estado <> 'cerrada') then
    new.cerrada_en := now();
  end if;
  return new;
end;
$$;
drop trigger if exists jump_encuesta_estado on public.jump_encuestas;
create trigger jump_encuesta_estado before insert or update of estado on public.jump_encuestas
  for each row execute function public.jump_encuesta_estado();

-- ============================================================
-- Funciones (security definer: votar y proponer pasan por aquí, no por la tabla)
-- ============================================================

-- El inscrito vota (o cambia su voto) en la encuesta abierta.
create or replace function public.jump_votar(p_opcion uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_encuesta uuid;
  v_estado   text;
begin
  if not public.jump_es_miembro() then
    raise exception 'sin_acceso' using errcode = '42501';
  end if;
  select o.encuesta_id, e.estado into v_encuesta, v_estado
    from public.jump_encuesta_opciones o join public.jump_encuestas e on e.id = o.encuesta_id
   where o.id = p_opcion;
  if not found then
    raise exception 'no_encontrada';
  end if;
  if v_estado <> 'abierta' then
    raise exception 'jump_encuesta_cerrada';
  end if;
  insert into public.jump_encuesta_votos (encuesta_id, opcion_id, origen, user_id)
  values (v_encuesta, p_opcion, 'inscrito', auth.uid())
  on conflict (encuesta_id, user_id) do update set opcion_id = excluded.opcion_id, actualizado_en = now();
end;
$$;

-- El inscrito propone un curso (una idea por encuesta) y su voto pasa a esa idea.
create or replace function public.jump_proponer(p_encuesta uuid, p_texto text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_estado text;
  v_id     uuid;
  v_indice text;
  v_texto  text := regexp_replace(btrim(coalesce(p_texto, '')), '\s+', ' ', 'g');
begin
  if not public.jump_es_miembro() then
    raise exception 'sin_acceso' using errcode = '42501';
  end if;
  select estado into v_estado from public.jump_encuestas where id = p_encuesta;
  if not found then
    raise exception 'no_encontrada';
  end if;
  if v_estado <> 'abierta' then
    raise exception 'jump_encuesta_cerrada';
  end if;
  -- Dos pestañas que proponen a la vez van una detrás de otra: la segunda ya ve la idea de la primera.
  perform pg_advisory_xact_lock(hashtextextended('jump_proponer|' || p_encuesta::text || '|' || auth.uid()::text, 0));
  if exists (select 1 from public.jump_encuesta_opciones where encuesta_id = p_encuesta and propuesta_por = auth.uid()) then
    raise exception 'jump_ya_propuso';
  end if;
  begin
    insert into public.jump_encuesta_opciones (encuesta_id, texto, orden, propuesta_por)
    values (p_encuesta, v_texto,
            (select coalesce(max(orden), 0) + 1 from public.jump_encuesta_opciones where encuesta_id = p_encuesta),
            auth.uid())
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_indice = constraint_name;
    if v_indice = 'jump_encuesta_opciones_una_por_persona' then
      raise exception 'jump_ya_propuso';
    end if;
    raise exception 'jump_idea_repetida' using errcode = '23505';
  end;
  insert into public.jump_encuesta_votos (encuesta_id, opcion_id, origen, user_id)
  values (p_encuesta, v_id, 'inscrito', auth.uid())
  on conflict (encuesta_id, user_id) do update set opcion_id = excluded.opcion_id, actualizado_en = now();
  return v_id;
end;
$$;

-- Porcentaje por opción (sin cantidades). Para inscritos (encuestas no borrador), el equipo y la API pública.
-- «propia» dice si la idea la propuso quien pregunta (la etiqueta «Tu idea»), sin decir quién propuso las demás.
-- (drop antes de crear: si cambian las columnas que devuelve, create or replace no alcanza.)
drop function if exists public.jump_encuesta_resultados(uuid);
create or replace function public.jump_encuesta_resultados(p_encuesta uuid)
returns table (opcion_id uuid, porcentaje int, propia boolean) language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.jump_es_admin() or auth.role() = 'service_role'
          or (public.jump_es_miembro() and exists (select 1 from public.jump_encuestas e where e.id = p_encuesta and e.estado <> 'borrador'))) then
    raise exception 'sin_acceso' using errcode = '42501';
  end if;
  return query
    with n as (
      select o.id, o.orden, o.creada_en, o.propuesta_por, count(v.id) as votos
        from public.jump_encuesta_opciones o
        left join public.jump_encuesta_votos v on v.opcion_id = o.id
       where o.encuesta_id = p_encuesta
       group by o.id
    )
    select n.id, case when sum(n.votos) over () = 0 then 0
                      else round(100.0 * n.votos / sum(n.votos) over ())::int end,
           coalesce(n.propuesta_por = auth.uid(), false)
      from n order by n.orden, n.creada_en;
end;
$$;

-- Conteos por origen (página pública / comunidad) y quién propuso cada idea. Solo el equipo.
drop function if exists public.jump_encuesta_conteos(uuid);
create or replace function public.jump_encuesta_conteos(p_encuesta uuid)
returns table (opcion_id uuid, publico int, inscritos int, propuesta_por uuid) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.jump_es_admin() then
    raise exception 'sin_acceso' using errcode = '42501';
  end if;
  return query
    select o.id,
           (count(v.id) filter (where v.origen = 'publico'))::int,
           (count(v.id) filter (where v.origen = 'inscrito'))::int,
           o.propuesta_por
      from public.jump_encuesta_opciones o
      left join public.jump_encuesta_votos v on v.opcion_id = o.id
     where o.encuesta_id = p_encuesta
     group by o.id order by o.orden, o.creada_en;
end;
$$;

-- Las huellas del voto público (aparato y conexión) solo sirven mientras se puede votar. Se borran 30 días después de
-- cerrar la encuesta (hasta entonces el equipo puede volver a abrirla sin que nadie vote dos veces); el voto sigue
-- contando. La llaman jump_voto_publico y /api/jump-publico cada vez que lee.
create or replace function public.jump_olvidar_huellas()
returns void language sql volatile security definer set search_path = public as $$
  update public.jump_encuesta_votos v set dispositivo_hash = null, ip_hash = null
    from public.jump_encuestas e
   where e.id = v.encuesta_id and e.estado = 'cerrada' and e.cerrada_en < now() - interval '30 days'
     and (v.dispositivo_hash is not null or v.ip_hash is not null);
$$;

-- El voto de la página pública. Lo llama solo /api/jump-publico (service_role) con las huellas ya calculadas.
-- El tope por conexión se revisa y el voto se guarda en un solo paso, con un candado por encuesta y conexión: muchos
-- votos a la vez desde la misma red no lo pasan. Quien ya votó desde ese aparato puede cambiar su voto.
-- Devuelve 'ok', 'tope' o 'cerrada' (la opción no es de una encuesta abierta real).
create or replace function public.jump_voto_publico(p_opcion uuid, p_dispositivo text, p_ip text, p_tope int)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  v_encuesta uuid;
begin
  if coalesce(p_dispositivo, '') = '' or coalesce(p_ip, '') = '' then
    raise exception 'sin_huella';
  end if;
  perform public.jump_olvidar_huellas();
  select o.encuesta_id into v_encuesta
    from public.jump_encuesta_opciones o join public.jump_encuestas e on e.id = o.encuesta_id
   where o.id = p_opcion and e.estado = 'abierta' and not e.es_ejemplo;
  if not found then
    return 'cerrada';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_encuesta::text || '|' || coalesce(p_ip, ''), 0));
  if not exists (select 1 from public.jump_encuesta_votos where encuesta_id = v_encuesta and dispositivo_hash = p_dispositivo)
     and (select count(*) from public.jump_encuesta_votos where encuesta_id = v_encuesta and ip_hash = p_ip) >= p_tope then
    return 'tope';
  end if;
  insert into public.jump_encuesta_votos (encuesta_id, opcion_id, origen, dispositivo_hash, ip_hash)
  values (v_encuesta, p_opcion, 'publico', p_dispositivo, p_ip)
  on conflict (encuesta_id, dispositivo_hash) do update set opcion_id = excluded.opcion_id, actualizado_en = now();
  return 'ok';
end;
$$;

-- Abre una encuesta y cierra la que estuviera abierta. Solo el equipo.
create or replace function public.jump_abrir_encuesta(p uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.jump_es_admin() then
    raise exception 'sin_acceso' using errcode = '42501';
  end if;
  if not exists (select 1 from public.jump_encuestas where id = p) then
    raise exception 'no_encontrada';
  end if;
  update public.jump_encuestas set estado = 'cerrada' where estado = 'abierta' and id <> p;
  update public.jump_encuestas set estado = 'abierta' where id = p and estado <> 'abierta';
end;
$$;

-- El panel guarda la encuesta en un solo paso: la pregunta y las opciones en el orden de la lista. Corrige las que
-- siguen, agrega las nuevas (sin id) y borra solo las que el equipo quitó (p_quitar, con sus votos); las ideas que los
-- inscritos propusieron mientras se editaba no se tocan. Sin p_id crea un borrador. Si algo falla (dos opciones con el
-- mismo texto) no queda nada a medias. Corre con los permisos de quien llama (security invoker) y solo para el equipo.
create or replace function public.jump_guardar_encuesta(p_id uuid, p_pregunta text, p_opciones jsonb, p_quitar uuid[] default '{}')
returns uuid language plpgsql volatile security invoker set search_path = public as $$
declare
  v_id uuid := p_id;
begin
  if not public.jump_es_admin() then
    raise exception 'sin_acceso' using errcode = '42501';
  end if;
  if v_id is null then
    insert into public.jump_encuestas (pregunta) values (p_pregunta) returning id into v_id;
  else
    update public.jump_encuestas set pregunta = p_pregunta where id = v_id;
    if not found then
      raise exception 'no_encontrada';
    end if;
  end if;
  delete from public.jump_encuesta_opciones where encuesta_id = v_id and id = any(coalesce(p_quitar, '{}'));
  -- Las que cambian de texto primero sueltan el suyo: así dos opciones pueden intercambiarse el texto sin chocar con
  -- el índice que no deja repetir.
  update public.jump_encuesta_opciones o set texto = '~' || o.id::text
    from jsonb_array_elements(coalesce(p_opciones, '[]')) x(v)
   where o.encuesta_id = v_id and o.id = (x.v->>'id')::uuid and o.texto is distinct from x.v->>'texto';
  update public.jump_encuesta_opciones o set texto = x.v->>'texto', orden = x.n
    from jsonb_array_elements(coalesce(p_opciones, '[]')) with ordinality x(v, n)
   where o.encuesta_id = v_id and o.id = (x.v->>'id')::uuid;
  insert into public.jump_encuesta_opciones (encuesta_id, texto, orden)
  select v_id, x.v->>'texto', x.n
    from jsonb_array_elements(coalesce(p_opciones, '[]')) with ordinality x(v, n)
   where x.v->>'id' is null;
  return v_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.jump_votar(uuid)', 'public.jump_proponer(uuid, text)', 'public.jump_encuesta_resultados(uuid)',
    'public.jump_encuesta_conteos(uuid)', 'public.jump_abrir_encuesta(uuid)', 'public.jump_guardar_encuesta(uuid, text, jsonb, uuid[])'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  execute 'revoke all on function public.jump_encuesta_estado() from public, anon, authenticated';
  foreach f in array array['public.jump_voto_publico(uuid, text, text, int)', 'public.jump_olvidar_huellas()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ============================================================
-- RLS y permisos de tabla
-- ============================================================
alter table public.jump_encuestas enable row level security;
alter table public.jump_encuesta_opciones enable row level security;
alter table public.jump_encuesta_votos enable row level security;

revoke all on table public.jump_encuestas, public.jump_encuesta_opciones, public.jump_encuesta_votos from anon, authenticated;
-- Encuestas y opciones: el equipo hace todo (la RLS de abajo lo limita al equipo); los inscritos solo leen.
-- es_ejemplo y propuesta_por los pone el servidor, no el panel. propuesta_por tampoco se lee directo: junto con el
-- directorio de la comunidad diría quién propuso cada idea (y por cuál votó al proponerla). El equipo lo ve en
-- jump_encuesta_conteos y cada inscrito sabe cuál es la suya por jump_encuesta_resultados.
grant select, delete on table public.jump_encuestas to authenticated;
grant delete on table public.jump_encuesta_opciones to authenticated;
grant select (id, encuesta_id, texto, orden, creada_en, es_ejemplo) on table public.jump_encuesta_opciones to authenticated;
grant insert (pregunta, estado) on table public.jump_encuestas to authenticated;
grant update (pregunta, estado) on table public.jump_encuestas to authenticated;
grant insert (encuesta_id, texto, orden) on table public.jump_encuesta_opciones to authenticated;
grant update (texto, orden) on table public.jump_encuesta_opciones to authenticated;
-- Votos: cada quien ve el suyo, sin las huellas. Nadie escribe directo (votar y proponer van por las funciones).
grant select (id, encuesta_id, opcion_id, origen, user_id, creado_en) on table public.jump_encuesta_votos to authenticated;

drop policy if exists jump_encuestas_leer on public.jump_encuestas;
create policy jump_encuestas_leer on public.jump_encuestas
  for select to authenticated using (public.jump_es_admin() or (public.jump_es_miembro() and estado <> 'borrador'));
drop policy if exists jump_encuestas_crear on public.jump_encuestas;
create policy jump_encuestas_crear on public.jump_encuestas
  for insert to authenticated with check (public.jump_es_admin());
drop policy if exists jump_encuestas_editar on public.jump_encuestas;
create policy jump_encuestas_editar on public.jump_encuestas
  for update to authenticated using (public.jump_es_admin()) with check (public.jump_es_admin());
drop policy if exists jump_encuestas_borrar on public.jump_encuestas;
create policy jump_encuestas_borrar on public.jump_encuestas
  for delete to authenticated using (public.jump_es_admin());

drop policy if exists jump_encuesta_opciones_leer on public.jump_encuesta_opciones;
create policy jump_encuesta_opciones_leer on public.jump_encuesta_opciones
  for select to authenticated using (
    public.jump_es_admin()
    or (public.jump_es_miembro() and exists (select 1 from public.jump_encuestas e where e.id = encuesta_id and e.estado <> 'borrador')));
drop policy if exists jump_encuesta_opciones_crear on public.jump_encuesta_opciones;
create policy jump_encuesta_opciones_crear on public.jump_encuesta_opciones
  for insert to authenticated with check (public.jump_es_admin());
drop policy if exists jump_encuesta_opciones_editar on public.jump_encuesta_opciones;
create policy jump_encuesta_opciones_editar on public.jump_encuesta_opciones
  for update to authenticated using (public.jump_es_admin()) with check (public.jump_es_admin());
drop policy if exists jump_encuesta_opciones_borrar on public.jump_encuesta_opciones;
create policy jump_encuesta_opciones_borrar on public.jump_encuesta_opciones
  for delete to authenticated using (public.jump_es_admin());

drop policy if exists jump_encuesta_votos_leer on public.jump_encuesta_votos;
create policy jump_encuesta_votos_leer on public.jump_encuesta_votos
  for select to authenticated using (user_id = auth.uid());
