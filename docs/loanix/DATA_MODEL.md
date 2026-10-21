# DATA_MODEL — Somos Aurora

Postgres (Supabase). Todas las tablas con RLS activado.

## Tabla `submissions` — opiniones crudas (se purgan cada semana)
| Campo           | Tipo          | Notas |
|-----------------|---------------|-------|
| id              | uuid PK       | `gen_random_uuid()` |
| created_at      | timestamptz   | `now()` — **fecha y hora del envío** |
| tipo            | text          | `Propuesta` \| `Queja o problema` \| `Otro tema` |
| tema            | text          | categoría (agua, basura, alumbrado, etc.) |
| sector          | text          | sector de La Aurora |
| referencia      | text null     | referencia cercana |
| detalle         | text          | cuerpo de la opinión (10–600 chars) |
| evidencia_path  | text null     | ruta en Storage (bucket `evidencias`) |
| nombre          | text null     | opcional |
| celular         | text null     | opcional |
| consentimiento  | boolean       | debe ser `true` para aceptar |
| ip_hash         | text null     | hash de IP (anti-abuso; **no** se guarda IP cruda) |
| status          | text          | default `nuevo`: `nuevo`\|`revisado`\|`destacado`\|`archivado` |

Índices: `created_at`, `tema`, `sector`.

## Tabla `weekly_reports` — informes (PERSISTE)
| Campo            | Tipo        | Notas |
|------------------|-------------|-------|
| id               | uuid PK     | |
| created_at       | timestamptz | |
| week_start       | date        | |
| week_end         | date        | |
| total_opiniones  | int         | |
| por_categoria    | jsonb       | `{ "Basura y aseo": 12, ... }` |
| por_sector       | jsonb       | conteos por sector |
| resumen          | text null   | texto del informe |

## Tabla `informe_publico` — informe ciudadano que ve el público (PERSISTE)
Migración `0007`. Una fila por informe publicado; la web muestra el más reciente. Solo conteos.
| Campo         | Tipo        | Notas |
|---------------|-------------|-------|
| id            | uuid PK     | `gen_random_uuid()` |
| created_at    | timestamptz | cuándo se publicó (define cuál es «el más reciente») |
| origen        | text        | `automatico` (cada 5 días) \| `manual` (desde el panel) |
| periodo_desde | timestamptz | primera opinión posible del periodo |
| periodo_hasta | timestamptz | corte: opiniones **hasta** esta hora (el siguiente periodo empieza aquí) |
| total         | int         | opiniones contadas (> 0: no se publican informes vacíos) |
| por_tema      | jsonb       | arreglo `[{ "tema": "Agua potable y cortes", "total": 8, "porcentaje": 47 }, ...]` |

RLS: `SELECT` público; `DELETE` solo `is_admin()`; sin `INSERT`/`UPDATE` desde el navegador (escribe el servidor con la service role).
Reglas: se publica solo con ≥ 10 opiniones nuevas y 5 días desde el corte anterior; el primero cuenta los últimos 30 días. No alimenta el top de `/api/featured` (eso es `weekly_reports`).

## Tabla `featured_opinions` — top semanal público (PERSISTE)
| Campo          | Tipo        | Notas |
|----------------|-------------|-------|
| id             | uuid PK     | |
| report_id      | uuid FK     | → `weekly_reports.id` (on delete cascade) |
| created_at     | timestamptz | |
| rank           | int         | 1..10 |
| tipo           | text        | |
| tema           | text        | |
| sector         | text null   | |
| texto          | text        | cita a mostrar (puede limpiarse levemente) |
| autor_display  | text        | etiqueta pública, NO nombre real (ej. "Vecino de La Aurora") |

## Auth / admins
- Se usa `auth.users` de Supabase. **Signup público deshabilitado**; los admins se crean a mano.
- Regla de acceso: un usuario autenticado = admin (porque nadie más puede registrarse).

## Selección del top (sin IA, por frecuencia)
1. Contar `submissions` de la semana por `tema` y `sector`.
2. Ordenar categorías por conteo (desc) → base del informe.
3. Para el top 5–10: tomar las categorías más frecuentes y, dentro de cada una, elegir la opinión más sustancial (heurística: `length(detalle)` con mínimo, evitando duplicados obvios). El admin puede **editar/reordenar/quitar** antes de publicar.
4. Guardar snapshot en `weekly_reports` + filas en `featured_opinions`.

## Retención
- `submissions`: vida corta (una semana), se purga tras archivar el informe.
- `weekly_reports`, `featured_opinions` e `informe_publico`: permanentes (el informe público solo guarda conteos).
- Fotos en Storage: se borran al purgar la semana (las destacadas no muestran foto en v1).
