# tenzoo — a tactile graphics editor that runs in the browser

[日本語](README.md) | English

tenzoo is a web app for making tactile graphics (点図). It covers the features of the Japanese editor Edel (エーデル)
and adds layers, vector data and rich area fills. It is plain JavaScript (ES modules), needs no build step, runs entirely
in the browser (no data leaves the device), works offline once loaded, and is usable on desktops, tablets and phones and
with screen readers.

- Live version: https://minatani.github.io/tenzoo/ (after GitHub Pages is enabled)
- Demo figure: `index.html?sample=demo`
- Local: `python3 -m http.server 8080`, then open http://localhost:8080/
- Tests: `node --test` (Node.js 20+). With the real files of minatani/edlprt: `EDLPRT_EXAMPLES=<edlprt>/examples node --test`

## Features

- **Drawing**: dots (small / medium / large), straight lines, polylines, curves, arcs (Edel's 3-point definition),
  freehand, rectangles, ellipses, braille (kana → Japanese braille, six-key input, snapping to braille cells),
  map symbols (star, cross, square, diamond, circle, triangle — the same shapes as navimap-assistant and edlprt),
  eraser (brush or rectangle). Lines: dot size, spacing, solid / dashed / dotted / double, arrows.
  Corners always get a dot.
- **Area fills**: rectangle, ellipse, lasso, polygon or flood fill of an enclosed area; 17 patterns with spacing,
  angle, dot size and margin from the outline; optional outline.
- **Layers**: visibility, lock, colour, order, merge (as shapes or as dots), front / back side for duplex printing.
- **Underlays**: images to trace, automatic image-to-dots, SVG import as vector shapes.
- **Checks**: dots of different objects too close, dense areas, dots outside the ESA721 print area, lines touching
  braille, symbols too close. Braille cell grid with line numbers; braille reading overlay. Margins around braille and
  symbols automatically clear other dots.
- **Files**:
  - tenzoo (`.tenzoo`, JSON) — the native format, specified in [docs/tenzoo-format.en.md](docs/tenzoo-format.en.md)
    with a [JSON Schema](docs/tenzoo.schema.json)
  - Edel `.edl` (B5 / A4, multi-page and duplex extensions), `.ezi` (segments and arcs, editable), `.sebk` — read and write
  - ESA721 print data (`.esa`, byte-identical to edlprt / EBP, with per-size passes and aspect correction) — write only;
    tenzoo does not drive the printer
  - SVG, PDF, PNG (real size), printing; images and SVG as input
- **Output profiles**: ESA721 (one printer step = 0.3454 × 0.3175 mm), generic embossers, swell paper, free vectors.
- **Accessibility**: keyboard drawing on the canvas for every tool except freehand and lasso (arrow keys move a cursor,
  Enter places a point), spoken positions and results, an object list that describes every shape in words, numeric
  editing, "add a shape by numbers". axe-core reports no violations.

## Edel formats

There is no public specification. tenzoo follows the analysis of real files, the ESA721 Ver'95 manual and EBP in
minatani/edlprt (docs/edl-format, docs/sebk-format, docs/ebp) and the analysis in tenji-editor (MIT). See
[docs/format.md](docs/format.md) (Japanese) for details and the verification against real files: every single-page
`.edl` and both `.sebk` files of edlprt round-trip byte for byte; dots generated from `.ezi` match 569 of 578 (zu1) and
552 of 567 (map) `.edl` dots, the rest being the unresolved `.5` rounding (one step, about 0.3 mm). Writing `.ezi` and
`.sebk` is experimental until checked with Edel itself.

## License

MIT. Edel is software by 藤野稔寛 (Toshihiro Fujino); tenzoo is an independent project not affiliated with it.
