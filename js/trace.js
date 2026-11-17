/* =========================================================================
 * Track Layout Creator + — Web Port
 * trace.js — image-to-track vectorization (port of
 *           resources/imageTraceService.py from the MIT-licensed TLC+).
 *
 * Original tool: Copyright (c) 2017 eran0004, (c) 2026 daydrive7 (MIT)
 * ========================================================================= */
'use strict';

/* Load an image file into a grayscale (luma) byte grid via canvas */
function imageToLumaGrid(img) {
  let width = img.naturalWidth, height = img.naturalHeight;
  const maxDim = 1500;
  let drawW = width, drawH = height;
  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height);
    drawW = Math.max(1, Math.round(width * scale));
    drawH = Math.max(1, Math.round(height * scale));
  }
  const canvas = document.createElement('canvas');
  canvas.width = drawW; canvas.height = drawH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, drawW, drawH);
  const data = ctx.getImageData(0, 0, drawW, drawH).data;
  const luma = new Uint8Array(drawW * drawH);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    luma[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
  }
  return { luma: luma, width: drawW, height: drawH };
}

/* Convert a luma grid into a dilated binary ink mask */
function preprocessImage(luma, width, height, thresholdValue) {
  thresholdValue = thresholdValue || 0;
  let avg = 0;
  for (let i = 0; i < luma.length; i++) avg += luma[i];
  avg /= luma.length;
  const isDarkOnLight = avg > 128;
  let threshold = avg * (isDarkOnLight ? 0.90 : 1.10);
  if (thresholdValue > 0) threshold = thresholdValue;

  const binary = new Uint8Array(width * height);
  for (let i = 0; i < luma.length; i++) {
    binary[i] = isDarkOnLight ? (luma[i] < threshold ? 1 : 0) : (luma[i] > threshold ? 1 : 0);
  }

  // 4-neighbour dilation
  const grid = binary.slice();
  for (let y = 0; y < height; y++) {
    const rowOff = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOff + x;
      if (binary[idx]) continue;
      if ((y > 0 && binary[idx - width]) || (y < height - 1 && binary[idx + width]) ||
          (x > 0 && binary[idx - 1]) || (x < width - 1 && binary[idx + 1])) {
        grid[idx] = 1;
      }
    }
  }

  const pixels = [];
  for (let i = 0; i < grid.length; i++) if (grid[i]) pixels.push({ x: i % width, y: Math.floor(i / width) });
  return { grid: grid, pixels: pixels };
}

/* Zhang-Suen two-pass thinning to a 1-pixel skeleton */
function zhangSuenThinning(grid, width, height) {
  const thinned = grid.slice();
  let hasChanged = true;

  function neighbors(x, y) {
    const idx = y * width + x;
    return {
      p2: y > 0 ? thinned[idx - width] : 0,
      p3: (y > 0 && x < width - 1) ? thinned[idx - width + 1] : 0,
      p4: x < width - 1 ? thinned[idx + 1] : 0,
      p5: (y < height - 1 && x < width - 1) ? thinned[idx + width + 1] : 0,
      p6: y < height - 1 ? thinned[idx + width] : 0,
      p7: (y < height - 1 && x > 0) ? thinned[idx + width - 1] : 0,
      p8: x > 0 ? thinned[idx - 1] : 0,
      p9: (y > 0 && x > 0) ? thinned[idx - width - 1] : 0,
    };
  }

  function markStep(step) {
    hasChanged = false;
    const marked = [];
    for (let y = 1; y < height - 1; y++) {
      const base = y * width;
      for (let x = 1; x < width - 1; x++) {
        const idx = base + x;
        if (thinned[idx] !== 1) continue;
        const { p2, p3, p4, p5, p6, p7, p8, p9 } = neighbors(x, y);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        let A = 0;
        if (p2 === 0 && p3 === 1) A++;
        if (p3 === 0 && p4 === 1) A++;
        if (p4 === 0 && p5 === 1) A++;
        if (p5 === 0 && p6 === 1) A++;
        if (p6 === 0 && p7 === 1) A++;
        if (p7 === 0 && p8 === 1) A++;
        if (p8 === 0 && p9 === 1) A++;
        if (p9 === 0 && p2 === 1) A++;
        if (A !== 1) continue;
        if (step === 1) {
          if ((p2 * p4 * p6 !== 0) || (p4 * p6 * p8 !== 0)) continue;
        } else {
          if ((p2 * p4 * p8 !== 0) || (p2 * p6 * p8 !== 0)) continue;
        }
        marked.push(idx);
        hasChanged = true;
      }
    }
    for (const i of marked) thinned[i] = 0;
  }

  while (hasChanged) {
    markStep(1);
    if (!hasChanged) break;
    markStep(2);
  }
  return thinned;
}

/* Walk a 1-pixel skeleton, keeping the longest ordered path */
function extractPathGraphTraversal(skeleton, width, height) {
  const visited = new Uint8Array(width * height);

  function walk(sx, sy) {
    const path = [];
    let curr = { x: sx, y: sy };
    while (curr) {
      path.push(curr);
      const cx = curr.x, cy = curr.y;
      visited[cy * width + cx] = 1;
      let nextNode = null, bestDist = Infinity;
      for (let dy = -3; dy <= 3; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= height) continue;
        const base = ny * width;
        for (let dx = -3; dx <= 3; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          if (nx < 0 || nx >= width) continue;
          const idx = base + nx;
          if (skeleton[idx] === 1 && visited[idx] === 0) {
            const d = dx * dx + dy * dy;
            if (d < bestDist) { bestDist = d; nextNode = { x: nx, y: ny }; }
          }
        }
      }
      curr = nextNode;
    }
    return path;
  }

  let best = [];
  while (true) {
    let start = null, fallback = null;
    outer:
    for (let y = 1; y < height - 1; y++) {
      const base = y * width;
      for (let x = 1; x < width - 1; x++) {
        const idx = base + x;
        if (skeleton[idx] === 1 && !visited[idx]) {
          if (!fallback) fallback = { x, y };
          const deg = skeleton[idx - width - 1] + skeleton[idx - width] + skeleton[idx - width + 1] +
            skeleton[idx - 1] + skeleton[idx + 1] +
            skeleton[idx + width - 1] + skeleton[idx + width] + skeleton[idx + width + 1];
          if (deg === 1) { start = { x, y }; break outer; }
        }
      }
    }
    if (!start) start = fallback;
    if (!start) break;
    const p = walk(start.x, start.y);
    if (p.length > best.length) best = p;
  }
  return best;
}

/* Greedy walk preferring nearby pixels along the current direction */
function runInertiaWalker(grid, pixels, width, height) {
  if (!pixels.length) return [];
  const gridCopy = grid.slice();
  const startNode = pixels[Math.floor(pixels.length / 2)];
  const path = [startNode];
  let curr = { x: startNode.x, y: startNode.y };

  function clearRadius(cx, cy, r) {
    const yStart = Math.max(0, cy - r), yEnd = Math.min(height, cy + r + 1);
    const xStart = Math.max(0, cx - r), xEnd = Math.min(width, cx + r + 1);
    for (let ny = yStart; ny < yEnd; ny++) {
      const base = ny * width;
      for (let nx = xStart; nx < xEnd; nx++) gridCopy[base + nx] = 0;
    }
  }

  clearRadius(curr.x, curr.y, 2);
  let vx = 0.0, vy = 0.0;
  let steps = 0;
  const maxSteps = 20000;

  while (steps < maxSteps) {
    let bestNext = null;
    let bestScore = -Infinity;
    const rad = 3;
    const cx = curr.x, cy = curr.y;

    const vLen = Math.hypot(vx, vy);
    let nvx = 0, nvy = 0;
    if (vLen > 0) { nvx = vx / vLen; nvy = vy / vLen; }

    for (let dy = -rad; dy <= rad; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= height) continue;
      const base = ny * width;
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        if (nx < 0 || nx >= width) continue;
        const idx = base + nx;
        if (gridCopy[idx] !== 1) continue;
        const dist = Math.hypot(dx, dy);
        let score = 10.0 - dist;
        if (vLen > 0) {
          score += (nvx * (dx / dist) + nvy * (dy / dist)) * 20;
        }
        if (score > bestScore) { bestScore = score; bestNext = { x: nx, y: ny }; }
      }
    }

    if (bestNext) {
      nvx = bestNext.x - cx; nvy = bestNext.y - cy;
      vx = vx * 0.5 + nvx * 0.5;
      vy = vy * 0.5 + nvy * 0.5;
      curr = bestNext;
      path.push(curr);
      clearRadius(curr.x, curr.y, 2);
    } else {
      const distStart = Math.hypot(cx - startNode.x, cy - startNode.y);
      if (path.length > 50 && distStart < width * 0.1) path.push(startNode);
      break;
    }
    steps++;
  }
  return path;
}

function traceCenterline(grid, pixels, width, height) {
  let path = runInertiaWalker(grid, pixels, width, height);
  if (path.length < 50) {
    const skeleton = zhangSuenThinning(grid, width, height);
    path = extractPathGraphTraversal(skeleton, width, height);
  }
  return path;
}

/* Moore-boundary trace of the outer perimeter */
function traceOutline(grid, width, height) {
  let start = null;
  outer:
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y * width + x] === 1) { start = { x, y }; break outer; }
    }
  }
  if (!start) return [];

  const path = [start];
  const dirs = [
    { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
    { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
  ];

  let curr = start;
  let backtrackDir = 6;
  let iterations = 0;
  const maxIter = 30000;

  while (iterations < maxIter) {
    let found = false;
    for (let i = 0; i < 8; i++) {
      const checkDirIdx = (backtrackDir + 1 + i) % 8;
      const d = dirs[checkDirIdx];
      const nx = curr.x + d.x, ny = curr.y + d.y;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny * width + nx] === 1) {
        curr = { x: nx, y: ny };
        path.push(curr);
        backtrackDir = (checkDirIdx + 4) % 8;
        found = true;
        break;
      }
    }
    if (!found) break;
    if (curr.x === start.x && curr.y === start.y) break;
    iterations++;
  }
  return path;
}

/* Sub-sample ink pixels and greedily chain them (TSP-ish) */
function traceSmartOutline(pixels, width, height) {
  if (!pixels.length) return [];
  const targetPoints = 1500;
  const step = Math.max(1, Math.floor(pixels.length / targetPoints));
  const unvisited = [];
  for (let i = 0; i < pixels.length; i += step) unvisited.push(pixels[i]);
  if (!unvisited.length) return [];

  const path = [unvisited.pop()];
  while (unvisited.length) {
    const curr = path[path.length - 1];
    let bestIdx = -1, bestDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const p = unvisited[i];
      const dist = (p.x - curr.x) ** 2 + (p.y - curr.y) ** 2;
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    path.push(unvisited[bestIdx]);
    unvisited[bestIdx] = unvisited[unvisited.length - 1];
    unvisited.pop();
  }
  return path;
}

/* Iterative Ramer-Douglas-Peucker simplification */
function rdpSimplify(pts, epsilon) {
  const n = pts.length;
  if (n < 3) return pts.slice();

  function lineDistSq(p, s, e) {
    const sx = s.x, sy = s.y, ex = e.x, ey = e.y, px = p.x, py = p.y;
    const dx = ex - sx, dy = ey - sy;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return (px - sx) ** 2 + (py - sy) ** 2;
    let t = ((px - sx) * dx + (py - sy) * dy) / l2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = sx + t * dx, cy = sy + t * dy;
    return (px - cx) ** 2 + (py - cy) ** 2;
  }

  const keep = new Array(n).fill(false);
  keep[0] = true; keep[n - 1] = true;
  const epsSq = epsilon * epsilon;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [sIdx, eIdx] = stack.pop();
    if (eIdx - sIdx < 2) continue;
    const sPt = pts[sIdx], ePt = pts[eIdx];
    let dmaxSq = 0.0, maxIdx = -1;
    for (let i = sIdx + 1; i < eIdx; i++) {
      const dSq = lineDistSq(pts[i], sPt, ePt);
      if (dSq > dmaxSq) { dmaxSq = dSq; maxIdx = i; }
    }
    if (maxIdx >= 0 && dmaxSq > epsSq) {
      keep[maxIdx] = true;
      stack.push([sIdx, maxIdx]);
      stack.push([maxIdx, eIdx]);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

/* Top-level image-to-track pipeline */
function traceImageToTrack(img, targetSize, mode, thresholdValue) {
  targetSize = targetSize || 1000;
  mode = mode || 'centerline';
  thresholdValue = thresholdValue || 0;

  const { luma, width, height } = imageToLumaGrid(img);
  const { grid, pixels } = preprocessImage(luma, width, height, thresholdValue);

  if (pixels.length < 50) throw new Error('Trace failed. Image too faint or empty.');

  let rawPath;
  if (mode === 'smart-outline') rawPath = traceSmartOutline(pixels, width, height);
  else if (mode.indexOf('outline') === 0) rawPath = traceOutline(grid, width, height);
  else rawPath = traceCenterline(grid, pixels, width, height);

  if (rawPath.length < 5) throw new Error('Trace resulted in too few points.');

  const minPx = Math.min(...rawPath.map(p => p.x));
  const maxPx = Math.max(...rawPath.map(p => p.x));
  const minPy = Math.min(...rawPath.map(p => p.y));
  const maxPy = Math.max(...rawPath.map(p => p.y));
  const pxSize = Math.max(maxPx - minPx, maxPy - minPy, 1);

  let epsilon;
  if (mode === 'outline') epsilon = pxSize * 0.005;
  else if (mode === 'smart-outline') epsilon = pxSize * 0.008;
  else epsilon = pxSize * 0.012;

  const simplified = rdpSimplify(rawPath, epsilon);

  const scaleFactor = targetSize / pxSize;
  const centerX = (minPx + maxPx) / 2;
  const centerY = (minPy + maxPy) / 2;

  const physicalPoints = simplified.map(p => ({
    x: (p.x - centerX) * scaleFactor,
    y: (p.y - centerY) * scaleFactor,
  }));

  // Minimum distance filter (>= 35 m apart)
  const minDist = 35.0;
  const distFiltered = [physicalPoints[0]];
  for (const p of physicalPoints.slice(1)) {
    const last = distFiltered[distFiltered.length - 1];
    const dist = Math.hypot(p.x - last.x, p.y - last.y);
    if (dist > minDist) distFiltered.push(p);
  }

  // Angle filter — drop redundant nodes on straightaways
  const angleFiltered = [distFiltered[0]];
  for (let i = 1; i < distFiltered.length - 1; i++) {
    const prev = angleFiltered[angleFiltered.length - 1];
    const curr = distFiltered[i];
    const nxt = distFiltered[i + 1];
    const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    const angle2 = Math.atan2(nxt.y - curr.y, nxt.x - curr.x);
    let diff = Math.abs(angle1 - angle2);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff > radians(8)) angleFiltered.push(curr);
  }
  angleFiltered.push(distFiltered[distFiltered.length - 1]);

  const finalPoints = angleFiltered.map(p =>
    makeCoordinate(p.x, p.y, 0, 40, -1, 1));

  // Auto-close the loop if the end is near the start
  if (finalPoints.length > 3) {
    const first = finalPoints[0], last = finalPoints[finalPoints.length - 1];
    const dist = Math.hypot(first.x - last.x, first.y - last.y);
    if (dist < targetSize * 0.15) {
      finalPoints[finalPoints.length - 1].x = first.x;
      finalPoints[finalPoints.length - 1].y = first.y;
    }
  }

  if (finalPoints.length < 3) throw new Error('Trace resulted in too few points (< 3 points).');
  return finalPoints;
}

/* Load a File as an HTMLImageElement */
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
    img.src = url;
  });
}

window.TLCTrace = {
  imageToLumaGrid, preprocessImage, zhangSuenThinning, extractPathGraphTraversal,
  runInertiaWalker, traceCenterline, traceOutline, traceSmartOutline, rdpSimplify,
  traceImageToTrack, loadImageFile,
};
