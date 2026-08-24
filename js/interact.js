/* =========================================================================
 * Track Layout Creator + — Web Port
 * interact.js — elevation graph (nav canvas) + mouse/keyboard interactions
 *              (web port of the MIT-licensed TLC+ desktop app)
 *
 * Original tool: Copyright (c) 2017 eran0004, (c) 2026 daydrive7 (MIT)
 * ========================================================================= */
'use strict';

const navCanvasXMarginLeft = 2;
const navCanvasXMarginRight = 35;
const navCanvasYMargin = 15;
let navTerrainCache = null;

/* ------------------------------------------------------------------ */
/* Elevation graph                                                    */
/* ------------------------------------------------------------------ */
function drawNavCanvas() {
  const dpr = DPR();
  const rect = navCanvas.getBoundingClientRect();
  navCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  navCtx.clearRect(0, 0, rect.width, rect.height);

  const borderWidth = getBorderWidth(S);
  const canvasWidth = rect.width;
  const canvasHeight = rect.height;

  if (trackLengthState.total <= 0) { drawNavCursor(); return; }
  if (polygon.length < 2 + (S.circuit ? 1 : 0)) { drawNavCursor(); return; }
  if (!S.heightMap) return;

  const smoothGraph = S.manualHeightEase;
  let divNum = Math.floor(canvasWidth / (smoothGraph ? 2 : 10));
  if (divNum < 1) divNum = 1;
  const vlen = trackLengthState.total / divNum;
  const distances = [];
  for (let i = 0; i <= divNum; i++) distances.push(vlen * i);

  let zData, terrain;
  try {
    const zNodes = getManualZNodes(CPS);
    const inFac = S.manualHeightIn;
    const outFac = S.manualHeightOut;
    const isManual = S.manualHeight;

    const geoKey = [S.sceneryindex, borderWidth, divNum, trackLengthState.total.toFixed(3),
      CPS.map(cp => cp.x.toFixed(3) + ',' + cp.y.toFixed(3) + ',' + cp.formtype).join(';')].join('|');
    if (navTerrainCache && navTerrainCache[0] === geoKey) {
      terrain = navTerrainCache[1];
    } else {
      terrain = distances.map(d => getHeight(CPS, d, borderWidth, S.heightMap, true));
      navTerrainCache = [geoKey, terrain];
    }

    zData = [];
    for (let i = 0; i < distances.length; i++) {
      const zMap = terrain[i];
      if (isManual) zData.push(zMap + calculateManualZ(distances[i], zNodes, inFac, outFac, smoothGraph));
      else zData.push(zMap);
    }

    if (smoothGraph && zData.length > 4) {
      const smoothedZ = [];
      const window = 4;
      for (let i = 0; i < zData.length; i++) {
        const start = Math.max(0, i - window);
        const end = Math.min(zData.length, i + window + 1);
        let sum = 0;
        for (let k = start; k < end; k++) sum += zData[k];
        smoothedZ.push(sum / (end - start));
      }
      zData = smoothedZ;
    }
  } catch (e) { return; }

  const slopeData = [];
  for (let i = 0; i < zData.length - 1; i++) {
    const d = distances[i], nextZ = zData[i + 1], nextD = distances[i + 1];
    const deltaZ = nextZ - zData[i];
    const deltaD = nextD - d;
    slopeData.push(deltaD === 0 ? 0 : deltaZ / deltaD);
  }
  if (S.circuit) slopeData.push(slopeData.length ? slopeData[0] : 0);
  else slopeData.push(slopeData.length ? slopeData[slopeData.length - 1] : 0);

  let zMax = zData.length ? Math.max(...zData) : 0;
  let zMin = zData.length ? Math.min(...zData) : 0;
  let zRange = zMax - zMin;
  const minRange = 10;
  if (zRange < minRange) {
    const avg = (zMax + zMin) / 2;
    zMin = avg - minRange / 2;
    zMax = avg + minRange / 2;
    zRange = minRange;
  }

  const yMargin = navCanvasYMargin;
  const y1 = yMargin;
  const y0 = canvasHeight - yMargin;
  const x0 = navCanvasXMarginLeft;
  const x1 = canvasWidth - navCanvasXMarginRight;
  const xRange = x1 - x0;

  const maxDist = distances.length ? distances[distances.length - 1] : 1;
  const xData = distances.map(d => x0 + (d / maxDist) * xRange);
  const yData = zData.map(z => y0 + (y1 - y0) * (z - zMin) / zRange);

  const slopeLimit = 0.3;
  const slopeYData = slopeData.map(slope => y0 + (y1 - y0) * ((slope + slopeLimit) / (2 * slopeLimit)));

  // ---- grid ----
  navCtx.font = '8px "Segoe UI"';
  navCtx.fillStyle = THEME.NAV_LINE;
  navCtx.textAlign = 'left';
  navCtx.fillText(tr('Elevation'), x0 + 8, y1 + 4);
  navCtx.fillStyle = THEME.NAV_SLOPE;
  navCtx.textAlign = 'right';
  navCtx.fillText(tr('Slope'), x1, y1 + 4);

  for (let i = 0; i < 5; i++) {
    const slope = [-0.3, -0.15, 0, 0.15, 0.3][i];
    const y = y0 + (y1 - y0) * ((slope + slopeLimit) / (2 * slopeLimit));
    navCtx.strokeStyle = THEME.NAV_GRID;
    navCtx.setLineDash(i % 2 === 1 ? [2, 2] : []);
    navCtx.beginPath();
    navCtx.moveTo(x0, y); navCtx.lineTo(x1, y);
    navCtx.stroke();
    navCtx.setLineDash([]);
    navCtx.fillStyle = THEME.NAV_SLOPE;
    navCtx.font = 'bold 8px "Segoe UI"';
    navCtx.textAlign = 'left';
    navCtx.fillText((slope * 100).toFixed(0) + '%', x1 + 3, y + 3);
    navCtx.font = '8px "Segoe UI"';
  }

  // x grid
  if (xRange > 0) {
    const div = Math.floor(xRange / 100) || 1;
    const dMax = distances[distances.length - 1];
    const sub = subdivideDistance(0, dMax, div);
    sub.points.forEach((d, idx) => {
      if (dMax === 0) return;
      const x = x0 + xRange * (d / dMax);
      const factor = sub.factor || 1;
      let dash = [2, 2];
      if ((idx + 1) % (10 / factor) === 0) {
        dash = [];
        navCtx.fillStyle = THEME.NAV_GRID;
        navCtx.textAlign = 'center';
        navCtx.fillText(d.toFixed(0) + 'm', x, y0 - 4);
      }
      navCtx.strokeStyle = THEME.NAV_GRID;
      navCtx.setLineDash(dash);
      navCtx.beginPath();
      navCtx.moveTo(x, y0); navCtx.lineTo(x, y1);
      navCtx.stroke();
      navCtx.setLineDash([]);
    });
  }

  // ---- lines ----
  function drawPolyline(xs, ys, color) {
    navCtx.strokeStyle = color;
    navCtx.lineWidth = 1;
    navCtx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      if (i === 0) navCtx.moveTo(xs[i], ys[i]); else navCtx.lineTo(xs[i], ys[i]);
    }
    navCtx.stroke();
  }
  if (xData.length > 3) drawPolyline(xData, slopeYData, THEME.NAV_SLOPE);
  if (xData.length > 3) drawPolyline(xData, yData, THEME.NAV_LINE);

  // ---- ruler ----
  const dpr2 = DPR();
  const nrr = navRuler.getBoundingClientRect();
  navRulerCtx.setTransform(dpr2, 0, 0, dpr2, 0, 0);
  navRulerCtx.clearRect(0, 0, nrr.width, nrr.height);
  // ---- ruler: zMax at the TOP edge, zMin at the BOTTOM edge (as the original:
  //      drawNavCanvasRuler puts z_max at y_max and z_min at y_min) ----
  const labelAt = (y, text) => {
    navRulerCtx.save();
    navRulerCtx.translate(12, y);
    navRulerCtx.rotate(-Math.PI / 2);
    navRulerCtx.fillStyle = THEME.NAV_LINE;
    navRulerCtx.font = 'bold 8px "Segoe UI"';
    navRulerCtx.textAlign = 'center';
    navRulerCtx.fillText(text, 0, 0);
    navRulerCtx.restore();
  };
  labelAt(y1, zMax.toFixed(0) + 'm');
  labelAt(y0, zMin.toFixed(0) + 'm');

  drawNavCursor();
}

function navLeftClick(e) {
  if (trackLengthState.total > 0) {
    const rect = navCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const x0 = navCanvasXMarginLeft;
    const x1 = rect.width - navCanvasXMarginRight;
    const xRange = x1 - x0;

    let distance = (mx - x0) / xRange * trackLengthState.total;
    distance = Math.max(0, Math.min(distance, trackLengthState.total));
    if (!navCursors.length) navCursors.push(distance);
    else navCursors[0] = distance;
    cursorVisible = true;
    navCanvasChange();
    trackChange();
    if (CPS.length) {
      const pos = distanceToCoords(CPS, distance);
      centerOnCoord([pos[0], pos[1]]);
    }
    scheduleCursorHide();
  }
}

function navRightClick() {
  navCursors = [];
  navCanvasChange();
  trackChange();
}

/* ------------------------------------------------------------------ */
/* Mouse interaction on the main canvas                               */
/* ------------------------------------------------------------------ */
function getPointIndex(mx, my) {
  const cx = canvasX(mx), cy = canvasY(my);
  const indexes = [];
  for (let i = 0; i < polygon.length; i++) {
    const item = polygon[i];
    const dx = item.x * zoom - cx;
    const dy = item.y * zoom - cy;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 10) indexes.push({ index: i, distance: d });
    }
  }
  if (indexes.length) {
    indexes.sort((a, b) => a.distance - b.distance);
    return indexes[0].index;
  }
  return null;
}

/* Find an Euler handle near the click (returns point index) */
function getHandleIndex(mx, my) {
  const cx = canvasX(mx), cy = canvasY(my);
  for (let i = 0; i < polygon.length; i++) {
    if (!selectedPoints.includes(i)) continue;
    const point = polygon[i];
    const prevPoint = polygon[(i - 1 + polygon.length) % polygon.length];
    const nextPoint = polygon[(i + 1) % polygon.length];
    const sweepAngle = getSweepAngleFromPoints(prevPoint.xy, point.xy, nextPoint.xy);
    const startAngle = getAngle(prevPoint.xy, point.xy);
    let handleAngle = startAngle + sweepAngle / 2;
    if (sweepAngle < 0) handleAngle += Math.PI;
    const handleDistance = (20 + point.segments * 10) / zoom;
    const offset = [Math.cos(handleAngle) * handleDistance, -Math.sin(handleAngle) * handleDistance];
    for (const s of [-1, 1]) {
      const hx = (point.x + offset[0] * s) * zoom;
      const hy = (point.y + offset[1] * s) * zoom;
      if (Math.abs(hx - cx) < 8 && Math.abs(hy - cy) < 8) return i;
    }
  }
  return null;
}

/* Find a polygon line near the click (for splitting in pen mode).
 * In circuit mode the dashed closing line (last -> first point) is hit too. */
function getLineHit(mx, my) {
  const cx = canvasX(mx), cy = canvasY(my);
  function segDist(p0, p1) {
    const vx = p1.x * zoom - p0.x * zoom;
    const vy = p1.y * zoom - p0.y * zoom;
    const wx = cx - p0.x * zoom;
    const wy = cy - p0.y * zoom;
    const lenSq = vx * vx + vy * vy;
    let t = 0;
    if (lenSq > 0) t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
    const px = p0.x * zoom + vx * t;
    const py = p0.y * zoom + vy * t;
    return Math.hypot(cx - px, cy - py);
  }
  for (let i = 0; i < polygon.length; i++) {
    const prevIdx = i - 1;
    if (prevIdx < 0) continue;  // closing line handled separately below
    const p0 = polygon[prevIdx], p1 = polygon[i];
    if (segDist(p0, p1) < 6) return { p0: p0, p1: p1, index: i, closing: false };
  }
  // closing line (circuit only): the original appends the new point at the end
  if (S.circuit && polygon.length > 1) {
    const p0 = polygon[polygon.length - 1], p1 = polygon[0];
    if (segDist(p0, p1) < 6) return { p0: p0, p1: p1, index: 0, closing: true };
  }
  return null;
}

function leftClick(mx, my, shift, ctrl) {
  void ctrl;
  saveToHistory();
  mouseLocation = { x: mx, y: my };

  const handleIdx = getHandleIndex(mx, my);
  const pointIndex = getPointIndex(mx, my);

  if (['selection', 'pen', 'camber'].includes(toolMode) && pointIndex !== null) {
    if (selectedPoints.length < 2 || !selectedPoints.includes(pointIndex)) {
      selectedPoints = [pointIndex];
      polygonChange();
    }
  } else if (['selection', 'pen', 'camber'].includes(toolMode) && handleIdx !== null) {
    // Only reached when the click is NOT on a node — at high zoom the Euler
    // handle can fall inside the node's hit radius, and grabbing the node
    // must win or drags feel erratic (segment counts changing by accident).
    segmentChange = true;
    segmentTargetPointIndex = handleIdx;
  } else if (['selection', 'pen', 'camber'].includes(toolMode) && selectedPoints.length > 0) {
    selectedPoints = [];
    polygonChange();
  } else if (toolMode === 'pen') {
    const hit = getLineHit(mx, my);
    if (hit) {
      if (hit.closing) splitClosingLine(hit, mx, my);
      else splitLine(hit, mx, my);
    } else {
      let x = canvasX(mx) / zoom;
      let y = canvasY(my) / zoom;
      if (S.snap) {
        x = snapToGrid(x, gridsize);
        y = snapToGrid(y, gridsize);
      }
      const point = makeCoordinate(x, y, defaultHeight, 90, -1, 0);
      polygon.push(point);
    }
    selectedPoints = [];
    polygonChange();
    trackChange();
  } else if (toolMode === 'pan') {
    // handled by drag
  }
}

function shiftLeftClick(mx, my) {
  saveToHistory();
  const pointIndex = getPointIndex(mx, my);
  if (pointIndex !== null) {
    if (toolMode === 'pen') {
      selectedPoints = [pointIndex];
      deletePoints();
    } else if (['selection', 'camber'].includes(toolMode)) {
      if (!selectedPoints.includes(pointIndex)) selectedPoints.push(pointIndex);
      else selectedPoints = selectedPoints.filter(p => p !== pointIndex);
      polygonChange();
    }
  }
}

function b1Motion(mx, my) {
  interacting = true;

  if (segmentChange) {
    // drag on euler handle: change segment count
    const point = polygon[segmentTargetPointIndex];
    const referencePoint = [point.x * zoom + panX, point.y * zoom + panY];
    const sensitivity = 10;
    const distance = getLength(referencePoint, [mx, my]);
    const value = Math.floor((distance - 10) / sensitivity);
    segmentChangePoints(value, segmentTargetPointIndex);
  } else if (toolMode === 'scale' && selectedPoints.length > 1) {
    const sensitivity = 500;
    const dy = my - mouseLocation.y;
    const scaleFactor = (sensitivity - dy) / sensitivity;
    scalePoints(scaleFactor);
  } else if (toolMode === 'rotate' && selectedPoints.length > 1) {
    b1Rotating(mx, my);
  } else if (['selection', 'pen'].includes(toolMode)) {
    const dx = mx - mouseLocation.x;
    const dy = my - mouseLocation.y;
    for (const point of selectedPoints) {
      polygon[point].x += dx / zoom;
      polygon[point].y += dy / zoom;
    }
  } else if (toolMode === 'pan') {
    panView(mx, my);
  } else if (toolMode === 'camber') {
    changeCamber(my);
  }

  mouseLocation = { x: mx, y: my };
  if (selectedPoints.length) {
    polygonChange();
    trackChange();
  }
  if (!S.optimizeInteraction) navCanvasChange();
}

function b1Rotating(mx, my) {
  const center = selectionCenter;
  if (!center) return;
  const dx1 = center[0] - canvasX(mx) / zoom;
  const dy1 = center[1] - canvasY(my) / zoom;
  const dx2 = center[0] - canvasX(mouseLocation.x) / zoom;
  const dy2 = center[1] - canvasY(mouseLocation.y) / zoom;
  const rotateAngle = Math.atan2(dy1, dx1) - Math.atan2(dy2, dx2);

  for (const item of selectedPoints) {
    const point = polygon[item];
    const radius = getLength([point.x, point.y], center);
    const angle = Math.atan2(point.y - center[1], point.x - center[0]);
    const newAngle = angle + rotateAngle;
    point.x = Math.cos(newAngle) * radius + center[0];
    point.y = Math.sin(newAngle) * radius + center[1];
  }
}

function b1Release() {
  interacting = false;
  if (toolMode === 'pan') canvasChange();
  else if (segmentChange) {
    segmentChange = false;
    segmentTargetPointIndex = null;
  }
  if (['selection', 'pen', 'pan', 'scale', 'rotate'].includes(toolMode)) {
    navCanvasChange();
    displayChange();
  }
}

function rightClick(mx, my) {
  saveToHistory();
  mouseLocation = { x: mx, y: my };
  const pointIndex = getPointIndex(mx, my);
  panMode = false;
  if (pointIndex !== null) {
    if (selectedPoints.length < 2) selectedPoints = [pointIndex];
  } else {
    panMode = true;
  }
}

function b3Motion(mx, my) {
  interacting = true;
  if (!panMode) {
    if (toolMode === 'camber') changeCamber(my);
    else changeRadius(my);
    polygonChange();
    trackChange();
  } else {
    panView(mx, my);
  }
}

function b3Release() {
  interacting = false;
  if (panMode) {
    canvasChange();
    navCanvasChange();
  } else {
    if (selectedPoints.length < 2) {
      selectedPoints = [];
      polygonChange();
    }
    navCanvasChange();
    displayChange();
  }
}

function panView(mx, my) {
  panX += mx - mouseLocation.x;
  panY += my - mouseLocation.y;
  mouseLocation = { x: mx, y: my };
  clampPan();
  displayChange();
}

function changeCamber(my) {
  const dy = mouseLocation.y - my;
  for (const point of selectedPoints) {
    const p = polygon[point];
    if (p.camber === 0 && dy < -0.5) p.camber = -1;
    else if (p.camber === -1) {
      if (dy > 0.5) p.camber = 0;
    } else {
      p.camber += dy * 0.01;
      if (p.camber < 0) p.camber = 0;
      else if (p.camber > 30) p.camber = 30;
      mouseLocation.y = my;
    }
  }
}

function changeRadius(my) {
  const radMin = S.roadWidth * 0.5 + 6;
  const dy = mouseLocation.y - my;
  for (const point of selectedPoints) {
    const p = polygon[point];
    if (p.radius === 0 && dy > 0.5) p.radius = radMin;
    else if (p.radius === radMin && dy < -0.5) p.radius = 0;
    else {
      p.radius += dy / (2 * zoom);
      mouseLocation.y = my;
    }
    if (p.radius > 0 && p.radius < radMin) p.radius = radMin;
  }
}

function segmentChangePoints(value, targetIndex) {
  const targets = (targetIndex !== null && targetIndex !== undefined) ? [targetIndex] : selectedPoints;
  for (const item of targets) {
    if (item < polygon.length) {
      const point = polygon[item];
      point.segments = parseInt(value) || 0;
      if (point.segments < 0) point.segments = 0;
      else if (point.segments > 8) point.segments = 8;
    }
  }
}

function scalePoints(scaleFactor) {
  const center = selectionCenter;
  if (!center) return;
  for (const item of selectedPoints) {
    const point = polygon[item];
    if (axis.x) point.x = center[0] + (point.x - center[0]) * scaleFactor;
    if (axis.y) point.y = center[1] + (point.y - center[1]) * scaleFactor;
    if (axis.x && axis.y && point.radius) point.radius = Math.abs(point.radius * scaleFactor);
  }
}

function deletePoints() {
  saveToHistory();
  polygon = polygon.filter((_, i) => !selectedPoints.includes(i));
  selectedPoints = [];
  polygonChange();
  trackChange();
  navCanvasChange();
}

function splitLine(hit, mx, my) {
  const p0 = [hit.p0.x, hit.p0.y];
  const p1 = [hit.p1.x, hit.p1.y];
  const eventCoords = [canvasX(mx) / zoom, canvasY(my) / zoom];
  const d0 = getLength(p0, eventCoords);
  const d1 = getLength(p1, eventCoords);
  if (d0 + d1 === 0) return;
  const factor = d0 / (d0 + d1);
  const cutLocation = interpolateLine(p0, p1, factor);
  const newPoint = makeCoordinate(cutLocation[0], cutLocation[1], defaultHeight, 90, -1, 0);
  polygon.splice(hit.index, 0, newPoint);
}

/* Split the dashed closing line of a circuit: the new node becomes the LAST
 * polygon point (mirrors the original's index-0 -> append behaviour). */
function splitClosingLine(hit, mx, my) {
  const p0 = [hit.p0.x, hit.p0.y];
  const p1 = [hit.p1.x, hit.p1.y];
  const eventCoords = [canvasX(mx) / zoom, canvasY(my) / zoom];
  const d0 = getLength(p0, eventCoords);
  const d1 = getLength(p1, eventCoords);
  if (d0 + d1 === 0) return;
  const factor = d0 / (d0 + d1);
  const cutLocation = interpolateLine(p0, p1, factor);
  polygon.push(makeCoordinate(cutLocation[0], cutLocation[1], defaultHeight, 90, -1, 0));
}

function movePoint(dx, dy) {
  if (selectedPoints.length > 0) {
    for (const point of selectedPoints) {
      const p = polygon[point];
      if (S.snap) {
        if (dx) p.x = snapToGrid(p.x + gridsize * Math.sign(dx), gridsize);
        if (dy) p.y = snapToGrid(p.y + gridsize * Math.sign(dy), gridsize);
      } else {
        p.x += dx / zoom;
        p.y += dy / zoom;
      }
    }
    polygonChange();
    trackChange();
  }
}

function moveStart(dir) {
  if (dir === -1) polygon.unshift(polygon.pop());
  else polygon.push(polygon.shift());
  polygonChange();
  trackChange();
}

function selectAll() {
  if (selectedPoints.length === polygon.length) selectedPoints = [];
  else selectedPoints = polygon.map((_, i) => i);
  polygonChange();
}

function escapeKey() {
  if (['scale', 'rotate'].includes(toolMode)) {
    setToolMode('selection');
    polygonChange();
  } else if (selectedPoints.length > 0) {
    selectedPoints = [];
    polygonChange();
  }
}

function getSelectionCenter() {
  const points = selectedPoints.length;
  if (points > 1) {
    const cx = selectedPoints.reduce((s, p) => s + polygon[p].x, 0) / points;
    const cy = selectedPoints.reduce((s, p) => s + polygon[p].y, 0) / points;
    selectionCenter = [cx, cy];
  } else {
    selectionCenter = null;
  }
}

function toggleCircuit() {
  S.circuit = !S.circuit;
  syncSidebarControls();
  polygonChange();
  trackChange();
}

function toggleEuler() {
  saveToHistory();
  for (const index of selectedPoints) {
    const point = polygon[index];
    if (point.segments === 0) point.segments = 1;
    else point.segments = 0;
  }
  trackChange();
}

function flipDirection() {
  if (!polygon.length) return;
  saveToHistory();
  polygon.reverse();
  for (let i = 0; i < 2; i++) polygon.unshift(polygon.pop());
  displayChange();
}

/* Toggle an axis constraint ('x'/'y'). Mirroring only happens when armed
 * explicitly via mirrorX()/mirrorY() — a plain key press never mirrors
 * (matches the original's toggleAxis). */
function toggleMirrorAxis(key) {
  if (key === 'x') { axis.x = true; axis.y = 1 - axis.y; }
  else if (key === 'y') { axis.y = true; axis.x = 1 - axis.x; }
  if (mirroring) {
    saveToHistory();
    scalePoints(-1);
    mirroring = false;
    axis.x = axis.y = true;
    polygonChange();
    trackChange();
  }
}

function mirrorX() {
  mirroring = true;
  toggleMirrorAxis('x');
}
function mirrorY() {
  mirroring = true;
  toggleMirrorAxis('y');
}

function randomTranslation() {
  function transform(value) {
    const sign = value / Math.abs(value);
    const n = 25;
    const maxN = Math.min(n, S.heightMap ? S.heightMap.mapSize / 2 - Math.abs(value) : n);
    return (Math.abs(value) + randInt(-n, maxN)) * sign;
  }
  for (const item of selectedPoints) {
    const point = polygon[item];
    point.x = transform(point.x);
    point.y = transform(point.y);
  }
  polygonChange();
  trackChange();
}

/* PDM: temporarily drop heightmap fidelity during scrolling */
function pdmTempFidelity() {
  if (pdmRestoreTimer) clearTimeout(pdmRestoreTimer);
  if (pdmUserFidelity === null) pdmUserFidelity = S.heightMapFidelity;
  const temp = (S.sceneryindex === EIFEL) ? 1 : 2;
  if (S.heightMapFidelity !== temp) S.heightMapFidelity = temp;
}
function pdmRestoreFidelity() {
  pdmRestoreTimer = null;
  if (pdmUserFidelity !== null) {
    if (S.heightMapFidelity !== pdmUserFidelity) {
      S.heightMapFidelity = pdmUserFidelity;
      canvasChange();
    }
    pdmUserFidelity = null;
  }
}
function pdmScheduleRestore() {
  if (pdmRestoreTimer) clearTimeout(pdmRestoreTimer);
  pdmRestoreTimer = setTimeout(pdmRestoreFidelity, 150);
}

function mouseWheelScroll(mx, my, deltaY) {
  // PDM (Performance Draft Mode) toggle now fully controls draft behaviour:
  // ON  -> interaction draft mode + temporary heightmap fidelity drop
  // OFF -> full-detail rendering at all times
  if (S.optimizeInteraction) {
    interacting = true;
    scrolling = true;
    pdmTempFidelity();
  }

  if (deltaY < 0) zoomEvent(mx, my, 'in');
  else zoomEvent(mx, my, 'out');

  if (zoomTimer) clearTimeout(zoomTimer);
  zoomTimer = setTimeout(() => {
    interacting = false;
    scrolling = false;
    displayChange();
  }, 200);
  if (S.optimizeInteraction) pdmScheduleRestore();
}

function setToolMode(mode) {
  toolMode = mode;
  document.querySelectorAll('#toolbar .tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === mode);
  });
  polygonChange();
}

/* ------------------------------------------------------------------ */
/* Event binding                                                      */
/* ------------------------------------------------------------------ */
function bindCanvasEvents() {
  const canvas = mainCanvas;
  let dragging = false;
  let rightDragging = false;

  function localCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const [mx, my] = localCoords(e);
    if (e.button === 0) {
      if (e.shiftKey) { shiftLeftClick(mx, my); return; }
      dragging = true;
      leftClick(mx, my, e.shiftKey, e.ctrlKey);
      if (toolMode === 'pan') mouseLocation = { x: mx, y: my };
    } else if (e.button === 2) {
      rightDragging = true;
      rightClick(mx, my);
    }
    // Pointer capture keeps the drag alive while the cursor travels over
    // the floating toolbar / rulers / sidebar or outside the canvas —
    // otherwise the node would "stick" and jump when re-entering.
    if (canvas.setPointerCapture && e.pointerId !== undefined) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
    }
  });

  // Listen on the WINDOW (not the canvas) so a drag keeps tracking smoothly
  // regardless of which element the cursor momentarily passes over.
  window.addEventListener('mousemove', (e) => {
    if (!dragging && !rightDragging) return;
    const [mx, my] = localCoords(e);
    if (dragging) b1Motion(mx, my);
    else if (rightDragging) b3Motion(mx, my);
  });

  window.addEventListener('mouseup', (e) => {
    if (dragging) { dragging = false; b1Release(); }
    if (rightDragging) { rightDragging = false; b3Release(); }
    if (canvas.releasePointerCapture && e.pointerId !== undefined) {
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ }
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [mx, my] = localCoords(e);
    mouseWheelScroll(mx, my, e.deltaY);
  }, { passive: false });

  canvas.addEventListener('dblclick', (e) => {
    const [mx, my] = localCoords(e);
    const pointIndex = getPointIndex(mx, my);
    if (pointIndex !== null) {
      selectedPoints = [pointIndex];
      polygonChange();
      editPointProperties();
    }
  });

  // Nav canvas
  navCanvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      navLeftClick(e);
    } else if (e.button === 2) {
      navRightClick();
    }
  });
  navCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
  navCanvas.addEventListener('mousemove', (e) => {
    if (e.buttons === 1) navLeftClick(e);
  });
}

function bindKeyboard() {
  window.addEventListener('keydown', (e) => {
    // ignore when typing in inputs
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    // ignore app shortcuts while a modal or the isometric view is open
    if (document.querySelector('.modal-window') || document.querySelector('.iso-overlay')) return;

    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'z': e.preventDefault(); undo(); return;
        case 'y': e.preventDefault(); redo(); return;
        case 's': e.preventDefault(); saveTrackFile(); return;
        case 'o': e.preventDefault(); loadTrackFile(); return;
      }
      return;
    }

    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); if (selectedPoints.length) movePoint(-1, 0); else moveStart(-1); return;
      case 'ArrowRight': e.preventDefault(); if (selectedPoints.length) movePoint(1, 0); else moveStart(1); return;
      case 'ArrowUp': e.preventDefault(); movePoint(0, -1); return;
      case 'ArrowDown': e.preventDefault(); movePoint(0, 1); return;
      case 'Delete': case 'Backspace': e.preventDefault(); if (selectedPoints.length) deletePoints(); return;
      case 'Escape': escapeKey(); return;
      case 'Enter': if (selectedPoints.length) editPointProperties(); return;
      case '+': case '=': zoomIn(); return;
      case '-': case '_': zoomOut(); return;
    }

    switch (e.key.toLowerCase()) {
      case 'a': selectAll(); return;
      case 'c': centerOnTrack(); return;
      case 'e': toggleEuler(); return;
      case 'f': flipDirection(); return;
      case 'r': setToolMode('rotate'); return;
      case 's': setToolMode('scale'); axis.x = axis.y = true; polygonChange(); return;
      case 'x': toggleMirrorAxis('x'); return;
      case 'y': toggleMirrorAxis('y'); return;
    }
  });
}
