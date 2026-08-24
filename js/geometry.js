/* =========================================================================
 * Track Layout Creator + — Web Port
 * geometry.js — math core (port of resources/layoutOperations.py and
 *               resources/layoutEuler.py from the MIT-licensed TLC+ source)
 *
 * Original tool: Copyright (c) 2017 eran0004, (c) 2026 daydrive7 (MIT)
 * Web port preserves the algorithms of the original release v1.2.0-beta2.
 * ========================================================================= */
'use strict';

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
function hypotenuse(a, b) { return Math.sqrt(a * a + b * b); }

function secant(x) {
  if (Math.abs(Math.cos(x)) < 0.00001) return 1000000;
  return 1 / Math.cos(x);
}

function bisectRight(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid + 1; else hi = mid;
  }
  return lo;
}

/* Point on an arc at startAngle + sweepAngle*factor (screen-y convention) */
function interpolateArc(center, radius, startAngle, sweepAngle, factor) {
  factor = (factor === undefined) ? 0.5 : factor;
  const angle = startAngle + sweepAngle * factor;
  return [center[0] + radius * Math.cos(angle), center[1] - radius * Math.sin(angle)];
}

function interpolateLine(p0, p1, factor) {
  factor = (factor === undefined) ? 0.5 : factor;
  return [p0[0] + (p1[0] - p0[0]) * factor, p0[1] + (p1[1] - p0[1]) * factor];
}

/* Subdivide [d0,d1] into "nice" step values from {1,2,2.5,5}x10^k */
function subdivideDistance(d0, d1, subdivisions, step, _range) {
  subdivisions = subdivisions || 3;

  function stepFinder(n, subdivisions) {
    if (n === 0) return [1, 1];
    const sign = n >= 0 ? 1 : -1;
    const factors = [1, 2, 2.5, 5];
    if (subdivisions <= 0) subdivisions = 1;
    let val = Math.abs(n) / subdivisions;
    if (val === 0) val = 1;
    const potencia = Math.floor(Math.log10(val));
    const significand = val / Math.pow(10, potencia);
    let best = factors[0], bestDiff = Infinity;
    for (const f of factors) {
      const diff = Math.abs(f - significand);
      if (diff < bestDiff) { bestDiff = diff; best = f; }
    }
    const stepFactor = best * sign;
    return [stepFactor * Math.pow(10, potencia), stepFactor];
  }

  const sorted = d0 <= d1 ? [d0, d1] : [d1, d0];
  d0 = sorted[0]; d1 = sorted[1];
  const n = d1 - d0;

  let factor = null;
  if (step === undefined || step === null) {
    const res = stepFinder(n, subdivisions);
    step = res[0]; factor = res[1];
  }
  if (_range === undefined || _range === null) _range = [d0, d1];
  const r0 = _range[0], r1 = _range[1];
  if (step === 0) step = 1;

  let startGrid = Math.floor(r0 / step) * step;
  if (startGrid < r0) startGrid += step;

  const myList = [];
  const epsilon = step * 0.001;
  if (step > 0) {
    let numSteps = Math.floor(((r1 + epsilon) - startGrid) / step) + 1;
    numSteps = Math.min(numSteps, 2000);
    for (let i = 0; i < numSteps; i++) {
      const curr = startGrid + i * step;
      if (curr >= r0 - epsilon) {
        // float(format(curr,'g')) — 6 significant digits
        myList.push(parseFloat(curr.toPrecision(6)));
      }
    }
  }
  return { points: myList, step: step, factor: factor };
}

/* Heightmap fraction (0..1) to a 5-stop RGB colour */
const H_COLORS = [[0, 100, 200], [0, 120, 110], [120, 120, 0], [200, 0, 0], [130, 0, 130]];
function fractionToRgb(fraction) {
  const colors = H_COLORS;
  if (fraction >= 1.0) return colors[colors.length - 1];
  if (fraction <= 0.0) return colors[0];
  const threshold = 1 / (colors.length - 1);
  let idx = Math.floor(fraction / threshold);
  if (idx >= colors.length - 1) idx = colors.length - 2;
  const frac = ((fraction % threshold) / threshold);
  const c0 = colors[idx], c1 = colors[idx + 1];
  return [
    Math.round(c0[0] + (c1[0] - c0[0]) * frac),
    Math.round(c0[1] + (c1[1] - c0[1]) * frac),
    Math.round(c0[2] + (c1[2] - c0[2]) * frac),
  ];
}
function fractionToHex(fraction) {
  const c = fractionToRgb(fraction);
  return '#' + ((1 << 24) + (c[0] << 16) + (c[1] << 8) + c[2]).toString(16).slice(1).toUpperCase();
}

/* Angle (radians) of vector a->b flipped to match screen Y axis */
function getAngle(a, b) { return -Math.atan2(b[1] - a[1], b[0] - a[0]); }
function getVector(a, b) { return [b[0] - a[0], b[1] - a[1]]; }
function getLength(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function getLineIntersection(line1, line2) {
  const xdiff = [line1[0][0] - line1[1][0], line2[0][0] - line2[1][0]];
  const ydiff = [line1[0][1] - line1[1][1], line2[0][1] - line2[1][1]];
  function det(a, b) { return a[0] * b[1] - a[1] * b[0]; }
  const div = det(xdiff, ydiff);
  if (div === 0) {
    return [(line1[0][0] + line1[1][0]) / 2, (line1[0][1] + line1[1][1]) / 2];
  }
  const d = [det(line1[0], line1[1]), det(line2[0], line2[1])];
  return [det(d, xdiff) / div, det(d, ydiff) / div];
}

function getSweepAngle(a, b) {
  const cornerAngle = getVectorAngle(a, b);
  if (cornerAngle > 0) return Math.PI - cornerAngle;
  return -Math.PI - cornerAngle;
}

function getSweepAngleFromPoints(start, center, end) {
  return getSweepAngle(getVector(center, start), getVector(center, end));
}

function getVectorAngle(p0, p1, center) {
  center = center || [0, 0];
  const v1 = getVector(center, p0);
  const v2 = getVector(center, p1);
  // NOTE: matches the original atan2(*v) unpacking — atan2(x, y), not atan2(y, x)
  let angle = Math.atan2(v2[0], v2[1]) - Math.atan2(v1[0], v1[1]);
  if (angle > Math.PI) angle -= 2 * Math.PI;
  else if (angle < -Math.PI) angle += 2 * Math.PI;
  return -angle;
}

function getEulerArcLength(sweepAngle, radius, segments) {
  return (Math.abs(sweepAngle) * radius) / (segments + 1);
}

function snapToGrid(value, gridsize) {
  if (!gridsize) return value;
  return Math.round(value / gridsize) * gridsize;
}

/* Compute (radius, startAngle, sweepAngle) for the CP at index */
function getCurveData(CPS, index) {
  const thisCp = CPS[index];
  const prev = CPS[index - 1];
  const radius = getLength(thisCp.center, thisCp.xy);
  const startAngle = getAngle(thisCp.center, prev.xy);
  const endAngle = getAngle(thisCp.center, thisCp.xy);
  let sweepAngle = endAngle - startAngle;
  // Only formtypes 1/2 are positive-sweep curves; 2147483649/2147483650 are
  // negative (mirrors the original's `this.formtype in (1, 2)` check).
  const isPositiveCurve = (thisCp.formtype === 1 || thisCp.formtype === 2);
  if (isPositiveCurve && sweepAngle < 0) sweepAngle += 2 * Math.PI;
  else if (!isPositiveCurve && sweepAngle > 0) sweepAngle -= 2 * Math.PI;
  return [radius, startAngle, sweepAngle];
}

/* ------------------------------------------------------------------ */
/* Track distance -> (x, y, angle)                                     */
/* ------------------------------------------------------------------ */
function distanceToCoords(CPS, distance) {
  distance = Math.max(0.0, distance);
  if (!CPS || CPS.length < 2) return [0, 0, 0];

  const lastCp = CPS[CPS.length - 1];
  const cacheKey = CPS.map(cp => cp.x.toFixed(6) + ',' + cp.y.toFixed(6)).join(';');
  let cumD = lastCp._cum_dist;
  if (!cumD || cumD.length !== CPS.length || lastCp._cum_key !== cacheKey) {
    cumD = [0.0];
    for (let i = 1; i < CPS.length; i++) {
      const thisCp = CPS[i], prev = CPS[i - 1];
      let length;
      if (thisCp.formtype === 0 || thisCp.formtype === 3) length = getLength(prev.xy, thisCp.xy);
      else length = Math.abs(thisCp.radius * thisCp.sweepAngle);
      thisCp.seg_len = length;
      cumD.push(cumD[cumD.length - 1] + length);
    }
    lastCp._cum_dist = cumD;
    lastCp._cum_key = cacheKey;
  }

  const total = cumD[cumD.length - 1];
  let index, d;
  if (distance >= total) {
    index = CPS.length - 1;
    d = cumD[index - 1];
  } else {
    index = bisectRight(cumD, distance);
    if (index <= 0) index = 1;
    d = cumD[index - 1];
  }

  const thisCp = CPS[index], prev = CPS[index - 1];
  let length;
  if (thisCp.seg_len !== undefined && thisCp.seg_len !== null) length = thisCp.seg_len;
  else if (thisCp.formtype === 0 || thisCp.formtype === 3) length = getLength(prev.xy, thisCp.xy);
  else length = Math.abs(thisCp.radius * thisCp.sweepAngle);

  let f = 0.0;
  if (length !== 0) {
    f = (distance - d) / length;
    if (f < 0) f = 0; else if (f > 1) f = 1;
  }

  if (thisCp.formtype === 0 || thisCp.formtype === 3) {
    const coords = interpolateLine(prev.xy, thisCp.xy, f);
    return [coords[0], coords[1], getAngle(prev.xy, thisCp.xy)];
  } else {
    const coords = interpolateArc(thisCp.center, thisCp.radius, thisCp.startAngle, thisCp.sweepAngle, f);
    let turnDirection = 1;
    if (Math.abs(thisCp.sweepAngle) >= 1e-6) turnDirection = thisCp.sweepAngle / Math.abs(thisCp.sweepAngle);
    const angle = thisCp.startAngle + thisCp.sweepAngle * f + (Math.PI / 2) * turnDirection;
    return [coords[0], coords[1], angle];
  }
}

/* Measure track length; returns {lengths,total,distances} */
function measureTrackLength(CPS) {
  const lengths = [], distances = [];
  if (!CPS || CPS.length === 0) return { lengths: [], total: 0, distances: [] };
  let cum = 0.0;
  for (let i = 1; i < CPS.length; i++) {
    const thisCp = CPS[i], prev = CPS[i - 1];
    let length;
    if (thisCp.formtype === 0 || thisCp.formtype === 3) length = getLength(prev.xy, thisCp.xy);
    else length = Math.abs(thisCp.radius * thisCp.sweepAngle);
    thisCp.seg_len = length;
    cum += length;
    lengths.push(length);
    distances.push(cum);
  }
  delete CPS[CPS.length - 1]._cum_dist;
  delete CPS[CPS.length - 1]._cum_key;
  return { lengths: lengths, total: distances.length ? distances[distances.length - 1] : 0, distances: distances };
}

/* ------------------------------------------------------------------ */
/* Euler / hairpin curve generation (port of layoutEuler.py)           */
/* ------------------------------------------------------------------ */
const minCpDistance = 15;

class Curve {
  constructor() {
    this.curves = [];
    this.turnDirection = null;
    this.eulerPoint = null;
    this.eulerRadius = null;
    this.radius = null;
    this.lineLength = null;
    this.angularPoint = null;
    this.segments = 0;
    this.length = 0;
    this.type = 'euler';
  }
  get start() {
    try { return this.curves[0][2]; } catch (e) { return [0, 0]; }
  }
  get end() {
    try { return this.curves[this.curves.length - 1][3]; } catch (e) { return [0, 0]; }
  }
  get sweepAngle() {
    return Math.PI - Math.abs(getVectorAngle(this.start, this.end, this.angularPoint));
  }
  get arcLength() {
    return getEulerArcLength(this.sweepAngle, this.radius, this.curves.length / 2);
  }
  placeAt(position) {
    const [x, y] = this.angularPoint;
    const offX = position[0] - x, offY = position[1] - y;
    this.angularPoint = [x + offX, y + offY];
    const [ex, ey] = this.eulerPoint;
    this.eulerPoint = [ex + offX, ey + offY];
    for (const s of this.curves) {
      for (let i = 2; i < 5; i++) {
        s[i] = [s[i][0] + offX, s[i][1] + offY];
      }
    }
  }
}

function roundPolygon(polygon, circuit) {
  function roundCorner(p0, p1, ap, d0, d1) {
    const maxLineLength = Math.min(d0, d1);
    let radius = ap.radius ? ap.radius : 90;
    if (radius < 1) radius = 1;
    let segments = ap.segments;
    if (segments === null || segments === undefined) segments = 0;
    segments = parseInt(segments);
    const curve = euler_from_points(p0, p1, ap.xy, maxLineLength, segments, radius);
    ap.radius = curve.radius;
    return curve;
  }

  if (circuit) polygon = polygon.concat([polygon[0]]);
  const curves = [];
  const n = polygon.length;
  const limit = circuit ? n - 1 : n - 2;

  for (let index = 0; index < limit; index++) {
    const point = polygon[index];
    const ap = polygon[index + 1];
    // original raises IndexError on polygon[index+2] and breaks — for circuits
    // this skips the duplicated closing point (handled by the block below)
    if (index + 2 > polygon.length - 1) break;
    const p1 = polygon[index + 2].xy;

    let p0, d0;
    if (index === 0) {
      p0 = point.xy;
      d0 = getLength(p0, ap.xy);
      if (circuit) d0 -= Math.min(d0 / 4, 30);
    } else {
      p0 = curves[curves.length - 1].end;
      d0 = getLength(p0, ap.xy) - minCpDistance;
      if (ap.segments === 1) d0 += minCpDistance;
    }

    let d1 = getLength(p1, ap.xy);
    d1 -= Math.min(d1 / 4, 30);

    if (d0 < 0) d0 = 0.1;
    if (d1 < 0) d1 = 0.1;

    curves.push(roundCorner(p0, p1, ap, d0, d1));
  }

  if (circuit && n > 2) {
    try {
      const p0 = curves[curves.length - 1].end;
      const ap = polygon[polygon.length - 1];
      const p1 = curves[0].start;
      let d0 = getLength(p0, ap.xy) - minCpDistance;
      if (ap.segments === 1) d0 += minCpDistance;
      let d1 = getLength(p1, ap.xy);
      if (d0 < 0) d0 = 0.1;
      if (d1 < 0) d1 = 0.1;
      curves.push(roundCorner(p0, p1, ap, d0, d1));
    } catch (e) { console.warn('Error closing loop:', e); }
  }
  return curves;
}

function euler_from_points(p0, p1, center, maxLineLength, segments, radius) {
  segments = segments || 0;
  radius = (radius === undefined) ? 90 : radius;
  const vector0 = getVector(center, p0);
  const vector1 = getVector(center, p1);
  const startAngle = getAngle(p0, center);
  const sweepAngle = getSweepAngle(vector0, vector1);

  let curve;
  if (Math.abs(sweepAngle) > radians(140) && radius > 10 && radius < 30) {
    curve = hairpin(startAngle, sweepAngle, radius, maxLineLength, segments, center);
    curve.type = 'hairpin';
  } else {
    curve = euler_curve(startAngle, sweepAngle, radius, maxLineLength, segments, center);
    curve.type = 'euler';
  }
  return curve;
}

function radians(deg) { return deg * Math.PI / 180; }
function degrees(rad) { return rad * 180 / Math.PI; }

function euler_curve(startAngle, sweepAngle, radius, maxLineLength, segments, position, eulerLimit) {
  eulerLimit = (eulerLimit === undefined) ? radians(60) : eulerLimit;
  position = position || [0, 0];

  function angle_radius(i, segments, radius) {
    let denom = i + 1;
    if (denom === 0) denom = 1;
    const segmentRadius = radius * segments / denom;
    let segmentAngle = 0;
    if (segmentRadius >= 0.001) segmentAngle = segmentLength / segmentRadius;
    return [segmentAngle, segmentRadius];
  }

  function coordinates(segmentsList) {
    const out = [];
    let runningAngle = startAngle;
    for (const segment of segmentsList) {
      let segmentAngle = segment[0], segmentRadius = segment[1];
      segmentAngle *= curve.turnDirection;

      const angle = runningAngle;
      let startX = Math.sin(angle) * segmentRadius;
      let startY = Math.cos(angle) * segmentRadius;

      const nextAngle = angle + segmentAngle;
      let endX = Math.sin(nextAngle) * segmentRadius;
      let endY = Math.cos(nextAngle) * segmentRadius;

      let centerX = 0.0, centerY = 0.0;
      if (out.length) {
        const prev = out[out.length - 1];
        const prevEndX = prev[3][0], prevEndY = prev[3][1];
        const xOffset = prevEndX - startX;
        const yOffset = prevEndY - startY;
        centerX += xOffset;
        startX += xOffset; endX += xOffset;
        centerY += yOffset;
        startY += yOffset; endY += yOffset;
      }
      out.push([segmentAngle, segmentRadius, [startX, startY], [endX, endY], [centerX, centerY]]);
      runningAngle += segmentAngle;
    }
    return out;
  }

  function findAngularPoint(eulerPoint, eulerRadius, sweepAngle, startAngle) {
    const alpha = sweepAngle / 2;
    const beta = startAngle + alpha - 0.5 * Math.PI;
    let L;
    if (Math.abs(Math.cos(alpha)) < 0.001) L = eulerRadius;
    else L = Math.abs(secant(alpha) * eulerRadius);
    return [eulerPoint[0] + Math.cos(beta) * L, eulerPoint[1] - Math.sin(beta) * L];
  }

  const segmentLength = 15;

  function constructCurve(curve, maxSegments) {
    let segs;
    if (curve.radius < 1) segs = 1;
    else segs = Math.floor(angle * curve.radius / 15 - 1);
    segs = Math.max(segs, 1);
    if (segs > maxSegments) segs = maxSegments;
    curve.segments = segs;

    const a = [];
    for (let i = 0; i < segs; i++) a.push(angle_radius(i, segs, curve.radius));

    let currentAngleSum = 0;
    for (const s of a) currentAngleSum += s[0];
    const overshoot = Math.abs(sweepAngle) - currentAngleSum * 2;
    if (a.length) a[a.length - 1][0] += overshoot / 2;

    // Mirror 'a' to form the second half of the spiral
    const b = a.slice().reverse();
    curve.curves = coordinates(a.concat(b));
    if (!curve.curves.length) return;

    const segA = curve.curves[0];
    const segB = curve.curves[curve.curves.length - 1];
    const lineA = [segA[2], segA[4]];
    const lineB = [segB[3], segB[4]];

    if (curve.radius === 0) {
      curve.eulerPoint = segA[4];
    } else if (mod(Math.abs(sweepAngle), Math.PI) > 0.00001) {
      curve.eulerPoint = getLineIntersection(lineA, lineB);
    } else {
      curve.eulerPoint = [(segA[4][0] + segB[4][0]) / 2, (segA[4][1] + segB[4][1]) / 2];
    }

    const end = curve.end;
    curve.eulerRadius = getLength(curve.eulerPoint, end);
    curve.angularPoint = findAngularPoint(curve.eulerPoint, curve.eulerRadius, sweepAngle, startAngle);
    curve.lineLength = getLength(curve.angularPoint, end);

    curve.length = 0.0;
    for (const c of curve.curves) {
      if (c[0] !== null && c[0] !== undefined) curve.length += Math.abs(c[0] * c[1]);
    }
  }

  const curve = new Curve();
  curve.radius = radius;
  curve.segments = segments;

  if (Math.abs(sweepAngle) < 0.00001) curve.turnDirection = 1;
  else curve.turnDirection = sweepAngle / Math.abs(sweepAngle);

  let angle = Math.abs(sweepAngle);
  if (angle > eulerLimit) angle = eulerLimit;

  let maxSegments = (segments === 0) ? 5 : segments;

  let startAngleAdj = startAngle;
  if (sweepAngle < 0) startAngleAdj += Math.PI;

  // temporarily swap for the closures below
  const realStartAngle = startAngle;
  startAngle = startAngleAdj;
  constructCurve(curve, maxSegments);

  let i = 0;
  while (curve.lineLength > maxLineLength && i < 20) {
    if (curve.segments > 1) {
      maxSegments = curve.segments - 1;
      constructCurve(curve, maxSegments);
      i++;
    } else break;
  }

  if (curve.lineLength > 0.001 && curve.segments === 1 && curve.lineLength > maxLineLength) {
    curve.radius = Math.max(0.1, curve.radius * (maxLineLength / curve.lineLength));
    constructCurve(curve, maxSegments);
  }

  startAngle = realStartAngle;
  curve.placeAt(position);
  return curve;
}

/* Python-style modulo (result has sign of divisor) */
function mod(a, n) { return ((a % n) + n) % n; }

/* Trace a smooth path through points using quadratic Bezier curves anchored
 * on the input points and passing through segment midpoints — the standard
 * approximation of Tk's create_line(smooth=1) parabolic-spline smoothing that
 * the original app uses for heightmap contours and track ribbons. */
function traceSmoothPath(ctx, pts) {
  if (!pts || pts.length === 0) return;
  if (pts.length < 3) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    return;
  }
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
}

function hairpin(startAngle, sweepAngle, radius, maxLineLength, straightLengthFactor, position) {
  position = position || [0, 0];

  function gen_points(angle, turnDirection) {
    const angleA = angle - Math.PI;
    const pointA = [position[0] + (d1 + d2) * Math.cos(angleA),
                    position[1] + (d1 + d2) * -Math.sin(angleA)];

    const angleB = angleA + Math.PI / 2 * turnDirection;
    const pointB = [pointA[0] + r2 * Math.cos(angleB),
                    pointA[1] + r2 * -Math.sin(angleB)];

    const angleC = angleB - Math.PI;
    const pointC = interpolateArc(pointB, r2, angleC, c * -turnDirection, 0.5);

    const angleD = angleC + c * -turnDirection;
    const pointD = [pointB[0] + r2 * Math.cos(angleD),
                    pointB[1] + r2 * -Math.sin(angleD)];

    const angleE = angle + c * -turnDirection;
    const pointE = [pointD[0] + straightLength * Math.cos(angleE),
                    pointD[1] + straightLength * -Math.sin(angleE)];

    const pointF = [pointE[0] + r1 * Math.cos(angleD),
                    pointE[1] + r1 * -Math.sin(angleD)];

    const pointG = interpolateArc(pointF, r1, angleD - Math.PI, Math.PI * turnDirection, 0.5);

    return [pointA, pointB, pointC, pointD, pointE, pointF, pointG];
  }

  const curve = new Curve();
  curve.radius = radius;
  curve.segments = 4;

  if (Math.abs(sweepAngle) < 0.00001) curve.turnDirection = 1;
  else curve.turnDirection = sweepAngle / Math.abs(sweepAngle);

  const a = sweepAngle;
  const b = radians(90) - (Math.PI - Math.abs(sweepAngle)) / 2;
  let c = radians(90) - b;
  if (c <= 0) c = 0.0001;

  let d1 = 0, d2 = 0, r1 = radius, r2 = 0, straightLength = 0;

  let counter = 0;
  while (counter < 10) {
    counter++;
    r1 = radius;
    if (c === 0) c = 0.0001;
    r2 = 30 / c;
    if (r2 < 90) r2 = 90;
    const r3 = r2 / Math.cos(c / 2);

    d1 = r1 / Math.sin(c);
    d2 = r3 * Math.sin(c / 2);
    const d3 = d1 * Math.cos(c); void d3;

    if (d1 + d2 > maxLineLength) {
      if (d2 >= maxLineLength) break;
      let scaleFactor;
      if (r2 > 90) scaleFactor = maxLineLength / (d1 + d2);
      else scaleFactor = (maxLineLength - d2) / d1;
      if (scaleFactor <= 0) break;
      const newRadius = radius * scaleFactor;
      if (newRadius < 1) break;
      radius = newRadius;
    } else break;
  }

  straightLength = (15 + radius * 0.5) * straightLengthFactor;
  curve.radius = radius;
  curve.curves = [];

  let pts = gen_points(startAngle, curve.turnDirection);
  curve.curves.push([c / 2 * -curve.turnDirection, r2, pts[0], pts[2], pts[1]]);
  curve.curves.push([c / 2 * -curve.turnDirection, r2, pts[2], pts[3], pts[1]]);
  if (straightLength) curve.curves.push([null, null, pts[3], pts[4], null]);
  curve.curves.push([Math.PI / 2 * curve.turnDirection, r1, pts[4], pts[6], pts[5]]);

  pts = gen_points(startAngle + sweepAngle - Math.PI, curve.turnDirection * -1);
  curve.curves.push([Math.PI / 2 * curve.turnDirection, r1, pts[6], pts[4], pts[5]]);
  if (straightLength) curve.curves.push([null, null, pts[4], pts[3], null]);
  curve.curves.push([c / 2 * -curve.turnDirection, r2, pts[3], pts[2], pts[1]]);
  curve.curves.push([c / 2 * -curve.turnDirection, r2, pts[2], pts[0], pts[1]]);

  curve.length = 0;
  for (const seg of curve.curves) {
    if (seg[0] === null || seg[0] === undefined) curve.length += getLength(seg[2], seg[3]);
    else curve.length += Math.abs(seg[0]) * seg[1];
  }

  curve.angularPoint = position;
  curve.lineLength = getLength(curve.angularPoint, curve.curves[curve.curves.length - 1][3]);
  return curve;
}

/* Export to global scope (classic scripts) */
window.TLCGeo = {
  interpolateArc, interpolateLine, subdivideDistance, fractionToRgb, fractionToHex,
  getAngle, getVector, getLength, getLineIntersection, getSweepAngle,
  getSweepAngleFromPoints, getVectorAngle, getEulerArcLength, snapToGrid,
  getCurveData, distanceToCoords, measureTrackLength, roundPolygon,
  euler_from_points, euler_curve, hairpin, Curve, bisectRight, mod,
  radians, degrees, minCpDistance, traceSmoothPath,
};
