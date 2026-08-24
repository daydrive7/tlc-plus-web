/* =========================================================================
 * Track Layout Creator + — Web Port
 * app.js — application core: state, canvas rendering, interactions
 *          (web port of the MIT-licensed TLC+ desktop app v1.2.0-beta2)
 *
 * Original tool: Copyright (c) 2017 eran0004, (c) 2026 daydrive7 (MIT)
 * ========================================================================= */
'use strict';

/* ------------------------------------------------------------------ */
/* Global state (mirrors the tk variables of the original app)        */
/* ------------------------------------------------------------------ */
const S = {
  // Geometry
  roadWidth: 10,
  maxCamberAngle: 3,
  camberRate: 0.15,
  camberAxis: 0,
  smoothMix: 1,
  sectorScale: 4,
  roadBaseLen: 1,
  separateStartPit: false,
  startOffset: 0,
  pitOffset: 0,
  circuit: true,
  narrowRoad: false,
  shortStraight: false,
  manualHeight: false,
  manualHeightIn: 1.0,
  manualHeightOut: 1.0,
  manualHeightEase: true,

  // Map / view
  heightMapFidelity: 3,
  mapBorder: 600,
  labelFontSize: 8,
  displayGrid: false,
  displayHeightmap: true,
  displayReferencePath: true,
  displayRoad: true,
  displayRoadBorder: true,
  displayRoadWidth: true,
  displayPolygon: true,
  displayCornerCountLabels: false,
  displayPolygonLabels: true,
  displayLabels: true,
  displayTracklengthLabels: true,
  tracklengthLabelsMode: 'Length',
  optimizeInteraction: true,
  referenceScale: 1.0,

  // Generators / prefs
  showProcGen: true,
  showImgVec: false,
  showExtPath: true,
  allowRallyCircuit: false,
  snap: false,
  accentColor: '#0A84FF',

  // Scenery
  sceneryindex: 5,   // EIFEL_FLAT
  roadFlag: 0,

  // Derived
  cornerCount: 0,
  trackLength: 0,
  heightMap: null,
};

const SCENERIES = { 1: 'Death Valley', 2: 'Eifel', 3: 'Andalusia', 5: 'Eifel Flat' };
const DEATH_VALLEY = 1, EIFEL = 2, ANDALUSIA = 3, EIFEL_FLAT = 5;
const HEIGHTMAP_STEPS = [50, 25, 10, 5, 2.5, 1];

/* Editable data */
let polygon = [];
let CPS = [];
let referencePath = [];
let history = [];
let future = [];
let selectedPoints = [];
let navCursors = [];
let roundedPolygonCache = null;

/* View / interaction state */
let zoom = 1.0;
const zoomFactor = Math.SQRT2;
const maxZoom = 16;
const minZoom = 0.0625;
let panX = 0, panY = 0;
let toolMode = 'pan';
let gridsize = 1;
let selectionCenter = null;
let interacting = false;
let scrolling = false;
let segmentChange = false;
let segmentTargetPointIndex = null;
let mouseLocation = { x: 0, y: 0 };
let panMode = false;
let mirroring = false;
let axis = { x: true, y: true };
let warningFlash = false;
let hasWarnings = false;
let indicatorTimer = null;
let zoomTimer = null;
let pdmUserFidelity = null;
let pdmRestoreTimer = null;

const defaultHeight = 0;
const labelOffset = 8;
const roadWidthMin = 0.01;
const roadWidthMax = 100;
const roadWidthOffset = 0;

/* Track length display state */
const trackLengthState = { lengths: [], distances: [], total: 0 };

/* DOM handles */
let mainCanvas, mainCtx, rulerNorth, rulerNorthCtx, rulerWest, rulerWestCtx;
let navCanvas, navCtx, navRuler, navRulerCtx;
const DPR = () => window.devicePixelRatio || 1;

/* Redraw scheduling.
 * The main canvas is a layered stack (background -> polygon -> track) where
 * no single layer clears the canvas — so whenever the polygon or track is
 * dirty, the whole stack MUST be redrawn from the background up. Otherwise
 * intermediate drag positions accumulate as ghost trails. Only the nav
 * (elevation) canvas is independent. */
const dirty = { canvas: false, polygon: false, track: false, nav: false };
let rafScheduled = false;
function requestRedraw(parts) {
  if (!parts) parts = dirty;
  for (const k of ['canvas', 'polygon', 'track', 'nav']) {
    if (parts === dirty ? parts[k] : parts.includes(k)) dirty[k] = true;
  }
  if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      if (dirty.canvas || dirty.polygon || dirty.track) {
        dirty.canvas = dirty.polygon = dirty.track = false;
        try { drawCanvas(); } catch (e) { console.warn('draw error in canvas:', e); }
        try { drawPolygon(polygon); } catch (e) { console.warn('draw error in polygon:', e); }
        try { drawTrack(polygon); } catch (e) { console.warn('draw error in track:', e); }
      }
      if (dirty.nav) {
        dirty.nav = false;
        try { drawNavCanvas(); } catch (e) { console.warn('draw error in nav:', e); }
      }
    });
  }
}
function displayChange() { requestRedraw(['canvas', 'polygon', 'track', 'nav']); }
function canvasChange() { requestRedraw(['canvas']); }
function polygonChange() { requestRedraw(['polygon']); }
function trackChange() { requestRedraw(['track']); }
function navCanvasChange() { requestRedraw(['nav']); }

/* ------------------------------------------------------------------ */
/* Localization                                                       */
/* ------------------------------------------------------------------ */
let CURRENT_LANG = 'en';
function tr(text) {
  const lang = (window.TLC_LOCALES || {})[CURRENT_LANG];
  if (lang && Object.prototype.hasOwnProperty.call(lang, text)) return lang[text];
  return text;
}

/* ------------------------------------------------------------------ */
/* Colour helpers (apply_theme of the original)                      */
/* ------------------------------------------------------------------ */
function hexToRgb(h) {
  h = h.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(rgb) {
  const [r, g, b] = rgb.map(v => Math.max(0, Math.min(255, Math.round(v))));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}
function lightenHex(h, amount) {
  const [r, g, b] = hexToRgb(h);
  return rgbToHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]);
}
function darkenHex(h, amount) {
  const [r, g, b] = hexToRgb(h);
  return rgbToHex([r * (1 - amount), g * (1 - amount), b * (1 - amount)]);
}

const THEME = {};
function applyTheme() {
  const accent = S.accentColor || '#0A84FF';
  THEME.ACCENT = accent;
  THEME.ACCENT_LIGHT = lightenHex(accent, 0.35);
  THEME.ACCENT_DARK = darkenHex(accent, 0.30);
  THEME.CANVAS_BG = '#252526';
  THEME.DESKTOP_BG = '#2D2D2D';
  THEME.NAV_BG = '#1E1E1E';
  THEME.DARKER_SILVER = '#1E1E1E';
  THEME.LIGHT_SILVER = '#3C3C3C';
  THEME.SILVER = '#2D2D2D';
  THEME.WHITE = '#E0E0E0';
  THEME.GREY = '#858585';
  THEME.LABELTEXT = '#E0E0E0';
  THEME.GRID_COLOR = '#333333';
  THEME.GRID_LABEL = '#858585';
  THEME.POLYGON_BASE = THEME.ACCENT_LIGHT;
  THEME.POLYGON_HOVER = '#FFE600';
  THEME.POLYGON_SELECTED = '#FF9F0A';
  THEME.POLYGON_MOD = '#30D158';
  THEME.POLYGON_MOD_2 = '#FF8080';
  THEME.TRACK_TRACK = '#E0E0E0';
  THEME.TRACK_BORDER = '#858585';
  THEME.NAV_LINE = THEME.ACCENT_LIGHT;
  THEME.NAV_SLOPE = '#FF9F0A';
  THEME.NAV_GRID = '#404040';
  THEME.NAV_CURSOR = '#FF453A';
  THEME.WARNING_1 = '#FF453A';
  THEME.WARNING_2 = '#FF9F0A';
  THEME.ARROW_COLOR = '#FFD60A';
  THEME.H_MAGENTA = [130, 0, 130];

  const root = document.documentElement;
  root.style.setProperty('--accent', THEME.ACCENT);
  root.style.setProperty('--accent-light', THEME.ACCENT_LIGHT);
  root.style.setProperty('--accent-dark', THEME.ACCENT_DARK);
  const titleBg = darkenHex(THEME.ACCENT, 0.88);
  root.style.setProperty('--titlebar-bg', titleBg);

  // redraw with new colours
  displayChange();
  saveConfig();
}

/* ------------------------------------------------------------------ */
/* Config persistence (localStorage equivalent of config.json)       */
/* ------------------------------------------------------------------ */
function saveConfig() {
  try {
    const cfg = {
      theme: 'Dark',
      elev_height: document.getElementById('nav-area') ?
        Math.round(document.getElementById('nav-area').getBoundingClientRect().height) : 160,
      language: CURRENT_LANG,
      accent_color: S.accentColor,
      show_proc_gen: S.showProcGen,
      show_img_vec: S.showImgVec,
      show_ext_path: S.showExtPath,
    };
    localStorage.setItem('tlcp_config', JSON.stringify(cfg));
  } catch (e) { /* storage unavailable */ }
}

function loadConfig() {
  try {
    const raw = localStorage.getItem('tlcp_config');
    if (!raw) return;
    const cfg = JSON.parse(raw);
    if (cfg.accent_color) S.accentColor = cfg.accent_color;
    if (cfg.language && (window.TLC_LOCALES || {})[cfg.language]) CURRENT_LANG = cfg.language;
    if (cfg.elev_height && cfg.elev_height > 30) {
      const nav = document.getElementById('nav-area');
      if (nav) { nav.style.flexBasis = cfg.elev_height + 'px'; nav.style.height = cfg.elev_height + 'px'; }
    }
    if (typeof cfg.show_proc_gen === 'boolean') S.showProcGen = cfg.show_proc_gen;
    if (typeof cfg.show_img_vec === 'boolean') S.showImgVec = cfg.show_img_vec;
    if (typeof cfg.show_ext_path === 'boolean') S.showExtPath = cfg.show_ext_path;
  } catch (e) { /* storage unavailable */ }
}

/* ------------------------------------------------------------------ */
/* View transform helpers                                             */
/* ------------------------------------------------------------------ */
function worldToScreenX(x) { return x * zoom + panX; }
function worldToScreenY(y) { return y * zoom + panY; }
function canvasX(mouseX) { return mouseX - panX; }
function canvasY(mouseY) { return mouseY - panY; }

/* Keep the view centre within the map border (Scroll margin slider) —
 * the web equivalent of the original's scrollregion limit. */
function clampPan() {
  if (!S.heightMap) return;
  const rect = mainCanvas.getBoundingClientRect();
  const limit = S.heightMap.mapSize / 2 + S.mapBorder;
  const cx = canvasX(rect.width / 2) / zoom;
  const cy = canvasY(rect.height / 2) / zoom;
  const clampedX = Math.max(-limit, Math.min(limit, cx));
  const clampedY = Math.max(-limit, Math.min(limit, cy));
  // new centre must equal clamped: panX = rect.width/2 - clampedX*zoom
  if (clampedX !== cx) panX += (cx - clampedX) * zoom;
  if (clampedY !== cy) panY += (cy - clampedY) * zoom;
}

function centerOnCoord(coords, anchor) {
  anchor = anchor || [0.5, 0.5];
  const rect = mainCanvas.getBoundingClientRect();
  const dx = rect.width * anchor[0];
  const dy = rect.height * anchor[1];
  panX = dx - coords[0] * zoom;
  panY = dy - coords[1] * zoom;
  clampPan();
  displayChange();
}

function centerOnTrack() {
  let centerPoint;
  if (navCursors.length > 0 && CPS.length) {
    const d = distanceToCoords(CPS, navCursors[0]);
    centerPoint = [d[0], d[1]];
  } else {
    centerPoint = getPolygonCenter();
  }
  centerOnCoord(centerPoint);
}

function getPolygonCenter() {
  if (!polygon.length) return [0, 0];
  const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
  const cy = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;
  return [cx, cy];
}

function zoomEvent(mx, my, direction) {
  const oldZoom = zoom;
  if (direction === 'out') zoom /= zoomFactor;
  else zoom *= zoomFactor;
  if (zoom > maxZoom) zoom = maxZoom;
  else if (zoom < minZoom) zoom = minZoom;

  let anchor;
  if (mx === undefined) {
    const rect = mainCanvas.getBoundingClientRect();
    mx = rect.width / 2; my = rect.height / 2;
    anchor = [0.5, 0.5];
  } else {
    const rect = mainCanvas.getBoundingClientRect();
    anchor = [mx / (rect.width || 1), my / (rect.height || 1)];
  }

  // keep the world point under the cursor fixed
  const worldX = canvasX(mx) / oldZoom;
  const worldY = canvasY(my) / oldZoom;
  panX = mx - worldX * zoom;
  panY = my - worldY * zoom;
  clampPan();
  void anchor;
  displayChange();
}

function zoomIn() { zoomEvent(undefined, undefined, 'in'); }
function zoomOut() { zoomEvent(undefined, undefined, 'out'); }

/* ------------------------------------------------------------------ */
/* Canvas sizing                                                      */
/* ------------------------------------------------------------------ */
function sizeCanvases() {
  const dpr = DPR();
  for (const canvas of [mainCanvas, rulerNorth, rulerWest, navCanvas, navRuler]) {
    const rect = canvas.getBoundingClientRect();
    // Skip degenerate rects (app hidden / layout not ready) — writing a 1x1
    // backing store would poison the canvas aspect-ratio for later layouts.
    if (rect.width < 2 || rect.height < 2) continue;
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
  }
}

/* ------------------------------------------------------------------ */
/* History (undo / redo)                                              */
/* ------------------------------------------------------------------ */
function snapshotPolygon() {
  return polygon.map(p => [p.x, p.y, p.z, p.radius, p.camber, p.segments]);
}
function saveToHistory(clearFuture) {
  const current = snapshotPolygon();
  if (!history.length || JSON.stringify(current) !== JSON.stringify(history[history.length - 1])) {
    history.push(current);
    if (history.length > 100) history.shift();
  }
  if (clearFuture !== false) future = [];
}
function saveToFuture() {
  const current = snapshotPolygon();
  if (!future.length || JSON.stringify(current) !== JSON.stringify(future[future.length - 1])) {
    future.push(current);
  }
}
function undo() {
  if (history.length > 0) {
    saveToFuture();
    polygon = history.pop().map(v => makeCoordinate(v[0], v[1], v[2], v[3], v[4], v[5]));
    selectedPoints = [];
    displayChange();
  }
}
function redo() {
  if (future.length > 0) {
    saveToHistory(false);
    polygon = future.pop().map(v => makeCoordinate(v[0], v[1], v[2], v[3], v[4], v[5]));
    selectedPoints = [];
    displayChange();
  }
}

/* ------------------------------------------------------------------ */
/* Drawing: background canvas (map, grid, contours, reference path)   */
/* ------------------------------------------------------------------ */
function drawCanvas() {
  const dpr = DPR();
  const rect = mainCanvas.getBoundingClientRect();
  mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mainCtx.clearRect(0, 0, rect.width, rect.height);

  if (!S.heightMap) return;
  const hm = S.heightMap;
  const x1 = hm.mapSize / 2, y1 = hm.mapSize / 2;
  const x0 = -x1, y0 = -y1;

  // map area
  mainCtx.fillStyle = THEME.CANVAS_BG;
  mainCtx.fillRect(worldToScreenX(x0), worldToScreenY(y0), (x1 - x0) * zoom, (y1 - y0) * zoom);

  // grid
  const sub = subdivideDistance(0, 1000 / zoom, 20, undefined, [x0, x1]);
  const gridlines = sub.points;
  const step = sub.step;
  const factor = sub.factor;
  gridsize = step;
  drawGridLines([x0, y0, x1, y1], gridlines, step, factor);

  // contours are skipped during scroll only in PDM draft mode
  if (S.displayHeightmap && !(scrolling && S.optimizeInteraction)) {
    drawContourLines(Math.floor(step));
  }
  if (S.displayReferencePath && referencePath.length > 0) {
    drawReferencePath();
  }
  drawRulers(gridlines, step, factor);
}

function drawGridLines(coords, gridlines, step, factor) {
  const [x0, y0, x1, y1] = coords;
  const rect = mainCanvas.getBoundingClientRect();
  const vx0 = canvasX(0) / zoom - 50 / zoom;
  const vy0 = canvasY(0) / zoom - 50 / zoom;
  const vx1 = (canvasX(rect.width)) / zoom + 50 / zoom;
  const vy1 = (canvasY(rect.height)) / zoom + 50 / zoom;

  const wideLines = (factor === 2.5) ? 4 : 5;
  if (!S.displayGrid) return;

  mainCtx.strokeStyle = THEME.GRID_COLOR;
  for (const line of gridlines) {
    const isMajor = (line / wideLines) % step === 0;
    mainCtx.lineWidth = isMajor ? 2 : 1;
    if (vx0 <= line && line <= vx1) {
      mainCtx.beginPath();
      mainCtx.moveTo(worldToScreenX(line), worldToScreenY(Math.max(y0, vy0)));
      mainCtx.lineTo(worldToScreenX(line), worldToScreenY(Math.min(y1, vy1)));
      mainCtx.stroke();
    }
    if (vy0 <= line && line <= vy1) {
      mainCtx.beginPath();
      mainCtx.moveTo(worldToScreenX(Math.max(x0, vx0)), worldToScreenY(line));
      mainCtx.lineTo(worldToScreenX(Math.min(x1, vx1)), worldToScreenY(line));
      mainCtx.stroke();
    }
  }
}

function drawRulers(gridlines, step, factor) {
  const dpr = DPR();
  // North ruler (x)
  const nr = rulerNorth.getBoundingClientRect();
  rulerNorthCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  rulerNorthCtx.clearRect(0, 0, nr.width, nr.height);
  // West ruler (y)
  const wr = rulerWest.getBoundingClientRect();
  rulerWestCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  rulerWestCtx.clearRect(0, 0, wr.width, wr.height);

  const wideLines = (factor === 2.5) ? 4 : 5;
  const drawLabels = !(interacting && S.optimizeInteraction);
  rulerNorthCtx.font = '8px "Segoe UI"';
  rulerWestCtx.font = '8px "Segoe UI"';

  for (const line of gridlines) {
    const sx = worldToScreenX(line);
    const sy = worldToScreenY(line);
    const isMajor = (line / wideLines) % step === 0;

    // Ticks for every gridline visible in the corresponding ruler (as the original)
    if (sx > -40 && sx < nr.width + 40) {
      rulerNorthCtx.strokeStyle = THEME.GRID_COLOR;
      rulerNorthCtx.beginPath();
      rulerNorthCtx.moveTo(sx, 19); rulerNorthCtx.lineTo(sx, 24);
      rulerNorthCtx.stroke();
    }
    if (sy > -40 && sy < wr.height + 40) {
      rulerWestCtx.strokeStyle = THEME.GRID_COLOR;
      rulerWestCtx.beginPath();
      rulerWestCtx.moveTo(19, sy); rulerWestCtx.lineTo(24, sy);
      rulerWestCtx.stroke();
    }

    // Labels only on major lines
    if (isMajor && drawLabels) {
      if (sx > -40 && sx < nr.width + 40) {
        rulerNorthCtx.fillStyle = THEME.GRID_LABEL;
        rulerNorthCtx.textAlign = 'center';
        rulerNorthCtx.fillText(line.toFixed(0) + 'm', sx, 12);
      }
      if (sy > -40 && sy < wr.height + 40) {
        rulerWestCtx.save();
        rulerWestCtx.translate(12, sy);
        rulerWestCtx.rotate(-Math.PI / 2);
        rulerWestCtx.fillStyle = THEME.GRID_LABEL;
        rulerWestCtx.textAlign = 'center';
        rulerWestCtx.fillText((-line).toFixed(0) + 'm', 0, 0);
        rulerWestCtx.restore();
      }
    }
  }
}

function drawContourLines(cellSize) {
  if (!S.heightMap) return;
  let step;
  // fidelity drop only applies while PDM (Performance Draft Mode) is enabled
  if (interacting && S.optimizeInteraction) step = (S.sceneryindex === EIFEL) ? 25 : 10;
  else step = HEIGHTMAP_STEPS[S.heightMapFidelity];

  const rect = mainCanvas.getBoundingClientRect();
  const topleft = [canvasX(0) / zoom, canvasY(0) / zoom];
  const bottomright = [canvasX(rect.width) / zoom, canvasY(rect.height) / zoom];
  const result = contours(S.heightMap, cellSize, [topleft[0], topleft[1], bottomright[0], bottomright[1]], step);
  if (!result || !result[0]) return;
  const [lineDict, zmin, zmax] = result;

  const zrange = (zmax - zmin) || 1;
  const boxWidth = 15, boxHeight = 5;
  let boldline;
  if ([2.5, 5, 25].includes(step)) boldline = 4;
  else boldline = 5;

  mainCtx.lineWidth = 1;
  for (const elevationStr of Object.keys(lineDict)) {
    const elevation = parseFloat(elevationStr);
    let width, color;
    if (mod(elevation, step * boldline) === 0) {
      width = 2;
      color = fractionToHex((elevation - zmin) / zrange);
    } else {
      width = 1;
      color = THEME.GREY;
    }
    mainCtx.strokeStyle = color;
    mainCtx.lineWidth = width;

    for (const line of lineDict[elevationStr]) {
      if (width === 2 && S.displayLabels && !interacting && line.length > 1) {
        const li = Math.floor(line.length / 2);
        const x = (line[li - 1][0] + line[li][0]) / 2;
        const y = (line[li - 1][1] + line[li][1]) / 2;
        const sx = worldToScreenX(x), sy = worldToScreenY(y);
        mainCtx.fillStyle = THEME.CANVAS_BG;
        mainCtx.fillRect(sx - boxWidth, sy - boxHeight, boxWidth * 2, boxHeight * 2);
        mainCtx.fillStyle = color;
        mainCtx.font = (S.labelFontSize - 1) + 'px "Segoe UI"';
        mainCtx.textAlign = 'center';
        mainCtx.fillText(String(parseFloat(elevation.toPrecision(6))) + ' m', sx, sy);
      }
      mainCtx.beginPath();
      // smooth=1 spline like the original Tk rendering (no more square corners)
      const screenPts = line.map(p => [worldToScreenX(p[0]), worldToScreenY(p[1])]);
      traceSmoothPath(mainCtx, screenPts);
      mainCtx.stroke();
    }
  }
}

function drawPathFromCps(cps, width, colour, lineWidth) {
  for (let i = 1; i < cps.length; i++) {
    const thisCp = cps[i];
    const prev = cps[i - 1];
    if (thisCp.formtype === 0 || thisCp.formtype === 3) {
      drawStraightOutline(prev.xy, thisCp.xy, width, colour, lineWidth);
    } else {
      const [radius, startAngle, sweepAngle] = getCurveData(cps, i);
      drawCurveOutline(thisCp.center, radius, startAngle, sweepAngle, width, colour, lineWidth);
    }
  }
}

/* Draw the road as a solid surface of exact world-metre width (stroke each
 * segment along the centreline with round caps so joins stay smooth). */
function drawRoadPath(cps, widthMeters, colour) {
  if (widthMeters <= 0) return;
  mainCtx.strokeStyle = colour;
  mainCtx.lineWidth = Math.max(1, widthMeters * zoom);
  mainCtx.lineCap = 'round';
  for (let i = 1; i < cps.length; i++) {
    const thisCp = cps[i];
    const prev = cps[i - 1];
    mainCtx.beginPath();
    if (thisCp.formtype === 0 || thisCp.formtype === 3) {
      mainCtx.moveTo(worldToScreenX(prev.x), worldToScreenY(prev.y));
      mainCtx.lineTo(worldToScreenX(thisCp.x), worldToScreenY(thisCp.y));
    } else {
      const [radius, startAngle, sweepAngle] = getCurveData(cps, i);
      const cx = worldToScreenX(thisCp.center[0]);
      const cy = worldToScreenY(thisCp.center[1]);
      mainCtx.arc(cx, cy, radius * zoom, -startAngle, -(startAngle + sweepAngle), sweepAngle > 0);
    }
    mainCtx.stroke();
  }
  mainCtx.lineCap = 'butt';
}

function drawReferencePath() {
  if (!referencePath.length) return;
  const scale = S.referenceScale;
  let scaledPath = referencePath;

  if (Math.abs(scale - 1.0) >= 0.001) {
    const minX = Math.min(...referencePath.map(p => p.x));
    const maxX = Math.max(...referencePath.map(p => p.x));
    const minY = Math.min(...referencePath.map(p => p.y));
    const maxY = Math.max(...referencePath.map(p => p.y));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    scaledPath = referencePath.map(p => {
      const nx = cx + (p.x - cx) * scale;
      const ny = cy + (p.y - cy) * scale;
      const ncx = cx + (p.x2 - cx) * scale;
      const ncy = cy + (p.y2 - cy) * scale;
      return makeCP([nx, ny], [ncx, ncy], p.formtype, p.radius ? p.radius * scale : p.radius,
        p.startAngle, p.sweepAngle, p.camber, p.camberFactor, p.z);
    });
  }
  drawPathFromCps(scaledPath, 0, THEME.ACCENT_DARK, 1.5);
}

/* ------------------------------------------------------------------ */
/* Drawing: control polygon                                           */
/* ------------------------------------------------------------------ */
function polygonAltColor() {
  if (toolMode === 'scale') return THEME.POLYGON_MOD;
  if (toolMode === 'rotate') return THEME.POLYGON_MOD_2;
  return THEME.POLYGON_SELECTED;
}

function drawPolygon(pg) {
  const dpr = DPR();
  const rect = mainCanvas.getBoundingClientRect();
  mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // radius check (matches the original: radius 0 / below-min is clamped to radMin)
  const radMin = S.roadWidth * 0.5 + 6;
  for (const point of pg) {
    if (point.radius === null || point.radius === undefined) point.radius = 90;
    else if (point.radius < radMin) point.radius = radMin;
  }

  if (!S.displayPolygon) return;

  const alt = polygonAltColor();
  const vx0 = canvasX(0) / zoom;
  const vy0 = canvasY(0) / zoom;
  const vx1 = canvasX(rect.width) / zoom;
  const vy1 = canvasY(rect.height) / zoom;
  const margin = Math.max(500, 200 / zoom);
  const nodeCount = pg.length;

  const labelFont = S.labelFontSize + 'px "Segoe UI"';

  for (let index = 0; index < nodeCount; index++) {
    const point = pg[index];
    const prevIdx = index > 0 ? index - 1 : nodeCount - 1;
    const isVisible = (vx0 - margin < point.x && point.x < vx1 + margin) && (vy0 - margin < point.y && point.y < vy1 + margin);
    const prevVisible = (vx0 - margin < pg[prevIdx].x && pg[prevIdx].x < vx1 + margin) && (vy0 - margin < pg[prevIdx].y && pg[prevIdx].y < vy1 + margin);
    if (!(isVisible || prevVisible || selectedPoints.includes(index))) continue;

    const selected = selectedPoints.includes(index);

    // line to previous
    if (S.circuit || index > 0) {
      const prev = pg[prevIdx];
      const lineColor = (selected && selectedPoints.includes(prevIdx)) ? alt : THEME.POLYGON_BASE;
      const lineWidth = (selected && selectedPoints.includes(prevIdx)) ? 2 : 1;
      mainCtx.strokeStyle = lineColor;
      mainCtx.lineWidth = lineWidth;
      mainCtx.setLineDash(index === 0 ? [3, 3] : []);
      mainCtx.beginPath();
      mainCtx.moveTo(worldToScreenX(prev.x), worldToScreenY(prev.y));
      mainCtx.lineTo(worldToScreenX(point.x), worldToScreenY(point.y));
      mainCtx.stroke();
      mainCtx.setLineDash([]);
    }

    // point
    const px = worldToScreenX(point.x), py = worldToScreenY(point.y);
    mainCtx.fillStyle = selected ? alt : THEME.POLYGON_BASE;
    mainCtx.strokeStyle = selected ? alt : THEME.POLYGON_BASE;
    mainCtx.lineWidth = 1;
    mainCtx.fillRect(px - 2, py - 2, 4, 4);
    mainCtx.strokeRect(px - 2.5, py - 2.5, 5, 5);

    if (selected) drawEulerHandle(pg, index, point, alt, labelFont);

    // label
    const showLabel = isVisible && S.displayPolygonLabels && S.displayLabels &&
      !(interacting && S.optimizeInteraction);
    if (showLabel && (nodeCount < 100 || zoom > 0.4 || selected)) {
      drawPolygonLabel(pg, index, point, selected, alt, labelFont);
    }
  }

  // selection center
  getSelectionCenter();
  if (selectionCenter) {
    const sx = worldToScreenX(selectionCenter[0]);
    const sy = worldToScreenY(selectionCenter[1]);
    mainCtx.strokeStyle = alt;
    mainCtx.lineWidth = 1;
    mainCtx.beginPath();
    mainCtx.moveTo(sx - 4, sy); mainCtx.lineTo(sx + 5, sy);
    mainCtx.moveTo(sx, sy - 4); mainCtx.lineTo(sx, sy + 5);
    mainCtx.stroke();
  }
}

function drawEulerHandle(pg, index, point, handleColor, labelFont) {
  const prevPoint = pg[(index - 1 + pg.length) % pg.length];
  const nextPoint = pg[(index + 1) % pg.length];
  const sweepAngle = getSweepAngleFromPoints(prevPoint.xy, point.xy, nextPoint.xy);
  const startAngle = getAngle(prevPoint.xy, point.xy);
  let handleAngle = startAngle + sweepAngle / 2;
  if (sweepAngle < 0) handleAngle += Math.PI;

  const handleDistance = (20 + point.segments * 10) / zoom;
  const textDistance = handleDistance + 15 / zoom;
  const offset = [Math.cos(handleAngle) * handleDistance, -Math.sin(handleAngle) * handleDistance];
  const textOffset = [Math.cos(handleAngle) * textDistance, -Math.sin(handleAngle) * textDistance];

  const text = String(point.segments);
  for (const i of [-1, 1]) {
    const hx = worldToScreenX(point.x + offset[0] * i);
    const hy = worldToScreenY(point.y + offset[1] * i);
    mainCtx.fillStyle = handleColor;
    mainCtx.beginPath();
    mainCtx.arc(hx, hy, 3, 0, Math.PI * 2);
    mainCtx.fill();
    mainCtx.strokeStyle = handleColor;
    mainCtx.beginPath();
    mainCtx.moveTo(worldToScreenX(point.x), worldToScreenY(point.y));
    mainCtx.lineTo(hx, hy);
    mainCtx.stroke();
    mainCtx.fillStyle = handleColor;
    mainCtx.font = labelFont;
    mainCtx.textAlign = 'center';
    mainCtx.fillText(text, worldToScreenX(point.x + textOffset[0] * i), worldToScreenY(point.y + textOffset[1] * i));
  }
}

function drawPolygonLabel(pg, index, point, selected, alt, labelFont) {
  let textFill;
  if (selected) textFill = alt;
  else textFill = THEME.LIGHT_SILVER;

  if (S.circuit || (index > 0 && index < pg.length - 1)) {
    const prevPoint = pg[(index - 1 + pg.length) % pg.length];
    const nextPoint = pg[(index + 1) % pg.length];
    const sweepAngle = getSweepAngleFromPoints(prevPoint.xy, point.xy, nextPoint.xy);
    const startAngle = getAngle(prevPoint.xy, point.xy);
    let textVector = startAngle + sweepAngle / 2 - Math.PI / 2;
    if (sweepAngle < 0) textVector += Math.PI;
    const textDistance = S.labelFontSize * 4;
    const offset = [Math.cos(textVector) * textDistance, -Math.sin(textVector) * textDistance];

    const ind = '[' + index + ']\n';
    let text;
    if (toolMode === 'camber') {
      text = point.camber === -1 ? ind + 'C Global' : ind + 'C ' + point.camber.toFixed(1) + '\u00B0';
    } else {
      const radius = point.radius;
      text = ind + 'R ' + radius.toFixed(1) + '\n' + degrees(sweepAngle).toFixed(1) + '\u00B0';
      if (point.z !== null && point.z !== undefined && point.z !== 0) {
        text += '\nH: ' + point.z.toFixed(1) + 'm';
      }
      if (Math.abs(degrees(sweepAngle)) ** 1.5 < radius) text += '!';
    }
    mainCtx.fillStyle = textFill;
    mainCtx.font = labelFont;
    mainCtx.textAlign = 'center';
    const lines = text.split('\n');
    const lx = worldToScreenX(point.x + offset[0]);
    const ly = worldToScreenY(point.y + offset[1]);
    lines.forEach((line, i) => {
      mainCtx.fillText(line, lx, ly + i * (S.labelFontSize + 1) - (lines.length - 1) * (S.labelFontSize + 1) / 2);
    });
  }
}

/* ------------------------------------------------------------------ */
/* Drawing: track                                                     */
/* ------------------------------------------------------------------ */
function drawTrack(pg) {
  const dpr = DPR();
  mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  CPS = [];
  const minPoints = 2 + (S.circuit ? 1 : 0);
  let curves = [];
  if (pg.length >= minPoints) {
    try {
      curves = roundPolygon(pg, S.circuit);
      CPS = constructCP(pg, curves, S);
    } catch (e) {
      console.warn('Error drawing track:', e);
      resetTrackLength();
      curves = [];
    }
  } else {
    resetTrackLength();
    drawCursor();
    drawNavCursor();
    return;
  }

  const m = measureTrackLength(CPS);
  trackLengthState.lengths = m.lengths;
  trackLengthState.distances = m.distances;
  trackLengthState.total = m.total;
  S.trackLength = m.total;
  S.cornerCount = curves.length;
  updateStats();

  drawRounded(curves);
  drawCursor();
  drawNavCursor();
}

function resetTrackLength() {
  trackLengthState.lengths = [];
  trackLengthState.distances = [];
  trackLengthState.total = 0;
  S.trackLength = 0;
  updateStats();
}

function updateStats() {
  const el = document.getElementById('stat-scenery');
  const el2 = document.getElementById('stat-length');
  const el3 = document.getElementById('stat-corners');
  if (el) el.textContent = tr(SCENERIES[S.sceneryindex] || 'Unknown');
  if (el2) el2.textContent = trackLengthState.total ? trackLengthState.total.toFixed(0) + ' m' : '--- m';
  if (el3) el3.textContent = String(S.cornerCount);
}

function drawRounded(curves) {
  const borderWidth = getBorderWidth(S);
  let lineWidth;
  if (!S.displayRoadWidth) lineWidth = 0;
  else lineWidth = S.roadWidth;

  const cornerCountSize = S.labelFontSize * 1.2;

  if (S.displayRoad) {
    if (lineWidth > 0) {
      // solid road surface, exact world-metre width
      drawRoadPath(CPS, lineWidth, THEME.TRACK_TRACK);
    } else {
      // road-width highlight off: draw the centreline only (as the original)
      drawPathFromCps(CPS, 0, THEME.TRACK_TRACK, 1);
    }
  }

  if (!(interacting && S.optimizeInteraction)) {
    if (S.displayRoadBorder) {
      drawBorders(CPS, lineWidth, borderWidth);
      drawMainStraight(CPS, 100, borderWidth);
    }
    drawWarnings(CPS, lineWidth, borderWidth);

    if (S.displayPolygon || S.displayLabels) {
      for (const curve of curves) drawEndpoints(curve);
    }

    if (S.displayLabels) {
      if (S.displayTracklengthLabels) {
        if (S.tracklengthLabelsMode === 'Measure') drawMeasure();
        else drawDistanceLabels(curves);
      }
      if (S.displayCornerCountLabels) drawCornerCountLabels(curves, borderWidth, cornerCountSize);
    }

    if (S.displayRoad) {
      if (S.circuit && Math.abs(S.pitOffset) > 0.001) drawPitVisuals();
      drawFinishLine(CPS);
      drawDirectionArrow(CPS, borderWidth / 2 * zoom + 10);
    }
  }
}

function drawBorders(cps, lineWidth, borderWidth) {
  drawPathFromCps(cps, borderWidth, THEME.TRACK_BORDER, 1);
  for (const thisCp of cps) {
    if (thisCp.formtype === 0 || thisCp.formtype === 3) continue;
    for (const i of [0, 1]) {
      const p0 = interpolateArc(thisCp.center, thisCp.radius - lineWidth / 2, thisCp.startAngle, thisCp.sweepAngle, i);
      const p1 = interpolateArc(thisCp.center, thisCp.radius - borderWidth / 2, thisCp.startAngle, thisCp.sweepAngle, i);
      mainCtx.strokeStyle = THEME.TRACK_BORDER;
      mainCtx.lineWidth = 1;
      mainCtx.beginPath();
      mainCtx.moveTo(worldToScreenX(p0[0]), worldToScreenY(p0[1]));
      mainCtx.lineTo(worldToScreenX(p1[0]), worldToScreenY(p1[1]));
      mainCtx.stroke();
    }
  }
}

function drawMainStraight(cps, straightBorderWidth, borderWidth) {
  const distance = Math.min(getMainstraightDistance(S), trackLengthState.total);
  if (!distance || !cps.length) return;

  for (let i = 1; i < cps.length; i++) {
    const thisCp = cps[i];
    const prev = cps[i - 1];
    let start = prev.xy;
    let end = thisCp.xy;
    let sweepAngle = thisCp.sweepAngle;
    const cpDistance = trackLengthState.distances[i - 1];
    const cpLength = trackLengthState.lengths[i - 1];
    if (cpDistance >= distance) {
      const prevDistance = cpDistance - cpLength;
      const f = (distance - prevDistance) / cpLength;
      const dPos = distanceToCoords(cps, distance);
      end = [dPos[0], dPos[1]];
      if (thisCp.formtype !== 0 && thisCp.formtype !== 3) sweepAngle *= f;
    }
    if (thisCp.formtype === 0 || thisCp.formtype === 3) {
      drawStraightOutline(start, end, straightBorderWidth, THEME.TRACK_BORDER, 1);
    } else {
      drawCurveOutline(thisCp.center, thisCp.radius, thisCp.startAngle, sweepAngle, straightBorderWidth, THEME.TRACK_BORDER, 1);
    }
    if (cpDistance >= distance) break;
  }

  // start / end caps
  for (const point of [distanceToCoords(cps, 0), distanceToCoords(cps, distance)]) {
    const x = point[0], y = point[1];
    const angle = point[2] - Math.PI / 2;
    const x0Offset = Math.cos(angle) * borderWidth / 2, y0Offset = -Math.sin(angle) * borderWidth / 2;
    const x1Offset = Math.cos(angle) * straightBorderWidth / 2, y1Offset = -Math.sin(angle) * straightBorderWidth / 2;
    for (const i of [-1, 1]) {
      const x0 = x + x0Offset * i, y0 = y + y0Offset * i;
      const x1 = x + x1Offset * i, y1 = y + y1Offset * i;
      mainCtx.strokeStyle = THEME.TRACK_BORDER;
      mainCtx.lineWidth = 1;
      mainCtx.beginPath();
      mainCtx.moveTo(worldToScreenX(x0), worldToScreenY(y0));
      mainCtx.lineTo(worldToScreenX(x1), worldToScreenY(y1));
      mainCtx.stroke();
    }
  }
}

function drawWarnings(cps, lineWidth, borderWidth) {
  // widths are in world metres (as the original: lineWidth + 8/zoom)
  const warningWidth = lineWidth + 8 / zoom;
  const borderWarningWidth = borderWidth + 8 / zoom;
  const warnColor = warningFlash ? THEME.WARNING_2 : THEME.WARNING_1;
  hasWarnings = false;

  for (let i = 1; i < cps.length; i++) {
    const thisCp = cps[i];
    const prev = cps[i - 1];
    if (thisCp.formtype === 0 || thisCp.formtype === 3) {
      if (getLength(prev.xy, thisCp.xy) < minCpDistance) {
        hasWarnings = true;
        drawStraightOutline(prev.xy, thisCp.xy, warningWidth, warnColor, 2);
        const mid = interpolateLine(prev.xy, thisCp.xy, 0.5);
        drawTriangleScreen(worldToScreenX(mid[0]), worldToScreenY(mid[1]), 10, 0, warnColor);
      }
    } else {
      if (Math.abs(thisCp.radius * thisCp.sweepAngle) < minCpDistance) {
        hasWarnings = true;
        drawCurveOutline(thisCp.center, thisCp.radius, thisCp.startAngle, thisCp.sweepAngle, warningWidth, warnColor, 2);
        const mid = interpolateArc(thisCp.center, thisCp.radius, thisCp.startAngle, thisCp.sweepAngle, 0.5);
        drawTriangleScreen(worldToScreenX(mid[0]), worldToScreenY(mid[1]), 10, 0, warnColor);
      }
      if (thisCp.radius < borderWidth / 2) {
        hasWarnings = true;
        drawCurveOutline(thisCp.center, thisCp.radius, thisCp.startAngle, thisCp.sweepAngle, borderWarningWidth, warnColor, 2);
        mainCtx.fillStyle = warnColor;
        mainCtx.beginPath();
        mainCtx.arc(worldToScreenX(thisCp.center[0]), worldToScreenY(thisCp.center[1]), 3, 0, Math.PI * 2);
        mainCtx.fill();
      }
    }
  }
}

function drawFinishLine(cps) {
  const finishlineWidth = S.roadWidth * zoom + 10;
  const startdistance = getStartlineDistance(S);
  const finishdistance = getFinishlineDistance(S);
  for (const d of [startdistance, finishdistance]) {
    if (d > 0 && d < trackLengthState.total) {
      const pos = distanceToCoords(cps, d);
      const angle = pos[2] + Math.PI / 2;
      drawDistanceMark(worldToScreenX(pos[0]), worldToScreenY(pos[1]), angle, finishlineWidth, 3, THEME.WHITE, 'both', 0);
    }
  }
}

function drawDirectionArrow(cps, arrowDistance) {
  const distance = getStartlineDistance(S);
  if (distance > trackLengthState.total) return;
  const pos = distanceToCoords(cps, distance);
  const arrowLength = 90;
  const os1 = [arrowLength / 2 * Math.cos(pos[2]), arrowLength / 2 * -Math.sin(pos[2])];
  const os2 = [Math.sin(pos[2]) * arrowDistance, Math.cos(pos[2]) * arrowDistance];
  const start = [-os1[0] + os2[0], -os1[1] + os2[1]];
  const end = [os1[0] + os2[0], os1[1] + os2[1]];

  const x1 = worldToScreenX(pos[0]) + start[0];
  const y1 = worldToScreenY(pos[1]) + start[1];
  const x2 = worldToScreenX(pos[0]) + end[0];
  const y2 = worldToScreenY(pos[1]) + end[1];
  mainCtx.strokeStyle = THEME.ARROW_COLOR;
  mainCtx.lineWidth = 2;
  mainCtx.beginPath();
  mainCtx.moveTo(x1, y1);
  mainCtx.lineTo(x2, y2);
  mainCtx.stroke();
  // arrow head
  const ang = Math.atan2(y2 - y1, x2 - x1);
  mainCtx.beginPath();
  mainCtx.moveTo(x2, y2);
  mainCtx.lineTo(x2 - 10 * Math.cos(ang - 0.4), y2 - 10 * Math.sin(ang - 0.4));
  mainCtx.lineTo(x2 - 10 * Math.cos(ang + 0.4), y2 - 10 * Math.sin(ang + 0.4));
  mainCtx.closePath();
  mainCtx.fillStyle = THEME.ARROW_COLOR;
  mainCtx.fill();
}

function drawDistanceMark(x, y, angle, size, width, fill, side, offset) {
  const startOffset = [offset * Math.cos(-angle), offset * Math.sin(-angle)];
  const endOffset = [size / 2 * Math.cos(-angle), size / 2 * Math.sin(-angle)];
  let start = [x - endOffset[0], y - endOffset[1]];
  let end = [x + endOffset[0], y + endOffset[1]];
  if (side === 'left') end = [x - startOffset[0], y - startOffset[1]];
  else if (side === 'right') start = [x + startOffset[0], y + startOffset[1]];
  mainCtx.strokeStyle = fill;
  mainCtx.lineWidth = width;
  mainCtx.beginPath();
  mainCtx.moveTo(start[0], start[1]);
  mainCtx.lineTo(end[0], end[1]);
  mainCtx.stroke();
}

function drawTriangleScreen(x, y, radius, angle, fill) {
  const a = [x + radius * Math.cos(Math.PI / 2 + angle), y + radius * -Math.sin(Math.PI / 2 + angle)];
  const b = [x + radius * Math.cos(radians(210) + angle), y + radius * -Math.sin(radians(210) + angle)];
  const c = [x + radius * Math.cos(radians(330) + angle), y + radius * -Math.sin(radians(330) + angle)];
  mainCtx.fillStyle = fill;
  mainCtx.beginPath();
  mainCtx.moveTo(a[0], a[1]); mainCtx.lineTo(b[0], b[1]); mainCtx.lineTo(c[0], c[1]);
  mainCtx.closePath();
  mainCtx.fill();
}

function drawCurveOutline(center, radius, startAngle, sweepAngle, width, colour, lineWidth) {
  // NOTE: width is in world metres (as the original) — converted to screen here
  const r0 = (radius - width / 2) * zoom;
  const r1 = (radius + width / 2) * zoom;
  let radii;
  if (width === 0) radii = [radius * zoom];
  else if (r0 < 0) radii = [r1];
  else radii = [r0, r1];

  const cx = worldToScreenX(center[0]);
  const cy = worldToScreenY(center[1]);
  mainCtx.strokeStyle = colour;
  mainCtx.lineWidth = lineWidth || 1;

  for (const r of radii) {
    if (Math.abs(sweepAngle) > radians(2) && radius * zoom * Math.abs(sweepAngle) > 5) {
      // canvas arc angles run clockwise in screen space; original uses
      // start=degrees(startAngle), extent=degrees(sweepAngle) with y flipped
      mainCtx.beginPath();
      mainCtx.arc(cx, cy, r, -startAngle, -(startAngle + sweepAngle), sweepAngle > 0);
      mainCtx.stroke();
    } else {
      const p0 = interpolateArc(center, radius, startAngle, sweepAngle, 0);
      const p1 = interpolateArc(center, radius, startAngle, sweepAngle, 1);
      mainCtx.beginPath();
      mainCtx.moveTo(worldToScreenX(p0[0]), worldToScreenY(p0[1]));
      mainCtx.lineTo(worldToScreenX(p1[0]), worldToScreenY(p1[1]));
      mainCtx.stroke();
    }
  }
}

function drawStraightOutline(start, end, width, colour, lineWidth) {
  const angle = getAngle(start, end);
  const xOffset = Math.sin(angle) * width / 2;
  const yOffset = Math.cos(angle) * width / 2;
  const counter = (width === 0) ? [1] : [-1, 1];
  mainCtx.strokeStyle = colour;
  mainCtx.lineWidth = lineWidth || 1;
  for (const n of counter) {
    const x0 = start[0] + xOffset * n, y0 = start[1] + yOffset * n;
    const x1 = end[0] + xOffset * n, y1 = end[1] + yOffset * n;
    mainCtx.beginPath();
    mainCtx.moveTo(worldToScreenX(x0), worldToScreenY(y0));
    mainCtx.lineTo(worldToScreenX(x1), worldToScreenY(y1));
    mainCtx.stroke();
  }
}

function drawDistanceLabels(curves) {
  const rect = mainCanvas.getBoundingClientRect();
  const vx0 = canvasX(0) / zoom - 50;
  const vy0 = canvasY(0) / zoom - 50;
  const vx1 = canvasX(rect.width) / zoom + 50;
  const vy1 = canvasY(rect.height) / zoom + 50;

  const labelDistance = 0.5 * S.roadWidth * zoom + labelOffset;
  const labelFont = S.labelFontSize + 'px "Segoe UI"';
  mainCtx.font = labelFont;
  mainCtx.fillStyle = THEME.LABELTEXT;
  mainCtx.textAlign = 'center';

  let runningDistance = 0;
  const isPoint2Point = S.circuit ? 0 : 1;
  for (let i = 0; i < curves.length + isPoint2Point; i++) {
    let a, b;
    try {
      const curve = curves[i];
      a = curves[i - 1].end; b = curve.start;
    } catch (e) {
      try { a = curves[i - 1].end; } catch (e2) { a = polygon[0].xy; }
      b = polygon[polygon.length - 1].xy;
    }
    if (!S.circuit && i === 0) a = polygon[0].xy;

    if (getLength(a, b) > 0.001) {
      runningDistance += getLength(a, b);
      let text, factor;
      if (S.tracklengthLabelsMode === 'Length') {
        text = getLength(a, b).toFixed(1) + 'm'; factor = 0.5;
      } else {
        text = runningDistance.toFixed(1) + 'm'; factor = 1;
      }
      const anchorPoint = interpolateLine(a, b, factor);
      const textVector = getAngle(a, b) + Math.PI / 2;
      const offset = [Math.cos(textVector) * labelDistance, Math.sin(textVector) * -labelDistance];
      if (vx0 < anchorPoint[0] && anchorPoint[0] < vx1 && vy0 < anchorPoint[1] && anchorPoint[1] < vy1) {
        mainCtx.fillText(text, worldToScreenX(anchorPoint[0]) + offset[0], worldToScreenY(anchorPoint[1]) + offset[1]);
      }
    }
    if (i === curves.length) break;

    const curve = curves[i];
    runningDistance += curve.length;
    let text, anchorPoint, textVector;
    if (S.tracklengthLabelsMode === 'Length') {
      text = curve.length.toFixed(1) + 'm';
      anchorPoint = curve.curves[Math.floor(curve.curves.length / 2)][2];
      textVector = getAngle(curve.start, curve.end) + Math.PI / 2 * curve.turnDirection;
    } else {
      text = runningDistance.toFixed(1) + 'm';
      anchorPoint = curve.end;
      textVector = getAngle(curve.angularPoint, curve.end) + Math.PI / 2 * curve.turnDirection;
    }
    const offset = [Math.cos(textVector) * labelDistance, Math.sin(textVector) * -labelDistance];
    if (vx0 < anchorPoint[0] && anchorPoint[0] < vx1 && vy0 < anchorPoint[1] && anchorPoint[1] < vy1) {
      mainCtx.fillText(text, worldToScreenX(anchorPoint[0]) + offset[0], worldToScreenY(anchorPoint[1]) + offset[1]);
    }
  }
}

function drawMeasure() {
  if (trackLengthState.total <= 0) return;
  const range = [0, trackLengthState.total];
  const sub = subdivideDistance(0, 1000, 100 * zoom, undefined, range);
  const rulerList = sub.points.slice();
  rulerList.unshift(0);
  const step = sub.step || 1;
  const factor = sub.factor;
  const base = (factor === 2.5) ? 4 : 5;

  const borderWidth = getBorderWidth(S);
  const labelFont = S.labelFontSize + 'px "Segoe UI"';
  mainCtx.font = labelFont;
  mainCtx.fillStyle = THEME.LABELTEXT;

  for (const distance of rulerList) {
    const pos = distanceToCoords(CPS, distance);
    let size;
    if (mod(distance / (base * 2), step) === 0) size = 2;
    else if (mod(distance / base, step) === 0) size = 1;
    else size = 0;
    const markLength = borderWidth * zoom + (10 + size * 10) * (1 + zoom) / 2;
    const angle = pos[2] + Math.PI / 2;
    drawDistanceMark(worldToScreenX(pos[0]), worldToScreenY(pos[1]), angle, markLength,
      1, THEME.WHITE, 'left', borderWidth / 2 * zoom);
    if (size === 2) {
      drawDistanceLabel(worldToScreenX(pos[0]), worldToScreenY(pos[1]), angle, markLength + 10,
        distance.toFixed(0) + ' m', THEME.WHITE, 'left');
    }
  }
}

function drawDistanceLabel(x, y, angle, offset, text, fill, side) {
  const off = [offset / 2 * Math.cos(-angle), offset / 2 * Math.sin(-angle)];
  let pos;
  if (side === 'left') pos = [x - off[0], y - off[1]];
  else pos = [x + off[0], y + off[1]];
  let textAngle = angle + Math.PI / 2;
  textAngle = mod(textAngle, 2 * Math.PI);
  if (textAngle > Math.PI) textAngle -= 2 * Math.PI;
  if (Math.abs(textAngle) > Math.PI / 2) textAngle -= Math.PI;

  mainCtx.save();
  mainCtx.translate(pos[0], pos[1]);
  mainCtx.rotate(textAngle);
  mainCtx.fillStyle = fill;
  mainCtx.textAlign = 'center';
  mainCtx.fillText(text, 0, 0);
  mainCtx.restore();
}

function drawCornerCountLabels(curves, borderWidth, cornerCountSize) {
  const labelDistance = borderWidth / 2 * zoom + cornerCountSize + 3;
  curves.forEach((curve, index) => {
    const anchorPoint = curve.curves[Math.floor(curve.curves.length / 2)][2];
    const labelVector = getAngle(curve.start, curve.end) + Math.PI / 2 * curve.turnDirection;
    const offset = [Math.cos(labelVector) * labelDistance, -Math.sin(labelVector) * labelDistance];
    const x = worldToScreenX(anchorPoint[0]) + offset[0];
    const y = worldToScreenY(anchorPoint[1]) + offset[1];
    mainCtx.fillStyle = THEME.ACCENT;
    mainCtx.beginPath();
    mainCtx.arc(x, y, cornerCountSize, 0, Math.PI * 2);
    mainCtx.fill();
    mainCtx.fillStyle = THEME.WHITE;
    mainCtx.font = 'bold ' + (S.labelFontSize * 9 / 7).toFixed(0) + 'px Arial';
    mainCtx.textAlign = 'center';
    mainCtx.textBaseline = 'middle';
    mainCtx.fillText(String(index + 1), x, y);
    mainCtx.textBaseline = 'alphabetic';
  });
}

function drawEndpoints(curve) {
  const pS = 1.5;
  mainCtx.strokeStyle = THEME.WHITE;
  mainCtx.lineWidth = 1;
  for (const p of [curve.start, curve.end]) {
    mainCtx.beginPath();
    mainCtx.arc(worldToScreenX(p[0]), worldToScreenY(p[1]), pS, 0, Math.PI * 2);
    mainCtx.stroke();
  }
}

function drawPitVisuals() {
  const uuids = ROAD_TYPES[S.sceneryindex] || ROAD_TYPES_DATA.eifel;
  let startRoads;
  if (S.shortStraight) {
    startRoads = [uuids.startsprint[uuids.startlineP2P[0]]];
  } else if (S.circuit) {
    startRoads = uuids.start;
  } else {
    startRoads = uuids.startsprint;
  }
  const pitLen = startRoads.reduce((s, r) => s + r[1], 0);
  const pitStart = S.pitOffset;
  const totalLen = trackLengthState.total;
  const pitColor = 'rgb(' + THEME.H_MAGENTA.join(',') + ')';

  if (totalLen > 0) {
    const pS = mod(pitStart, totalLen);
    const pE = pitStart + pitLen;
    const THICKNESS = 14;

    if (pE > totalLen) {
      drawTrackSection(pS, totalLen, pitColor, THICKNESS);
      drawTrackSection(0, mod(pE, totalLen), pitColor, THICKNESS);
    } else {
      drawTrackSection(pS, pE, pitColor, THICKNESS);
    }

    const pos = distanceToCoords(CPS, pS);
    const sx = worldToScreenX(pos[0]), sy = worldToScreenY(pos[1]);
    mainCtx.fillStyle = 'white';
    mainCtx.strokeStyle = 'black';
    mainCtx.lineWidth = 2;
    mainCtx.beginPath();
    mainCtx.arc(sx, sy, 8, 0, Math.PI * 2);
    mainCtx.fill();
    mainCtx.stroke();
    mainCtx.fillStyle = 'white';
    mainCtx.font = 'bold 9px Arial';
    mainCtx.textAlign = 'center';
    mainCtx.fillText(tr('PIT START'), sx, sy - 23);
  }
}

function drawTrackSection(startDist, endDist, color, width) {
  const step = 5;
  const points = [];
  let curr = startDist;
  while (curr <= endDist) {
    const xy = distanceToCoords(CPS, curr);
    points.push([xy[0], xy[1]]);
    curr += step;
  }
  const xy = distanceToCoords(CPS, endDist);
  points.push([xy[0], xy[1]]);

  if (points.length >= 2) {
    mainCtx.strokeStyle = color;
    mainCtx.lineWidth = width;
    mainCtx.lineCap = 'round';
    mainCtx.beginPath();
    mainCtx.moveTo(worldToScreenX(points[0][0]), worldToScreenY(points[0][1]));
    for (let i = 1; i < points.length; i++) {
      mainCtx.lineTo(worldToScreenX(points[i][0]), worldToScreenY(points[i][1]));
    }
    mainCtx.stroke();
    mainCtx.lineCap = 'butt';
  }
}

/* ------------------------------------------------------------------ */
/* Cursors                                                            */
/* ------------------------------------------------------------------ */
function drawCursor() {
  if (!CPS.length) return;
  const triangleRadius = Math.max(6, 5 / zoom);
  const distanceFromCenterline = S.roadWidth / 2 + triangleRadius + 1 / zoom;
  for (const distance of navCursors) {
    const [x, y, angle] = distanceToCoords(CPS, distance);
    const xOffset = distanceFromCenterline * Math.cos(angle + Math.PI / 2);
    const yOffset = distanceFromCenterline * -Math.sin(angle + Math.PI / 2);
    const p0 = [x - xOffset, y - yOffset];
    const p1 = [x + xOffset, y + yOffset];
    [p0, p1].forEach((p, i) => {
      drawTriangleScreen(worldToScreenX(p[0]), worldToScreenY(p[1]), triangleRadius * zoom, angle + Math.PI * i, THEME.NAV_CURSOR);
    });
  }
  scheduleCursorHide();
}

function scheduleCursorHide() {
  if (indicatorTimer) clearTimeout(indicatorTimer);
  indicatorTimer = setTimeout(() => {
    // redraw without cursors — handled by expiry flag
    navCursors = navCursors.map(d => d); // keep values
    cursorVisible = false;
    requestRedraw(['track', 'nav']);
  }, 2500);
  cursorVisible = true;
}
let cursorVisible = true;

function drawNavCursor() {
  const dpr = DPR();
  const rect = navCanvas.getBoundingClientRect();
  navCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!CPS.length || !cursorVisible) return;
  const triangleRadius = 4;
  const x0 = navCanvasXMarginLeft;
  const x1 = rect.width - navCanvasXMarginRight;
  const xRange = x1 - x0;

  for (const distance of navCursors) {
    if (trackLengthState.total > 0) {
      const x = x0 + (distance / trackLengthState.total) * xRange;
      for (const i of [0, 1]) {
        const y = i === 0 ? rect.height - (triangleRadius + 2) : triangleRadius + 2;
        drawNavTriangle(x, y, triangleRadius, Math.PI * i, THEME.NAV_CURSOR);
      }
    }
  }
}

function drawNavTriangle(x, y, radius, angle, fill) {
  const a = [x + radius * Math.cos(Math.PI / 2 + angle), y + radius * -Math.sin(Math.PI / 2 + angle)];
  const b = [x + radius * Math.cos(radians(210) + angle), y + radius * -Math.sin(radians(210) + angle)];
  const c = [x + radius * Math.cos(radians(330) + angle), y + radius * -Math.sin(radians(330) + angle)];
  navCtx.fillStyle = fill;
  navCtx.beginPath();
  navCtx.moveTo(a[0], a[1]); navCtx.lineTo(b[0], b[1]); navCtx.lineTo(c[0], c[1]);
  navCtx.closePath();
  navCtx.fill();
}
