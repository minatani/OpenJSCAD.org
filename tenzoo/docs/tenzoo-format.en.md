# The tenzoo format (.tenzoo), version 1

[日本語](tenzoo-format.md) | English

This is the format tenzoo saves figures in. Every field is defined here so that other software can read and write it.
A machine-checkable [JSON Schema](tenzoo.schema.json) is also provided.

## 1. Design

1. **Vectors, not dots**: lines, shapes and areas are stored as geometry plus a *style* that says how to place dots;
   the dots themselves are not stored (except for objects that are explicitly a set of dots). Scaling, changing the dot
   spacing or the area pattern, and switching output devices lose no information.
2. **Device independent**: all coordinates are millimetres. Snapping to a printer's grid and choosing its dot types
   happens only on output, through a *profile*. The same file can be printed on an ESA721 (Edel format), other braille
   embossers, or swell paper (PDF, PNG, SVG).
3. **Logical dot sizes**: `S` (small), `M` (medium), `L` (large). The device decides the actual diameter or height.
   For Edel (ESA721): `S` = 1, `M` = 2 (braille dot), `L` = 3.
4. **Extensible**: it is JSON. Readers ignore fields they do not know and should keep them when saving again.

## 2. File

| Item | Value |
|---|---|
| Encoding | UTF-8 without BOM |
| Extension | `.tenzoo` |
| MIME type | `application/json` (`application/vnd.tenzoo+json` recommended for a dedicated type) |
| Content | one JSON object |

Coordinates: origin at the top left of the paper, x to the right, y downward, in millimetres (decimals allowed).
Angles are radians, positive = clockwise on screen (y points down). A dot position is the dot's centre.

## 3. Top level

```jsonc
{
  "format": "tenzoo",        // required, fixed string
  "version": 1,              // required, version of this specification (integer)
  "meta": { ... },
  "page": { ... },
  "profile": "esa721",       // default output device
  "settings": { ... },
  "layers": [ ... ],         // at least one; the first element is the bottom-most
  "activeLayer": "L...",     // id of the layer being edited
  "underlays": [ ... ]       // tracing images, never printed
}
```

### 3.1 meta

`title` (string), `created` and `modified` (ISO 8601 strings), `app` (name of the saving software).

### 3.2 page

`paper` (string, below; `CUSTOM` for free sizes), `width` and `height` (mm, positive).

| `paper` | Size (mm) | Note |
|---|---|---|
| `EB5` | 203.2 × 254 | Braille paper "B5" of Edel (8 × 10 in, 32 cells × 22 lines) |
| `EA4` | 254 × 279.4 | Braille paper "A4" of Edel (10 × 11 in, 40 cells × 24 lines) |
| `B5` / `B5L` | 182 × 257 / 257 × 182 | ISO B5 portrait / landscape |
| `A4` / `A4L` | 210 × 297 / 297 × 210 | ISO A4 portrait / landscape |
| `A3` | 297 × 420 | ISO A3 portrait |
| `CUSTOM` | `width` × `height` | free |

### 3.3 profile

| Value | Meaning |
|---|---|
| `esa721` | ESA721 / Edel compatible. Grid 0.3454 mm across × 0.3175 mm down (one ESA721 step); dots S, M, L |
| `generic25` | embosser with a 2.5 mm grid and one dot type (approximate) |
| `dpi20` | embosser with a 20 dpi (≈ 1.27 mm) grid (approximate) |
| `swell` | swell paper; no grid |
| `free` | no grid (vectors as they are) |

Unknown values are treated as `esa721`.

### 3.4 settings

| Field | Type | Default | Meaning |
|---|---|---|---|
| `minDist` | number or null | null | minimum distance between dots (mm); closer dots are merged keeping the larger. null = the profile's default (1.0 for ESA721); 0 = never merge |
| `braille` | object | below | braille dimensions (mm) |
| `edlFullArea` | boolean | false | on braille paper B5, use the full ESA721 area (row 725) instead of Edel's figure area (row 684) |

`braille`: `dotPitchX` 2.07 (6 ESA721 steps), `dotPitchY` 2.06 (≈ 6.5 steps), `cellPitch` 5.18 (15 steps), `linePitch` 10.48 (33 steps).

### 3.5 layers

| Field | Type | Meaning |
|---|---|---|
| `id` | string | unique in the document |
| `name` | string | name |
| `visible` | boolean | shown; hidden layers are not in the default export set ("visible layers") |
| `locked` | boolean | not editable |
| `side` | `front` / `back` | `back` dots are embossed on the back of the sheet, drawn **as seen from the front** (mirroring for the back is done on output) |
| `color` | string | display colour `#rrggbb`; not printed |
| `objects` | array | objects; later elements are on top |

### 3.6 underlays

Tracing images, never printed or exported: `id`, `name`, `src` (data URL), `x`, `y`, `w`, `h` (placement, mm),
`baseW`, `baseH` (size when imported, the base of "size %"), `opacity` (0–1), `visible`.

## 4. Objects

### 4.1 Common fields

| Field | Type | Meaning |
|---|---|---|
| `id` | string | required, unique in the document |
| `type` | string | required (4.3) |
| `style` | object | how dots are placed (4.2) |
| `edel` | object | only on lines and arcs imported from an Edel `.ezi`: `{ "s": spacing }` in ESA721 steps (integer). Dots are then placed the way Edel does: divide the length by `s`, round to get n equal parts, place n + 1 dots including both ends, rounded to whole steps |
| `source` | string | where it was imported from (e.g. `edl`), informational |
| `kbd` | boolean | a set of dots typed with the keyboard (marks where the next typed dots are appended) |

### 4.2 style

| Field | Type | Default | Meaning |
|---|---|---|---|
| `stroke` | boolean | true | draw the outline with dots |
| `dot` | `S`/`M`/`L` | `M` | dot size of the outline (for markers, of the marker) |
| `spacing` | number | 2.0 | dot spacing of the outline (mm). A dot is always placed at a corner (a turn of 25° or more), and each stretch between corners is divided evenly |
| `line` | string | `solid` | `solid`, `dashed` (3 spacings on, 2 off), `dotted` (twice the spacing), `double` |
| `width` | number | 2.8 | distance between the two lines of a `double` line (mm) |
| `arrow` | string | `none` | arrow heads on open lines: `none`, `start`, `end`, `both` |
| `fill` | object or null | null | area fill, closed shapes only (4.4) |
| `clear` | number | 0 | margin around braille and markers (mm): dots of **other** objects inside the object's bounding box grown by this margin are not output |

### 4.3 Types

| `type` | Fields | Meaning |
|---|---|---|
| `path` | `points: [[x,y],...]`, `closed` | straight line (2 points), polyline, polygon |
| `curve` | `points`, `closed` | smooth curve through the points (Catmull-Rom spline) |
| `freehand` | `points`, `closed` | freehand line (simplified points joined by straight segments) |
| `arc` | `points: [start, end, P3]` | circular arc through start and end. P3 need not lie on the circle: only the bulge h = (P3 − chord midpoint) · chord normal matters; radius R = (c²/4 + h²) / (2\|h\|) with chord length c; the sign of h gives the side. Same definition as type 102 of Edel's `.ezi` |
| `rect` | `x, y, w, h, rot` | rectangle; `x, y` is the top left before rotation, `rot` rotates about the centre |
| `ellipse` | `cx, cy, rx, ry, rot` | ellipse (`rx = ry` for a circle) |
| `dots` | `points: [[x, y, size], ...]` | a set of dots (dot tool, imported `.edl`, result of "convert to dots"); `size` is `S`/`M`/`L` (default `style.dot`) |
| `braille` | `x, y, text, dot, cells?, metrics?` | braille. `x, y` is the centre of dot 1 of the first cell. `text`: kana, ASCII letters and digits, Unicode braille (U+2800…), newlines. `dot`: dot size (default `M`). If `text` is empty, `cells` (6-bit integers, dot 1 = bit 0 … dot 6 = bit 5, newline = −1) is used. `metrics` overrides `settings.braille` for this object |
| `marker` | `x, y, shape, scale?` | map symbol centred at `x, y`. `shape`: `star`, `cross`, `square`, `diamond`, `circle`, `triangle`, `dot`; dots in 4.5; `scale` (default 1) |
| `mask` | `x, y, cell, w, h, rows` | region made by flood fill: a `w` × `h` bitmap of `cell`-mm squares with its top left at `x, y`. `rows[j]` lists runs `[start, length, start, length, ...]` in squares. Filled with `style.fill` |

Closed shapes: `rect`, `ellipse`, `mask`, and `path` / `curve` / `freehand` with `closed: true`.

### 4.4 fill

| Field | Type | Default | Meaning |
|---|---|---|---|
| `pattern` | string | `grid` | pattern (below) |
| `spacing` | number | 3.0 | distance between lines or dots (mm) |
| `pitch` | number | 1.6 | dot spacing along a line (mm) |
| `angle` | number | 0 | pattern angle (degrees) |
| `dot` | `S`/`M`/`L` | `S` | dot size |
| `inset` | number | 1.5 | margin from the outline (mm), only when `stroke` is true |
| `seed` | integer | 12345 | random seed for `random` (same seed, same dots) |

Patterns: `grid` (square grid), `hex` (staggered / triangular grid), `dense` (grid at `pitch`), `hlines` / `vlines`
(horizontal / vertical lines), `diag` / `diag2` (diagonal ／ / ＼), `cross` / `xcross` (+ / × grid lines), `wave`,
`zigzag`, `dashed` (3 dots on, 2 off, alternate rows shifted), `brick`, `checker` (blocks of 2 × `spacing`), `circles`
(concentric, centred on the bounding box), `radial`, `random` (stipple, dots at least `spacing` apart).

The pattern is built around the centre of the shape's bounding box, rotated by `angle`, and only dots inside the shape
(even-odd rule) and at least `inset` from the outline are used.

### 4.5 Marker dots

Offsets from the centre in ESA721 steps (0.3454 mm across, 0.3175 mm down), the same symbols as navimap-assistant and edlprt:
`cross` (0,−7) (−7,0) (0,0) (7,0) (0,7); `square` (−4,−4) (4,−4) (−4,4) (4,4); `diamond` (0,−7) (7,0) (0,7) (−7,0);
`star` 5 points on radius 8 from −90° every 72°; `circle` 6 points on radius 7 from 0° every 60°; `triangle` 3 points on
radius 8 from −90° every 120° plus the midpoints of its sides; `dot` (0,0). Values are rounded to whole steps.

## 5. Converting to dots (on output)

1. For each object of the selected layers (default: visible ones) compute its dots in mm: outlines divided by
   `spacing` with corners kept (dashed, dotted, double and arrows follow the same rule); objects with `edel` use the Edel
   rule of 4.1; fills follow 4.4; braille uses `settings.braille` (or `metrics`); markers use 4.5.
2. Remove dots of other objects inside the `clear` margins of braille and markers (front and back separately).
3. If the profile has a grid, snap every dot to the nearest grid point.
4. Replace dot sizes the device does not have with one it has.
5. Merge dots closer than `minDist`, keeping the larger (front and back separately).

## 6. Versions and compatibility

- `version` is the version of this specification; version 1 is `1`.
- Backward-compatible additions (new fields) do not change `version`; readers ignore unknown fields.
- Changes of meaning increase `version`. A reader opening a newer version should warn that information may be lost.
- Objects of an unknown `type` are neither shown nor output, but are kept when the file is saved again.
- Missing fields take their default values.

## 7. Example

See the example in the [Japanese version](tenzoo-format.md#7-例); the JSON is identical.
