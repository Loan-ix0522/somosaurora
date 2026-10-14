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
- `weekly_reports` y `featured_opinions`: permanentes.
- Fotos en Storage: se borran al purgar la semana (las destacadas no muestran foto en v1).
