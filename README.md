# TLC+ Web

**TLC+ Web** is a faithful web port of **Track Layout Creator +** —
the GT6 track layout editor by **eran0004** (original creator) and
**daydrive7** (community modifications) — rebuilt as a fully static
HTML/CSS/JS application that runs entirely in the browser.

The port is based on desktop release **v1.2.0-beta2** (latest beta; the
current stable desktop release is **v1.1.2**).

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
- GPX import (real-world GPS paths) and CSV path import

### Export / import
- **`.TED` export** — identical binary output to the desktop tool
- `.TRK5` save/load (also reads legacy `.TRK`, `.TRK2`, `.TRK3`, `.TRK4`)
- Polygon CSV (`.pgn`) import/export
- TED import — both as a static reference path and reverse-engineered back
  into an editable polygon
- PNG screenshots and isometric 3D view export

### Terrain
- Heightmap system with the original Death Valley, Eifel, Andalusia and
  Eifel Flat elevation data (full 1024×1024 float16 precision)
- Marching-squares contour rendering with configurable fidelity
- Isometric 3D preview with rotate/pan/zoom

### Interface
- Dark theme with configurable accent colour
- 9 languages: English, Polski, Español, Português (BR/PT), Français,
  Deutsch, 日本語, Русский
- All original keyboard shortcuts (A/C/E/F/R/S/X/Y, arrows, Ctrl+Z/Y/S/O…)

## Hosting on GitHub Pages

1. Create a new repository on GitHub (e.g. `track-layout-creator-web`).
2. Copy **the entire contents of this folder** (including `index.html`,
   `css/`, `js/`, `maps/`, `LICENSE`) to the repository root.
3. In the repository, open **Settings → Pages**.
4. Under *Build and deployment*, set **Source** to `Deploy from a branch`,
   choose **main** (or `master`) and the **/ (root)** folder, then Save.
5. Your site will be live at
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.

No build step, no dependencies, no server code — everything is static and
runs client-side. The app also works when opened directly from the file
system (`file://`).

> **Note for project pages:** the app resolves the heightmap data relative
> to the page location, so hosting at a sub-path
> (`/repo-name/`) works out of the box.

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

## Development

Plain classic scripts (no bundler). Load order is defined at the bottom of
`index.html`:

- `js/locales.js` — all 9 language packs
- `js/geometry.js` — math core (Euler spirals, hairpins, helpers)
- `js/heightmap.js` — heightmap loading + marching squares contours
- `js/ted.js` — TED binary reader/writer, TRK formats, GPX/CSV import
- `js/construct.js` — the TED construction pipeline (banks, heights,
  checkpoints, roads, header)
- `js/trace.js` — image vectorizer
- `js/generators.js` — procedural track generators
- `js/isoview.js` — isometric 3D view
- `js/app.js` / `js/interact.js` / `js/ui.js` — application shell,
  interactions and UI

`maps/*.js` contain the terrain heightmaps as base64 float16 payloads —
they are loaded on demand the first time a scenery is selected.

## Credits & license

- Original creator for the original tool (TLC): eran0004 from GTPlanet, original creator of the improved tool (TLC+): daydrive7 from TikTok, and Discord.
- **TLC+ Web v1.0.0** (this port) is derived from that MIT-licensed source
  and is distributed under the same **MIT License** (see `LICENSE`).

Gran Turismo, Gran Turismo 6, and the Track Path Editor app are products of Polyphony
Digital / Sony Interactive Entertainment; this community tool is not
affiliated with them.
