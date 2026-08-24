# TLC+ Web v1.0.0

**Track Layout Creator + — now in your browser.** 🌐🏁

The GT6 track layout editor you know from the desktop, rebuilt as a fully
static website. No install, no Python, no build step — open the page and
start laying down track. Hostable anywhere, including GitHub Pages.

## What's this?

TLC+ Web is a faithful web port of **Track Layout Creator +** (originally by
eran0004, community versions by daydrive7). It runs 100% client-side:
same geometry engine, same TED exporter, same terrain data — rebuilt in
plain HTML/CSS/JS.

**Verified:** the `.TED` files it exports are **byte-identical** to the
desktop application's output (tested across 8 varied track cases —
circuits, point-to-point rally stages, all four sceneries, narrow/short
roads, manual heights, hairpins and pit offsets).

## Highlights

- **Full track editor** — node-based polygon editing with Euler-spiral &
  circular corner interpolation, camber, and real-time preview
- **TED export/import** — byte-identical to the desktop tool; import TED
  back into editable geometry too
- **Real terrain** — Death Valley, Eifel, Andalusia and Eifel Flat
  heightmaps (full 1024×1024 precision) with smooth topographic contours
- **Elevation editor** — integrated elevation/slope graph, manual height
  nodes with ramp in/out transitions and smoothstep easing
- **Isometric 3D view** — rotatable, zoomable terrain preview with PNG export
- **Procedural generators** — Grand Prix, Technical/Karting, Oval,
  Rally (point-to-point) and Chaos
- **Image vectorizer** — trace a track from PNG/JPG via centerline
  (Zhang–Suen), outline (Moore-neighbor) or smart-fill (TSP) tracing
- **GPX & CSV import** — bring real-world roads in as reference paths
- **`.TRK5` save/load** — reads all legacy `.TRK`–`.TRK4` formats too
- **9 languages** — English, Polski, Español, Português (BR/PT), Français,
  Deutsch, 日本語, Русский
- **Modern dark theme** with selectable accent colour — all original
  keyboard shortcuts included

## Desktop releases

- Desktop **stable**: v1.1.2
- Desktop **latest beta**: v1.2.0-beta2
- **This web port**: v1.0.0 (based on the v1.2.0-beta2 exporter pipeline)

## Credits

Original Creator:
- **eran0004** (GTPlanet)

Community Modifications & Version 1.2:
- **daydrive7** (Discord, GitHub)

Additional Community-added features:
- GPX & CSV path import capability
- Automatic High-DPI screen scaling & modern dark visual theme
- Start/Finish line & exact physics length computation fixes
- Custom track width boundaries and procedural math builders

TLC+ Web is distributed under the **MIT License**.

GT6, Gran Turismo and the Track Path Editor are products of Polyphony
Digital / Sony Interactive Entertainment; this community tool is not
affiliated with them.
