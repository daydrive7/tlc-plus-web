# TLC+ Web

**TLC+ Web** is a faithful web port of **Track Layout Creator +** —
the GT6 track layout editor by **daydrive7** — rebuilt as a fully static
HTML/CSS/JS application that runs entirely in the browser.

The port is based on the latest stable desktop release **[v1.3.0](https://github.com/daydrive7/track-layout-creator-plus/releases/tag/v1.3.0)**.
The release archive is the source of the application code; `UPSTREAM.json` records
its SHA-256 and the source file hashes used for this update.

**[Open TLC+ Web](https://daydrive7.github.io/tlc-plus-web/)**

## Features

### Track editing
- Node-based polygon editor — place, drag and modify control points on a
  zoomable canvas with rulers
- Euler-spiral & circular curve interpolation with adjustable radii,
  segments and camber
- Elevation editor — integrated elevation/slope graph with manual height
  nodes, ramp in/out transitions and smoothstep easing
- Real-time preview with undo/redo history
- Point properties dialog (double-click a point for numeric entry)

### Track generation
- Procedural generators: Grand Prix, Technical/Karting, Oval/Speedway,
  Rally Stage (point-to-point) and Abstract/Chaos
- Image vectorizer — trace a track layout from PNG/JPG/WebP using
  Centerline (Zhang–Suen skeleton), Outline (Moore-neighbor) or Smart Fill
  (TSP) algorithms
- Track Tracer: turn GPX tracks/routes and latitude/longitude CSVs into
  editable circuits or point-to-point stages, with 50–100% trace accuracy
- GPX/CSV reference imports with real-world scale control

### Export / import
- **`.TED` export** — desktop-compatible binary records, including decorations
- `.TLCW` web project save/load — retains decorations and editor settings
- `.TRK5` geometry export/import (also reads legacy `.TRK`, `.TRK2`, `.TRK3`, `.TRK4`)
- Polygon CSV (`.pgn`) import/export
- TED import — both as a static reference path and reverse-engineered back
  into an editable polygon
- PNG screenshots and isometric 3D view export

### Terrain
- Heightmap system with the original Death Valley, Eifel, Andalusia and
  Eifel Flat elevation data (full 1024×1024 float16 precision)
- Marching-squares contour rendering with configurable fidelity
- Isometric 3D preview with rotate/vertical tilt/pan/zoom

### Interface
- Dark and Classic (light) themes with configurable accent colour
- Persisted Show Elevation and Show TLC+ title toggles
- 9 languages: English, Polski, Español, Português (BR/PT), Français,
  Deutsch, 日本語, Русский
- All original keyboard shortcuts (A/C/E/F/R/S/X/Y, arrows, Ctrl+Z/Y/S/O…)

## Decorations (v1.3.0)

- Desktop decoration artwork in the palette and on the canvas, with scenery-specific
  tents, trees, rocks and other variants. The release ships vector icon drawings
  rather than the optional PNG sprites; these SVGs are exported directly from
  its `drawDecoSymbol` function, and the decoration tool uses the original GIFs.
- Scenery-aware palette from the official decoration catalog: trees, tents/houses,
  rocks, cliffs, gates, stands, marshal posts, billboards and other available types
- Click beside the track to place, drag to move, right-click or Delete to remove
- Flip Side (F), cycle variant (V), Fill Track with a configurable interval,
  optional 5 m snapping and the 1000-item limit
- Exact 64-bit model IDs, side/track codes, height-included distances and forward
  or reversed cliff transition chains in TED import/export
- Decorations participate in undo/redo and web project/browser saves
- Scenery changes ask before removing incompatible decorations

## Saves and interoperability

**Save track / Ctrl+S** writes `.tlcw`, the browser project format. Browser-vault
saves use the same format and still load older TRK5 entries. Use **Export desktop
track (.trk5)** for desktop geometry interchange; TRK5 cannot store decorations.
Use **Export to TED** to include decorations in the game file.

TED import reconstructs editable geometry and decorations. As in the desktop
editable-import workflow, heights and banking are reset to zero/global; it is
not a lossless conversion of an arbitrary TED back to an editor project.
Canvas decorations use the desktop icons and show their occupied track spans.
They represent placement rather than rendering the in-game 3D models.

## Mobile controls (Web v1.3.1)

Open **Help → Controls (Mobile)** or the phone's **Help** button for an animated,
illustrated gesture guide. **Controls (PC)** keeps the mouse and keyboard reference.

- Bottom tools have larger labeled touch targets; top actions provide Multi,
  All, Edit, Delete and Fit
- Pen: tap to place or insert a node; Select: drag a node to move it
- Drag empty canvas space to pan with any tool
- Pinch/spread two fingers to zoom, or slide both fingers to pan, without placing
  extra nodes or accidentally changing a selection
- Multi selects several nodes for group movement, rotation, scale or deletion
- Edit opens numeric node properties or decoration distance/side/track/variant
- The isometric view supports one-finger rotation/tilt and two-finger pan/zoom
- Portrait and landscape layouts; resizing for the keyboard keeps the drawer open

**Performance Draft Mode (PDM) starts off.** The heightmap stays visible while
panning, dragging or zooming. PDM remains available in Map & Toggles for devices
that need it, and its explicit setting is stored per browser. Loading an older
project cannot silently enable it.

## Hosting and development

This repository deploys to GitHub Pages through `.github/workflows/deploy.yml`.
In Settings → Pages, choose **GitHub Actions** as the source. Pushes to `main`
run the parity checks before publishing the static app. Pull requests run the
checks without deploying. Published JavaScript and CSS URLs include the commit
SHA, so reloading after an update fetches the matching assets instead of
retaining a cached older interface.

No runtime dependencies, build step or server code. The app also opens directly
from the file system (`file://`). Heightmaps load relative to the page, including
GitHub Pages project subpaths. For local development:

```sh
python -m http.server 8000
```

Open `http://localhost:8000/` in a browser. Run the reproducible Node checks with:

```sh
node tests/parity.test.cjs
```

The suite uses golden cases generated from the v1.3.0 Python release: 984
binary decoration records across all five scenery indices, 12 GPS cases,
six geometry/banking cases, and hashes of all four terrain payloads. It also
checks TED/cliff round trips, web projects, legacy TRK5, unknown UUID retention,
isometric tilt and JavaScript syntax. For the browser integration checks:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

The browser suite checks placement/drag/flip/undo/redo, file and browser-vault
save/load, scenery-change confirmation, themes and visibility toggles, camera
tilt, GPS uploads, TED downloads, all nine language switches, mobile layout,
direct `file://` loading, genuine multi-touch events, non-destructive pinch/pan,
mobile selection and editing, landscape layout, and heightmap visibility. Screenshots and test downloads go to the ignored
`test-results/` directory. GitHub CI runs both suites before deployment.

See `tests/generate-desktop-fixtures.py`
for regeneration with the extracted release and its Python dependencies.

## Controls (quick reference)

| Input | Action |
|---|---|
| L-Click | Select point / place point (pen tool) |
| R-Click (hold) | Pan view / change radius over a point |
| Wheel | Zoom in/out |
| Shift+L-Click | Add/remove from selection (pen: delete) |
| Double-Click | Edit point properties |
| Arrows | Nudge selected point (or move start point) |
| A / C / E / F | Select all / center view / Euler toggle / flip direction |
| R / S | Rotate tool / scale tool |
| X / Y | Mirror on axis |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+S / Ctrl+O | Save / load track |

The decoration palette uses 54px squares around 44px desktop icons, with no visible names.

Terrain contours cover the full viewport at every zoom. On shallow slopes, zooming
in adds finer elevation lines with accurate labels; flat areas remain flat. Sampling
adapts to its cell budget, and canvas layout stays within the screen after resizing.

## Development

Plain classic scripts (no bundler). Load order is defined at the bottom of
`index.html`:

- `js/locales.js` — all 9 language packs
- `js/geometry.js` — math core (Euler spirals, hairpins, helpers)
- `js/heightmap.js` — heightmap loading + marching squares contours
- `js/ted.js` — TED binary reader/writer, TRK formats, GPX/CSV import
- `js/construct.js` — the TED construction pipeline (banks, heights,
  checkpoints, roads, header)
- `js/decoration-data.js` / `js/decorations.js` — catalog, editor and TED records
- `js/decoration-icons.js` / `assets/` — desktop icons for the palette and canvas
- `js/mobile.js` — touch gestures, mobile actions and illustrated controls guide
- `js/path-trace.js` — GPX/CSV tracing pipeline
- `js/project.js` — lossless web project persistence and view preferences
- `js/trace.js` — image vectorizer
- `js/generators.js` — procedural track generators
- `js/isoview.js` — isometric 3D view
- `js/app.js` / `js/interact.js` / `js/ui.js` — application shell,
  interactions and UI

`maps/*.js` contain the terrain heightmaps as base64 float16 payloads —
they are loaded on demand the first time a scenery is selected.

## Credits & license

- Original creator for the original tool (TLC): eran0004 from GTPlanet, original creator of the improved tool (TLC+): daydrive7 from TikTok, and Discord.
- **TLC+ Web v1.3.3** (this port) is derived from that MIT-licensed source
  and is distributed under the same **MIT License** (see `LICENSE`).

Gran Turismo, Gran Turismo 6, and the Track Path Editor app are products of Polyphony
Digital / Sony Interactive Entertainment; this community tool is not
affiliated with them.
