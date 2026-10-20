-- ============================================================
-- Comunidad JUMP — migración 0001
-- Plataforma del programa JUMP (emprendedores de La Aurora).
--
-- PROYECTO PROPIO: va en el proyecto de Supabase de JUMP (en la misma organización que el de
-- La Aurora Escucha, pero aparte). NO la apliques en el proyecto de La Aurora Escucha: no comparten
-- base, cuentas ni llaves, y esta migración no toca nada de La Aurora Escucha.
--
-- CÓMO APLICARLA: en el proyecto de JUMP, pegar TODO este archivo en Supabase → SQL Editor → Run.
-- Se puede volver a correr sin problema (no duplica nada).
--
-- Antes de usar la plataforma: Authentication → Sign In / Providers → apaga "Allow new users to sign up"
-- (las cuentas las crea el equipo desde su panel).
--
-- Qué hace:
--   1. Tablas jump_* con RLS: nadie ve nada salvo los miembros activos de JUMP, y cada quien según su rol.
--   2. Funciones de permisos.
--   3-7. RLS, muro de la comunidad, Zoom y bitácora, directorio.
--   8. Buckets de Storage para portadas, material y fotos del muro.
--   9. Al final: plantilla para crear el primer admin de JUMP.
-- ============================================================

-- ============================================================
-- 1. TABLAS
-- ============================================================

-- Personas de la comunidad: emprendedores (entran con cédula) y equipo JUMP (entran con usuario).
-- Las cuentas las crea el equipo desde su panel (/api/jump-admin con service_role).
create table if not exists public.jump_miembros (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  rol                    text not null,
  cedula                 text unique,
  usuario                text unique,
  nombres                text not null,
  negocio                text,
  whatsapp               text,
  correo                 text,
  edicion                text not null default 'Primera edición',
  estado                 text not null default 'activa',
  motivo_suspension      text,
  debe_cambiar_clave     boolean not null default true,
  clave_temporal_vence   timestamptz,
  privacidad_aceptada_en timestamptz,
  privacidad_version     text,
  ultimo_ingreso         timestamptz,
  creado_por             uuid,
  creado_en              timestamptz not null default now(),
  es_ejemplo             boolean not null default false,
  constraint jump_miembros_rol_chk      check (rol in ('admin', 'emprendedor')),
  constraint jump_miembros_estado_chk   check (estado in ('activa', 'suspendida')),
  constraint jump_miembros_cedula_chk   check (cedula ~ '^\d{10}$'),
  constraint jump_miembros_usuario_chk  check (usuario ~ '^[a-z0-9._-]{3,30}$'),
  constraint jump_miembros_whatsapp_chk check (whatsapp ~ '^09\d{8}$'),
  constraint jump_miembros_correo_chk   check (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint jump_miembros_nombres_chk  check (char_length(btrim(nombres)) between 2 and 80),
  constraint jump_miembros_negocio_chk  check (char_length(negocio) <= 80),
  constraint jump_miembros_motivo_chk   check (char_length(motivo_suspension) <= 200),
  constraint jump_miembros_ident_chk    check ((rol = 'emprendedor' and cedula is not null) or (rol = 'admin' and usuario is not null))
);

create table if not exists public.jump_mentorias (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  descripcion    text not null default '',
  mentor         text,
  portada        text,
  estado         text not null default 'borrador',
  publicada_en   timestamptz,
  creada_en      timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  es_ejemplo     boolean not null default false,
  constraint jump_mentorias_titulo_chk  check (char_length(btrim(titulo)) between 3 and 120),
  constraint jump_mentorias_desc_chk    check (char_length(descripcion) <= 1000),
  constraint jump_mentorias_mentor_chk  check (char_length(mentor) <= 80),
  constraint jump_mentorias_portada_chk check (portada ~ '^(assets/[a-z0-9-]+\.webp|[0-9a-f-]{36}/[a-z0-9._-]+)$'),
  constraint jump_mentorias_estado_chk  check (estado in ('borrador', 'publicada'))
);

-- Clases en vivo (sueltas o de un módulo en vivo de una mentoría).
create table if not exists public.jump_clases (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  mentoria_id   uuid references public.jump_mentorias (id) on delete cascade,
  inicia_en     timestamptz not null,
  duracion_min  integer not null default 60,
  mensaje       text,
  grabacion_url text,
  creada_en     timestamptz not null default now(),
  es_ejemplo    boolean not null default false,
  constraint jump_clases_titulo_chk    check (char_length(btrim(titulo)) between 3 and 120),
  constraint jump_clases_duracion_chk  check (duracion_min between 15 and 240),
  constraint jump_clases_mensaje_chk   check (char_length(mensaje) <= 500),
  constraint jump_clases_grabacion_chk check (grabacion_url ~ '^https://')
);
create index if not exists jump_clases_inicia_idx on public.jump_clases (inicia_en);

-- Enlace de Zoom de cada clase: solo lo ve el equipo. Los emprendedores lo piden con jump_entrar_clase().
create table if not exists public.jump_clases_zoom (
  clase_id       uuid primary key references public.jump_clases (id) on delete cascade,
  meeting_id     text,
  join_url       text not null,
  passcode       text,
  actualizado_en timestamptz not null default now(),
  constraint jump_clases_zoom_url_chk check (join_url ~ '^https://([a-z0-9-]+\.)?zoom\.us/')
);

create table if not exists public.jump_modulos (
  id           uuid primary key default gen_random_uuid(),
  mentoria_id  uuid not null references public.jump_mentorias (id) on delete cascade,
  orden        integer not null default 0,
  titulo       text not null,
  tipo         text not null,
  video_url    text,
  duracion_min integer,
  descripcion  text not null default '',
  clase_id     uuid references public.jump_clases (id) on delete set null,
  es_ejemplo   boolean not null default false,
  constraint jump_modulos_titulo_chk   check (char_length(btrim(titulo)) between 1 and 120),
  constraint jump_modulos_tipo_chk     check (tipo in ('video', 'vivo')),
  constraint jump_modulos_video_chk    check (video_url ~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)/'),
  constraint jump_modulos_duracion_chk check (duracion_min between 1 and 600),
  constraint jump_modulos_desc_chk     check (char_length(descripcion) <= 2000)
);
create index if not exists jump_modulos_mentoria_idx on public.jump_modulos (mentoria_id, orden);

-- Material adicional: de la mentoría (modulo_id nulo) o de un módulo.
create table if not exists public.jump_materiales (
  id          uuid primary key default gen_random_uuid(),
  mentoria_id uuid not null references public.jump_mentorias (id) on delete cascade,
  modulo_id   uuid references public.jump_modulos (id) on delete cascade,
  nombre      text not null,
  tipo        text not null,
  ruta        text,
  url         text,
  bytes       bigint,
  mime        text,
  orden       integer not null default 0,
  creado_en   timestamptz not null default now(),
  es_ejemplo  boolean not null default false,
  constraint jump_materiales_nombre_chk check (char_length(btrim(nombre)) between 1 and 160),
  constraint jump_materiales_tipo_chk   check (tipo in ('archivo', 'enlace')),
  constraint jump_materiales_url_chk    check (url ~ '^https://'),
  constraint jump_materiales_dato_chk   check ((tipo = 'archivo' and ruta is not null) or (tipo = 'enlace' and url is not null))
);
create index if not exists jump_materiales_mentoria_idx on public.jump_materiales (mentoria_id);

create table if not exists public.jump_progreso (
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  modulo_id uuid not null references public.jump_modulos (id) on delete cascade,
  visto_en  timestamptz not null default now(),
  primary key (user_id, modulo_id)
);

create table if not exists public.jump_asistencia (
  clase_id      uuid not null references public.jump_clases (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  confirmado_en timestamptz default now(),
  entro_en      timestamptz,
  primary key (clase_id, user_id)
);

create table if not exists public.jump_avisos (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,
  texto       text not null,
  clase_id    uuid references public.jump_clases (id) on delete cascade,
  mentoria_id uuid references public.jump_mentorias (id) on delete cascade,
  creado_por  uuid default auth.uid(),
  creado_en   timestamptz not null default now(),
  es_ejemplo  boolean not null default false,
  constraint jump_avisos_tipo_chk  check (tipo in ('aviso', 'invitacion', 'mentoria')),
  constraint jump_avisos_texto_chk check (char_length(btrim(texto)) between 1 and 1000)
);
create index if not exists jump_avisos_creado_idx on public.jump_avisos (creado_en desc);

create table if not exists public.jump_avisos_vistos (
  aviso_id uuid not null references public.jump_avisos (id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  visto_en timestamptz not null default now(),
  primary key (aviso_id, user_id)
);

-- ============================================================
-- 2. FUNCIONES (security definer: leen jump_miembros sin pasar por su RLS)
-- ============================================================

-- ¿Quien pregunta es un miembro activo que ya cambió su clave temporal?
create or replace function public.jump_es_miembro()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.jump_miembros m
    where m.user_id = auth.uid() and m.estado = 'activa' and not m.debe_cambiar_clave
  );
$$;

create or replace function public.jump_es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.jump_miembros m
    where m.user_id = auth.uid() and m.rol = 'admin' and m.estado = 'activa' and not m.debe_cambiar_clave
  );
$$;

-- Una mentoría se ve si está publicada (o si quien pregunta es del equipo).
create or replace function public.jump_mentoria_visible(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jump_mentorias x where x.id = p and x.estado = 'publicada')
      or public.jump_es_admin();
$$;

-- La fila propia, en cualquier estado (para que la app sepa si está suspendida o debe cambiar la clave).
create or replace function public.jump_yo()
returns setof public.jump_miembros language plpgsql volatile security definer set search_path = public as $$
begin
  update public.jump_miembros set ultimo_ingreso = now()
   where user_id = auth.uid() and estado = 'activa'
     and (ultimo_ingreso is null or ultimo_ingreso < now() - interval '10 minutes');
  return query select * from public.jump_miembros where user_id = auth.uid();
end;
$$;

-- El emprendedor cambia su negocio y su WhatsApp (ya normalizado por la app: 09XXXXXXXX).
create or replace function public.jump_actualizar_perfil(p_negocio text, p_whatsapp text)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.jump_es_miembro() then
    raise exception 'sin_acceso' using errcode = '42501';
  end if;
  if p_negocio is null or char_length(btrim(p_negocio)) not between 1 and 80 then
    raise exception 'negocio_invalido';
  end if;
  if coalesce(p_whatsapp, '') <> '' and p_whatsapp !~ '^09\d{8}$' then
    raise exception 'whatsapp_invalido';
  end if;
  update public.jump_miembros
     set negocio = btrim(p_negocio), whatsapp = nullif(p_whatsapp, '')
   where user_id = auth.uid();
end;
$$;

-- Entrega el enlace de Zoom solo dentro de la ventana de la clase (15 min antes → 30 min después del fin).
create or replace function public.jump_entrar_clase(p_clase uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  c   public.jump_clases;
  url text;
begin
  if not public.jump_es_miembro() then
    raise exception 'sin_acceso' using errcode = '42501';
  end if;
  select * into c from public.jump_clases where id = p_clase;
  if not found or (c.mentoria_id is not null and not public.jump_mentoria_visible(c.mentoria_id)) then
    raise exception 'no_encontrada';
  end if;
  if now() < c.inicia_en - interval '15 minutes'
     or now() > c.inicia_en + make_interval(mins => c.duracion_min + 30) then
    raise exception 'fuera_de_ventana';
  end if;
  select join_url into url from public.jump_clases_zoom where clase_id = p_clase;
  if url is null then
    raise exception 'sin_enlace';
  end if;
  insert into public.jump_asistencia (clase_id, user_id, entro_en) values (p_clase, auth.uid(), now())
  on conflict (clase_id, user_id) do update set entro_en = now();
  return url;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.jump_es_miembro()', 'public.jump_es_admin()', 'public.jump_mentoria_visible(uuid)',
    'public.jump_yo()', 'public.jump_actualizar_perfil(text, text)', 'public.jump_entrar_clase(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ============================================================
-- 3. RLS
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'jump_miembros', 'jump_mentorias', 'jump_clases', 'jump_clases_zoom', 'jump_modulos', 'jump_materiales',
    'jump_progreso', 'jump_asistencia', 'jump_avisos', 'jump_avisos_vistos'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;

-- Miembros: cada quien su fila; el equipo, todas. Altas, claves y estado solo por la API (service_role).
drop policy if exists jump_miembros_leer on public.jump_miembros;
create policy jump_miembros_leer on public.jump_miembros
  for select to authenticated using (user_id = auth.uid() or public.jump_es_admin());

-- Contenido: los miembros leen lo publicado; el equipo hace todo.
drop policy if exists jump_mentorias_leer on public.jump_mentorias;
create policy jump_mentorias_leer on public.jump_mentorias
  for select to authenticated using (public.jump_es_miembro() and (estado = 'publicada' or public.jump_es_admin()));
drop policy if exists jump_mentorias_admin on public.jump_mentorias;
create policy jump_mentorias_admin on public.jump_mentorias
  for all to authenticated using (public.jump_es_admin()) with check (public.jump_es_admin());

drop policy if exists jump_modulos_leer on public.jump_modulos;
create policy jump_modulos_leer on public.jump_modulos
  for select to authenticated using (public.jump_es_miembro() and public.jump_mentoria_visible(mentoria_id));
drop policy if exists jump_modulos_admin on public.jump_modulos;
create policy jump_modulos_admin on public.jump_modulos
  for all to authenticated using (public.jump_es_admin()) with check (public.jump_es_admin());

drop policy if exists jump_materiales_leer on public.jump_materiales;
create policy jump_materiales_leer on public.jump_materiales
  for select to authenticated using (public.jump_es_miembro() and public.jump_mentoria_visible(mentoria_id));
drop policy if exists jump_materiales_admin on public.jump_materiales;
create policy jump_materiales_admin on public.jump_materiales
  for all to authenticated using (public.jump_es_admin()) with check (public.jump_es_admin());

drop policy if exists jump_clases_leer on public.jump_clases;
create policy jump_clases_leer on public.jump_clases
  for select to authenticated
  using (public.jump_es_miembro() and (mentoria_id is null or public.jump_mentoria_visible(mentoria_id)));
drop policy if exists jump_clases_admin on public.jump_clases;
create policy jump_clases_admin on public.jump_clases
  for all to authenticated using (public.jump_es_admin()) with check (public.jump_es_admin());

drop policy if exists jump_clases_zoom_admin on public.jump_clases_zoom;
create policy jump_clases_zoom_admin on public.jump_clases_zoom
  for all to authenticated using (public.jump_es_admin()) with check (public.jump_es_admin());

drop policy if exists jump_avisos_leer on public.jump_avisos;
create policy jump_avisos_leer on public.jump_avisos
  for select to authenticated using (public.jump_es_miembro());
drop policy if exists jump_avisos_admin on public.jump_avisos;
create policy jump_avisos_admin on public.jump_avisos
  for all to authenticated using (public.jump_es_admin()) with check (public.jump_es_admin());

-- Lo propio de cada miembro: avance, asistencia y avisos vistos. El equipo lo lee todo (para los conteos).
drop policy if exists jump_progreso_leer on public.jump_progreso;
create policy jump_progreso_leer on public.jump_progreso
  for select to authenticated using (user_id = auth.uid() or public.jump_es_admin());
drop policy if exists jump_progreso_crear on public.jump_progreso;
create policy jump_progreso_crear on public.jump_progreso
  for insert to authenticated
  with check (user_id = auth.uid() and public.jump_es_miembro()
              and exists (select 1 from public.jump_modulos m where m.id = modulo_id and public.jump_mentoria_visible(m.mentoria_id)));
drop policy if exists jump_progreso_borrar on public.jump_progreso;
create policy jump_progreso_borrar on public.jump_progreso
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists jump_asistencia_leer on public.jump_asistencia;
create policy jump_asistencia_leer on public.jump_asistencia
  for select to authenticated using (user_id = auth.uid() or public.jump_es_admin());
drop policy if exists jump_asistencia_crear on public.jump_asistencia;
create policy jump_asistencia_crear on public.jump_asistencia
  for insert to authenticated with check (user_id = auth.uid() and public.jump_es_miembro());
drop policy if exists jump_asistencia_cambiar on public.jump_asistencia;
create policy jump_asistencia_cambiar on public.jump_asistencia
  for update to authenticated
  using (user_id = auth.uid() and public.jump_es_miembro()) with check (user_id = auth.uid());
drop policy if exists jump_asistencia_borrar on public.jump_asistencia;
create policy jump_asistencia_borrar on public.jump_asistencia
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists jump_avisos_vistos_leer on public.jump_avisos_vistos;
create policy jump_avisos_vistos_leer on public.jump_avisos_vistos
  for select to authenticated using (user_id = auth.uid() or public.jump_es_admin());
drop policy if exists jump_avisos_vistos_crear on public.jump_avisos_vistos;
create policy jump_avisos_vistos_crear on public.jump_avisos_vistos
  for insert to authenticated with check (user_id = auth.uid() and public.jump_es_miembro());

-- ============================================================
-- 4. MURO DE LA COMUNIDAD
-- ============================================================
-- Los emprendedores publican directo (texto y/o foto) y comentan. El equipo oculta lo que no corresponde.
create table if not exists public.jump_posts (
  id         uuid primary key default gen_random_uuid(),
  autor_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  texto      text not null default '',
  foto       text,
  creado_en  timestamptz not null default now(),
  oculto_en  timestamptz,
  oculto_por uuid,
  es_ejemplo boolean not null default false,
  constraint jump_posts_texto_chk check (char_length(texto) <= 1000 and (char_length(btrim(texto)) > 0 or foto is not null)),
  constraint jump_posts_foto_chk  check (foto ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$')
);
create index if not exists jump_posts_creado_idx on public.jump_posts (creado_en desc);
create index if not exists jump_posts_autor_idx on public.jump_posts (autor_id, creado_en);

create table if not exists public.jump_comentarios (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.jump_posts (id) on delete cascade,
  autor_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  texto      text not null,
  creado_en  timestamptz not null default now(),
  oculto_en  timestamptz,
  oculto_por uuid,
  es_ejemplo boolean not null default false,
  constraint jump_comentarios_texto_chk check (char_length(btrim(texto)) between 1 and 500)
);
create index if not exists jump_comentarios_post_idx on public.jump_comentarios (post_id, creado_en);
create index if not exists jump_comentarios_autor_idx on public.jump_comentarios (autor_id, creado_en);

-- Límites por persona en 24 h (frenan abusos y errores de doble envío).
create or replace function public.jump_limite_posts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.jump_posts
       where autor_id = new.autor_id and creado_en > now() - interval '24 hours') >= 10 then
    raise exception 'limite_publicaciones';
  end if;
  return new;
end;
$$;
drop trigger if exists jump_posts_limite on public.jump_posts;
create trigger jump_posts_limite before insert on public.jump_posts
  for each row execute function public.jump_limite_posts();

create or replace function public.jump_limite_comentarios()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.jump_comentarios
       where autor_id = new.autor_id and creado_en > now() - interval '24 hours') >= 50 then
    raise exception 'limite_comentarios';
  end if;
  return new;
end;
$$;
drop trigger if exists jump_comentarios_limite on public.jump_comentarios;
create trigger jump_comentarios_limite before insert on public.jump_comentarios
  for each row execute function public.jump_limite_comentarios();

create or replace function public.jump_mentoria_actualizada()
returns trigger language plpgsql set search_path = public as $$
begin
  new.actualizada_en := now();
  return new;
end;
$$;
drop trigger if exists jump_mentorias_actualizada on public.jump_mentorias;
create trigger jump_mentorias_actualizada before update on public.jump_mentorias
  for each row execute function public.jump_mentoria_actualizada();

-- ============================================================
-- 5. ZOOM Y BITÁCORA (solo el servidor)
-- ============================================================
-- Cuenta de Zoom conectada (una sola). Los tokens van cifrados con JUMP_SECRET. Sin políticas: solo service_role.
create table if not exists public.jump_zoom (
  id                    boolean primary key default true,
  zoom_user_id          text not null,
  email                 text,
  nombre                text,
  refresh_token_cifrado text not null,
  access_token_cifrado  text,
  expira_en             timestamptz,
  conectada_por         uuid,
  conectada_en          timestamptz not null default now(),
  constraint jump_zoom_unica_chk check (id)
);

-- Registro de acciones del equipo (crear cuentas, claves, suspensiones, Zoom, ejemplos). Lo escribe la API.
create table if not exists public.jump_bitacora (
  id        bigint generated always as identity primary key,
  actor_id  uuid,
  accion    text not null,
  objetivo  text,
  detalle   jsonb,
  creado_en timestamptz not null default now()
);

-- ============================================================
-- 6. DIRECTORIO (lo único que un emprendedor ve de los demás)
-- ============================================================
-- Nombre corto: primer nombre + inicial del apellido ("María José Vera" → "María V.").
create or replace function public.jump_directorio()
returns table (user_id uuid, nombre text, negocio text, rol text)
language sql stable security definer set search_path = public as $$
  select m.user_id,
         case when m.rol = 'admin' then 'Equipo JUMP'
              else w.p[1] || coalesce(' ' || left(w.p[case when array_length(w.p, 1) >= 3 then 3 else 2 end], 1) || '.', '')
         end,
         case when m.rol = 'admin' then null else m.negocio end,
         m.rol
    from public.jump_miembros m,
         lateral (select regexp_split_to_array(btrim(m.nombres), '\s+') as p) w
   where public.jump_es_miembro() and m.estado = 'activa';
$$;

-- Primera carpeta de una ruta de Storage como uuid (null si no lo es).
create or replace function public.jump_storage_mentoria(name text)
returns uuid language sql immutable set search_path = public as $$
  select case when split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(name, '/', 1)::uuid end;
$$;

-- Conteos del panel del equipo en una sola llamada (la API corta las respuestas en 1000 filas).
-- Avance por persona (solo módulos de mentorías publicadas), asistencia por clase, vistos por aviso
-- y módulos vistos por mentoría. A quien no es del equipo le devuelve null.
create or replace function public.jump_conteos()
returns json language sql stable security definer set search_path = public as $$
  select case when not public.jump_es_admin() then null else json_build_object(
    'progreso', coalesce((select json_object_agg(t.user_id, t.n) from (
        select p.user_id, count(*)::int n
          from public.jump_progreso p
          join public.jump_modulos mo on mo.id = p.modulo_id
          join public.jump_mentorias me on me.id = mo.mentoria_id and me.estado = 'publicada'
         group by p.user_id) t), '{}'::json),
    'asistencia', coalesce((select json_object_agg(t.clase_id, json_build_object('confirmados', t.c, 'entraron', t.e)) from (
        select clase_id, count(confirmado_en)::int c, count(entro_en)::int e
          from public.jump_asistencia group by clase_id) t), '{}'::json),
    'avisos', coalesce((select json_object_agg(t.aviso_id, t.n) from (
        select aviso_id, count(*)::int n from public.jump_avisos_vistos group by aviso_id) t), '{}'::json),
    'mentorias', coalesce((select json_object_agg(t.mentoria_id, t.n) from (
        select mo.mentoria_id, count(*)::int n
          from public.jump_progreso p join public.jump_modulos mo on mo.id = p.modulo_id
         group by mo.mentoria_id) t), '{}'::json)
  ) end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.jump_directorio()', 'public.jump_storage_mentoria(text)', 'public.jump_conteos()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.jump_limite_posts()', 'public.jump_limite_comentarios()', 'public.jump_mentoria_actualizada()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- ============================================================
-- 7. RLS (muro, Zoom y bitácora)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['jump_posts', 'jump_comentarios', 'jump_zoom', 'jump_bitacora'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;
revoke all on table public.jump_zoom from authenticated;
revoke insert, update, delete on table public.jump_bitacora from authenticated;
-- En el muro, lo único que se cambia es si está oculto (y lo hace el equipo).
revoke update on table public.jump_posts, public.jump_comentarios from authenticated;
grant update (oculto_en, oculto_por) on table public.jump_posts, public.jump_comentarios to authenticated;

drop policy if exists jump_bitacora_leer on public.jump_bitacora;
create policy jump_bitacora_leer on public.jump_bitacora
  for select to authenticated using (public.jump_es_admin());

drop policy if exists jump_posts_leer on public.jump_posts;
create policy jump_posts_leer on public.jump_posts
  for select to authenticated
  using (public.jump_es_miembro() and (oculto_en is null or autor_id = auth.uid() or public.jump_es_admin()));
drop policy if exists jump_posts_crear on public.jump_posts;
create policy jump_posts_crear on public.jump_posts
  for insert to authenticated
  with check (autor_id = auth.uid() and public.jump_es_miembro() and oculto_en is null and oculto_por is null
              and not es_ejemplo and (foto is null or split_part(foto, '/', 1) = auth.uid()::text));
drop policy if exists jump_posts_borrar on public.jump_posts;
create policy jump_posts_borrar on public.jump_posts
  for delete to authenticated using (autor_id = auth.uid());
drop policy if exists jump_posts_moderar on public.jump_posts;
create policy jump_posts_moderar on public.jump_posts
  for update to authenticated using (public.jump_es_admin()) with check (public.jump_es_admin());

drop policy if exists jump_comentarios_leer on public.jump_comentarios;
create policy jump_comentarios_leer on public.jump_comentarios
  for select to authenticated
  using (public.jump_es_miembro()
         and (oculto_en is null or autor_id = auth.uid() or public.jump_es_admin())
         and exists (select 1 from public.jump_posts p where p.id = post_id));
drop policy if exists jump_comentarios_crear on public.jump_comentarios;
create policy jump_comentarios_crear on public.jump_comentarios
  for insert to authenticated
  with check (autor_id = auth.uid() and public.jump_es_miembro() and oculto_en is null and oculto_por is null
              and not es_ejemplo
              and exists (select 1 from public.jump_posts p where p.id = post_id and p.oculto_en is null));
drop policy if exists jump_comentarios_borrar on public.jump_comentarios;
create policy jump_comentarios_borrar on public.jump_comentarios
  for delete to authenticated using (autor_id = auth.uid());
drop policy if exists jump_comentarios_moderar on public.jump_comentarios;
create policy jump_comentarios_moderar on public.jump_comentarios
  for update to authenticated using (public.jump_es_admin()) with check (public.jump_es_admin());

-- ============================================================
-- 8. STORAGE
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('jump-portadas', 'jump-portadas', true, 5242880, array['image/webp', 'image/jpeg', 'image/png']),
  ('jump-material', 'jump-material', false, 20971520, array[
     'application/pdf',
     'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'image/jpeg', 'image/png', 'image/webp']),
  ('jump-muro', 'jump-muro', false, 5242880, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists jump_portadas_admin on storage.objects;
create policy jump_portadas_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'jump-portadas' and public.jump_es_admin())
  with check (bucket_id = 'jump-portadas' and public.jump_es_admin());

drop policy if exists jump_material_leer on storage.objects;
create policy jump_material_leer on storage.objects
  for select to authenticated
  using (bucket_id = 'jump-material'
         and (public.jump_es_admin()
              or (public.jump_es_miembro() and public.jump_mentoria_visible(public.jump_storage_mentoria(name)))));
drop policy if exists jump_material_admin on storage.objects;
create policy jump_material_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'jump-material' and public.jump_es_admin())
  with check (bucket_id = 'jump-material' and public.jump_es_admin());

drop policy if exists jump_muro_leer on storage.objects;
create policy jump_muro_leer on storage.objects
  for select to authenticated using (bucket_id = 'jump-muro' and public.jump_es_miembro());
drop policy if exists jump_muro_subir on storage.objects;
create policy jump_muro_subir on storage.objects
  for insert to authenticated
  with check (bucket_id = 'jump-muro' and public.jump_es_miembro()
              and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists jump_muro_borrar on storage.objects;
create policy jump_muro_borrar on storage.objects
  for delete to authenticated
  using (bucket_id = 'jump-muro' and ((storage.foldername(name))[1] = auth.uid()::text or public.jump_es_admin()));

-- ============================================================
-- 9. PRIMER ADMIN DE JUMP (EDITA Y CORRE APARTE, UNA SOLA VEZ)
-- ============================================================
-- a) Authentication → Users → Add user → Create new user:
--      correo:  TU_USUARIO@equipo.laauroraescucha.com   (TU_USUARIO: minúsculas, números, punto o guion)
--      clave:   la que vayas a usar · marca "Auto Confirm User".
-- b) Cambia TU_USUARIO y TU NOMBRE abajo, quita los "--" de las 3 líneas y corre solo eso:
-- insert into public.jump_miembros (user_id, rol, usuario, nombres, debe_cambiar_clave)
-- select id, 'admin', 'TU_USUARIO', 'TU NOMBRE', false from auth.users
--  where email = 'TU_USUARIO@equipo.laauroraescucha.com';
