/* =========================================================================
 * Track Layout Creator + — Web Port
 * heightmap.js — terrain heightmap loading, sampling and Marching-Squares
 *               contour generation (port of resources/heightmap.py from
 *               the MIT-licensed TLC+ source).
 *
 * Original tool: Copyright (c) 2017 eran0004, (c) 2026 daydrive7 (MIT)
 * ========================================================================= */
'use strict';

/* Standard Marching Squares lookup table (linear interpolation).
 * Edges: 0:Top, 1:Right, 2:Bottom, 3:Left */
const MS_CASE_MAP = {
  0: [], 1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[1, 0]],
  5: [[1, 0], [3, 2]], 6: [[2, 0]], 7: [[3, 0]], 8: [[0, 3]],
  9: [[0, 2]], 10: [[0, 3], [2, 1]], 11: [[0, 1]], 12: [[1, 3]],
  13: [[1, 2]], 14: [[2, 3]], 15: [],
};

let hmInstanceId = 0;

/* Decode an IEEE 754 half-precision float (Uint16 bits) to a JS number */
function halfToFloat(h) {
  const s = (h & 0x8000) >> 15, e = (h & 0x7C00) >> 10, f = h & 0x03FF;
  if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
  if (e === 0x1F) return f ? NaN : (s ? -Infinity : Infinity);
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
}

class HeightMap {
  constructor(columns, rows, z, altz, array, mapSize) {
    this.id = ++hmInstanceId;   // unique per instance — used by the contour cache
    this.columns = columns;
    this.rows = rows;
    this.zmin = z[0]; this.zmax = z[1];
    this.altzmin = altz[0]; this.altzmax = altz[1];
    this.array = array;           // Float32Array rows*columns
    this.mapSize = mapSize;
    this.x_interval = mapSize / (columns - 1);
    this.y_interval = mapSize / (rows - 1);
  }

  fractionToMeters(fraction, alt) {
    const zmin = alt ? this.altzmin : this.zmin;
    const zmax = alt ? this.altzmax : this.zmax;
    return fraction * (zmax - zmin) + zmin;
  }

  coordToFraction(x, y, output, alt) {
    const ms = this.mapSize, cols = this.columns, rows = this.rows;
    const xi = this.x_interval, yi = this.y_interval;

    x += ms * 0.5; y += ms * 0.5;
    if (x < 0) x = 0; else if (x > ms) x = ms;
    if (y < 0) y = 0; else if (y > ms) y = ms;

    let col = Math.floor(x / xi), row = Math.floor(y / yi);
    if (col >= cols - 1) col = cols - 2;
    if (row >= rows - 1) row = rows - 2;
    if (col < 0) col = 0;
    if (row < 0) row = 0;

    const xl = (x - col * xi) / xi;
    const yl = (y - row * yi) / yi;

    const arr = this.array;
    const az = arr[row * cols + col];
    const bz = arr[row * cols + col + 1];
    const cz = arr[(row + 1) * cols + col];
    const dz = arr[(row + 1) * cols + col + 1];

    const top = az + (bz - az) * xl;
    const bottom = cz + (dz - cz) * xl;
    let val = top + (bottom - top) * yl;

    if (output === 'm') val = this.fractionToMeters(val, alt);
    return val;
  }
}

/* Maps scenery index -> {file, mapSize} (matches heightmap.py _MAPS) */
const HM_MAPS = {
  1: { file: 'death_valley', mapSize: 6000 },
  2: { file: 'eifel', mapSize: 12000 },
  3: { file: 'andalusia', mapSize: 7000 },
  5: { file: 'eifel_flat', mapSize: 12000 },
};

const heightmapCache = {};
const pendingMapLoads = {};

/* Load (or fetch from cache) the HeightMap for a scenery index.
 * Returns a Promise. Falls back to a flat dummy map when data is missing. */
function getHeightmap(sceneryindex) {
  if (!(sceneryindex in HM_MAPS)) {
    console.warn('Scenery index ' + sceneryindex + ' not found, defaulting to Eifel Flat');
    sceneryindex = 5;
  }
  const info = HM_MAPS[sceneryindex];
  if (heightmapCache[sceneryindex]) return Promise.resolve(heightmapCache[sceneryindex]);
  if (pendingMapLoads[sceneryindex]) return pendingMapLoads[sceneryindex];

  pendingMapLoads[sceneryindex] = new Promise((resolve) => {
    loadHeightmapScript(info.file).then((entry) => {
      if (!entry) {
        console.warn('Heightmap data missing. Generating dummy map.');
        resolve(new HeightMap(10, 10, [0, 100], [0, 100], new Float32Array(100), 1000));
        return;
      }
      const binary = base64ToUint8(entry.data);
      const count = entry.cols * entry.rows;
      const array = new Float32Array(count);
      const u16 = new Uint16Array(binary.buffer, binary.byteOffset, count);
      for (let i = 0; i < count; i++) array[i] = halfToFloat(u16[i]);
      const hm = new HeightMap(entry.cols, entry.rows, [entry.zmin, entry.zmax],
        [0, entry.zmax - entry.zmin], array, entry.mapSize);
      heightmapCache[sceneryindex] = hm;
      delete pendingMapLoads[sceneryindex];
      resolve(hm);
    });
  });
  return pendingMapLoads[sceneryindex];
}

/* Dynamically inject maps/<name>.js (works on http(s) AND file://) */
function loadHeightmapScript(name) {
  return new Promise((resolve) => {
    if (window.TLC_MAPS_DATA && window.TLC_MAPS_DATA[name]) {
      resolve(window.TLC_MAPS_DATA[name]);
      return;
    }
    const script = document.createElement('script');
    const base = (window.TLC_BASE_PATH || '') + 'maps/' + name + '.js';
    script.src = base;
    script.onload = () => resolve(window.TLC_MAPS_DATA ? window.TLC_MAPS_DATA[name] : null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

function base64ToUint8(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* ------------------------------------------------------------------ */
/* Marching squares contours (port of heightmap.contours)             */
/* ------------------------------------------------------------------ */
let _contourCache = { key: null, value: null };

function contours(heightMap, size, _range, step) {
  _range = _range || [-500, -500, 500, 500];
  const hm = heightMap;
  const limit = hm.mapSize / 2;

  const xMin = Math.max(-limit, Math.min(limit, _range[0]));
  const yMin = Math.max(-limit, Math.min(limit, _range[1]));
  const xMax = Math.max(-limit, Math.min(limit, _range[2]));
  const yMax = Math.max(-limit, Math.min(limit, _range[3]));

  const cacheKey = [hm.id, size, step,
    xMin.toFixed(6), yMin.toFixed(6), xMax.toFixed(6), yMax.toFixed(6)].join('|');
  if (_contourCache.key === cacheKey) return _contourCache.value;

  const colLen = xMax - xMin;
  const rowLen = yMax - yMin;
  if (colLen <= 0 || rowLen <= 0) return [null, 0, 0];

  const cols = Math.floor(colLen / size);
  const rows = Math.floor(rowLen / size);
  if (cols === 0 || rows === 0) return [null, 0, 0];
  if (cols * rows > 40000) return [null, 0, 0]; // safety cap

  // Batch-sample the grid
  const gridVals = [];
  let globalZmin = Infinity, globalZmax = -Infinity;
  for (let r = 0; r <= rows; r++) {
    const currY = yMin + r * size;
    const rowVals = new Float64Array(cols + 1);
    for (let c = 0; c <= cols; c++) {
      const z = hm.coordToFraction(xMin + c * size, currY, 'm', true);
      if (z < globalZmin) globalZmin = z;
      if (z > globalZmax) globalZmax = z;
      rowVals[c] = z;
    }
    gridVals.push(rowVals);
  }

  // Determine iso-levels
  let levels;
  if (step === undefined || step === null) {
    levels = subdivideDistance(globalZmin, globalZmax, 10).points;
  } else {
    levels = subdivideDistance(globalZmin, globalZmax, null, step).points;
  }

  const cellXs = new Float64Array(cols + 1);
  const cellYs = new Float64Array(rows + 1);
  for (let c = 0; c <= cols; c++) cellXs[c] = xMin + c * size;
  for (let r = 0; r <= rows; r++) cellYs[r] = yMin + r * size;

  function interpolateEdge(valA, valB, threshold, originVal, cellSize) {
    const diff = valB - valA;
    let factor;
    if (diff > -1e-5 && diff < 1e-5) factor = 0.5;
    else factor = (threshold - valA) / diff;
    return originVal + factor * cellSize;
  }

  function makeEdgePoint(edgeId, cellX, cellXEnd, cellY, cellYEnd, valTl, valTr, valBr, valBl, level) {
    if (edgeId === 0) return [interpolateEdge(valTl, valTr, level, cellX, size), cellY];
    if (edgeId === 1) return [cellXEnd, interpolateEdge(valTr, valBr, level, cellY, size)];
    if (edgeId === 2) return [interpolateEdge(valBl, valBr, level, cellX, size), cellYEnd];
    return [cellX, interpolateEdge(valTl, valBl, level, cellY, size)];
  }

  const lineDict = {};
  for (const level of levels) {
    const segments = [];
    for (let r = 0; r < rows; r++) {
      const gridR = gridVals[r], gridR1 = gridVals[r + 1];
      const cellY = cellYs[r], cellYEnd = cellYs[r + 1];
      for (let c = 0; c < cols; c++) {
        const valTl = gridR[c], valTr = gridR[c + 1];
        const valBr = gridR1[c + 1], valBl = gridR1[c + 1 - 1];

        let caseIdx = 0;
        if (valBl > level) caseIdx |= 1;
        if (valBr > level) caseIdx |= 2;
        if (valTr > level) caseIdx |= 4;
        if (valTl > level) caseIdx |= 8;
        if (caseIdx === 0 || caseIdx === 15) continue;

        if (caseIdx === 5 || caseIdx === 10) {
          if ((valTl + valTr + valBr + valBl) * 0.25 > level) caseIdx ^= 15;
        }

        const edges = MS_CASE_MAP[caseIdx];
        const cellX = cellXs[c], cellXEnd = cellXs[c + 1];

        const edgePts = [null, null, null, null];
        for (const [edgeStart, edgeEnd] of edges) {
          if (!edgePts[edgeStart]) edgePts[edgeStart] = makeEdgePoint(edgeStart, cellX, cellXEnd, cellY, cellYEnd, valTl, valTr, valBr, valBl, level);
          if (!edgePts[edgeEnd]) edgePts[edgeEnd] = makeEdgePoint(edgeEnd, cellX, cellXEnd, cellY, cellYEnd, valTl, valTr, valBr, valBl, level);
          segments.push([edgePts[edgeStart], edgePts[edgeEnd]]);
        }
      }
    }
    if (segments.length) lineDict[level] = stitchSegments(segments);
  }

  _contourCache.key = cacheKey;
  _contourCache.value = [lineDict, globalZmin, globalZmax];
  return _contourCache.value;
}

/* Connect disjoint line segments into polylines via a hash map */
function stitchSegments(segments) {
  function ptKey(p) { return p[0].toFixed(3) + ',' + p[1].toFixed(3); }

  const adj = {};
  const segIds = segments.map(() => ({})); // per-segment object identity
  for (let i = 0; i < segments.length; i++) {
    const line = segments[i];
    (adj[ptKey(line[0])] = adj[ptKey(line[0])] || []).push(i);
    (adj[ptKey(line[line.length - 1])] = adj[ptKey(line[line.length - 1])] || []).push(i);
  }

  const processed = new Array(segments.length).fill(false);
  const polylines = [];

  for (let i = 0; i < segments.length; i++) {
    if (processed[i]) continue;
    const line = segments[i];
    const poly = line.slice();
    processed[i] = true;

    // Grow left (prepend)
    let growing = true;
    while (growing) {
      growing = false;
      const startKey = ptKey(poly[0]);
      for (const candIdx of (adj[startKey] || [])) {
        if (processed[candIdx]) continue;
        const cand = segments[candIdx];
        if (ptKey(cand[cand.length - 1]) === startKey) {
          poly.unshift(...cand.slice(0, cand.length - 1));
          processed[candIdx] = true; growing = true; break;
        } else if (ptKey(cand[0]) === startKey) {
          poly.unshift(cand[cand.length - 1]);
          processed[candIdx] = true; growing = true; break;
        }
      }
    }

    // Grow right (append)
    growing = true;
    while (growing) {
      growing = false;
      const endKey = ptKey(poly[poly.length - 1]);
      for (const candIdx of (adj[endKey] || [])) {
        if (processed[candIdx]) continue;
        const cand = segments[candIdx];
        if (ptKey(cand[0]) === endKey) {
          poly.push(...cand.slice(1));
          processed[candIdx] = true; growing = true; break;
        } else if (ptKey(cand[cand.length - 1]) === endKey) {
          poly.push(...cand.slice(0, cand.length - 1).reverse());
          processed[candIdx] = true; growing = true; break;
        }
      }
    }
    polylines.push(poly);
  }
  return polylines;
}

window.TLCHm = { HeightMap, HM_MAPS, getHeightmap, contours, stitchSegments, halfToFloat };
