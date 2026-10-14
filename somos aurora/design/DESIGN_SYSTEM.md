# DESIGN_SYSTEM — Somos Aurora (baseline)

Derivado del `index.html` actual. Profundidad posterior: `loanix-design-core`.

## Colores (tokens actuales)
| Token      | Valor     | Uso |
|------------|-----------|-----|
| `--orange` | `#ff6500` | acento principal / CTAs |
| `--orange2`| `#ff8a18` | gradiente naranja |
| `--blue`   | `#073c78` | titulares, marca |
| `--blue2`  | `#0b65c7` | enlaces/acciones azules |
| `--green`  | `#079b1c` | categoría "otro tema" / ✓ |
| `--ink`    | `#0d274d` | texto base |
| `--muted`  | `#66758d` | texto secundario |
| `--paper`  | `#fff`    | fondo tarjetas |
| `--line`   | `#dfe8f1` | bordes |

## Tipografía
- **Montserrat** 700–900 → titulares (`.hero h1`, `.section-title`).
- **DM Sans** 400–700 → cuerpo y UI.
- **Allura** → firma decorativa ("Valeria Constante").

## Forma / estilo
- Radio de tarjetas `--r: 22px`; botones tipo píldora (`999px`).
- Sombra suave `0 18px 50px rgba(12,42,82,.11)`.
- CTAs con gradiente naranja. Secciones con "personas" recortadas sobre fondos degradados suaves.

## El panel admin
- Reutiliza la paleta (azul/naranja) pero en layout denso tipo tablero: tabla, filtros, badges por categoría. Prioriza legibilidad sobre decoración.

## Pendiente
- Assets finales del cliente (fotos de personas, logo en alta). No bloquean el backend; los placeholders actuales se reemplazan al llegar.
