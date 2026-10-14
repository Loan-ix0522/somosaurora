# DEFINITION OF DONE — Somos Aurora

Una funcionalidad está "lista" cuando:

## Funcional
- [ ] El formulario público guarda la opinión en `submissions` con **fecha y hora**.
- [ ] La foto (si se adjunta) se sube a Storage y queda referenciada.
- [ ] El panel admin requiere login (Supabase Auth) y muestra la **tabla tipo Excel** con todos los campos + timestamp, con filtros y **exportar CSV**.
- [ ] El informe semanal calcula conteos por categoría/sector y arma el **top 5–10** por frecuencia; el admin puede ajustarlo.
- [ ] "Archivar y limpiar" guarda `weekly_reports` + `featured_opinions` y **purga** `submissions` + fotos, con doble confirmación.
- [ ] La web pública muestra el **top vigente** desde `featured_opinions`.

## Calidad y seguridad
- [ ] RLS activo y probado: `anon` no puede leer `submissions`; sí puede leer `featured_opinions`.
- [ ] `service_role key` no aparece en el navegador ni en el repo.
- [ ] Validación de entrada en la Function (tipos, longitudes, consentimiento, tamaño/MIME de foto).
- [ ] Honeypot activo; rate-limit básico por `ip_hash`.
- [ ] Cabeceras de seguridad servidas (`_headers`).

## Operación
- [ ] Variables/secretos configurados en Cloudflare Pages.
- [ ] Migración SQL versionada y aplicable de forma idempotente.
- [ ] Prueba de extremo a extremo: enviar opinión → verla en el panel → generar informe → publicar top → verlo en la web → archivar y limpiar.
- [ ] README con pasos de despliegue y variables requeridas.

## Verificación
- Probar con datos de ejemplo (seed) antes de ir a producción.
- Confirmar que el borrado NO afecta `weekly_reports` ni `featured_opinions`.
