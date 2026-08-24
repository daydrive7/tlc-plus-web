/* =========================================================================
 * Track Layout Creator + — Web Port
 * construct.js — builds TED data structures from the editable polygon
 *               (port of the construct_* pipeline in the MIT-licensed
 *               TLC+ source v1.2.0-beta2).
 *
 * Original tool: Copyright (c) 2017 eran0004, (c) 2026 daydrive7 (MIT)
 * ========================================================================= */
'use strict';

/* All functions take `S` — the shared settings/state object, which mirrors
 * the tk variables of the original app. */

function constructCP(polygon, curves, S) {
  function globalCamber(thisCurve, referenceAngle, referenceRadius) {
    let minLen;
    if (thisCurve.type === 'euler') minLen = thisCurve.length;
    else minLen = Math.abs(referenceAngle) * referenceRadius * 2;
    let camber = Math.min(S.camberRate * minLen / 2, S.maxCamberAngle);
    const turnThreshold = radians(30);
    if (Math.abs(thisCurve.sweepAngle) < turnThreshold) {
      camber *= Math.abs(thisCurve.sweepAngle) / turnThreshold;
    }
    return camber;
  }

  if (curves === undefined || curves === null) {
    curves = roundPolygon(polygon, S.circuit);
  }
  S.cornerCount = curves.length;

  const bankRate = S.camberRate;
  const maxBankAngle = S.maxCamberAngle;

  let startPoint, startZ;
  if (S.circuit) {
    startPoint = curves[curves.length - 1].end;
    startZ = polygon[0].z;
  } else {
    startPoint = polygon[0].xy;
    startZ = polygon[0].z;
  }

  const CPS = [makeCP(startPoint, null, 0, null, null, null, 0, 0, startZ)];

  for (let index = 0; index < curves.length; index++) {
    const thisCurve = curves[index];
    const polyIndex = (index + 1) % polygon.length;
    const targetZ = polygon[polyIndex].z;

    const prevCurve = curves[(index - 1 + curves.length) % curves.length];
    const nextCurve = curves[(index + 1) % curves.length];
    let camber = polygon[polyIndex].camber;

    const prevStraightLength = getLength(prevCurve.end, thisCurve.start);
    const nextStraightLength = getLength(thisCurve.end, nextCurve.start); void nextStraightLength;
    if (prevStraightLength > 0.001) {
      CPS.push(makeCP(thisCurve.start, null, 0, null, null, null, 0, 0, targetZ));
    } else {
      CPS[CPS.length - 1].xy = thisCurve.start;
    }

    // reference curve for camberFactor
    const referenceCurve = thisCurve.curves[thisCurve.segments] ||
                           thisCurve.curves[Math.floor(thisCurve.curves.length / 2)];
    const referenceAngle = referenceCurve ? referenceCurve[0] : 0;
    const referenceRadius = referenceCurve ? referenceCurve[1] : 1;

    if (camber === -1) camber = globalCamber(thisCurve, referenceAngle, referenceRadius);

    for (let i = 0; i < thisCurve.curves.length; i++) {
      const c = thisCurve.curves[i];
      const sweepAngle = c[0], radius = c[1];
      const start = c[2], end = c[3], center = c[4];

      if (sweepAngle === null || sweepAngle === undefined) {
        CPS.push(makeCP(end, null, 0, null, null, null, 0, 0, targetZ));
      } else {
        const startAngle = getAngle(center, start);
        let camberFactor = 0;
        try { camberFactor = 1 / (radius / referenceRadius); } catch (e) { camberFactor = 0; }
        if (camberFactor > 1) camberFactor = 1;

        if (radius > 0) {
          let formtype;
          if (sweepAngle > 0) formtype = 1;
          else formtype = 2147483649;
          formtype += i % 2;
          CPS.push(makeCP(end, center, formtype, radius, startAngle, sweepAngle, camber, camberFactor, targetZ));
        }
      }
    }
  }

  // add endpoint
  const endPoint = polygon[polygon.length - 1].xy;
  const lastCurveEnd = curves.length ? curves[curves.length - 1].curves[curves[curves.length - 1].curves.length - 1][3] : null;
  if (!S.circuit && (curves.length === 0 || lastCurveEnd !== endPoint)) {
    CPS.push(makeCP(endPoint, null, 0, null, null, null, 0, 0, polygon[polygon.length - 1].z));
  }

  return CPS;
}

function constructBank(CPS) {
  const BANKS = [];
  let cumVlen = 0.0;
  let cumDivnum = 0;

  for (let index = 1; index < CPS.length; index++) {
    const thisCp = CPS[index];
    const prev = CPS[index - 1];

    let vlen, corner;
    if (thisCp.formtype === 0 || thisCp.formtype === 3) {
      vlen = getLength(prev.xy, thisCp.xy);
      corner = 0;
    } else {
      vlen = Math.abs(thisCp.sweepAngle * thisCp.radius);
      if (thisCp.sweepAngle === 0) corner = 0;
      else corner = thisCp.sweepAngle / Math.abs(thisCp.sweepAngle);
    }

    let divNum = Math.ceil(vlen / 8.0);
    if (divNum < 6) divNum = 6;

    const vpos = cumVlen;
    const unk = cumDivnum;
    cumVlen += vlen;
    cumDivnum += divNum;

    const bankValue = thisCp.camber * thisCp.camberFactor * corner;

    BANKS.push({
      m_bank: bankValue, m_shiftPrev: null, m_shiftNext: null,
      divNum: divNum, unk: unk, vpos: vpos, vlen: vlen, corner: corner,
    });
  }

  // calculate shift lengths
  const nBanks = BANKS.length;
  for (let index = 0; index < nBanks; index++) {
    const bank = BANKS[index];
    const prevBank = BANKS[(index - 1 + nBanks) % nBanks];
    const minVlen = Math.min(prevBank.vlen, bank.vlen);
    const shift = minVlen * 0.5;
    prevBank.m_shiftNext = shift;
    bank.m_shiftPrev = shift;
  }
  return BANKS;
}

function applyIncludeHeightLengths(BANKS, HEIGHTS) {
  let cum2d = 0.0, cum3d = 0.0;
  const nHeights = HEIGHTS.length;
  for (const bank of BANKS) {
    const vlen2d = bank.vlen;
    const div = bank.divNum;
    const step = div ? vlen2d / div : 0.0;
    let vlen3d = 0.0;
    for (let k = 0; k < div; k++) {
      const i1 = bank.unk + k + 1;
      const dz = (i1 < nHeights) ? HEIGHTS[i1] - HEIGHTS[i1 - 1] : 0.0;
      vlen3d += Math.sqrt(step * step + dz * dz);
    }
    bank.vpos2d = cum2d;
    bank.vlen2d = vlen2d;
    bank.vpos3d = cum3d;
    bank.vlen3d = vlen3d;
    bank.vpos = cum3d;
    bank.vlen = vlen3d;
    cum2d += vlen2d;
    cum3d += vlen3d;
  }
  return cum3d;
}

function distToIncludeHeight(BANKS, distance) {
  let d = distance;
  for (let index = 0; index < BANKS.length; index++) {
    const bank = BANKS[index];
    const vlen2d = (bank.vlen2d !== undefined) ? bank.vlen2d : bank.vlen;
    if (d <= vlen2d || index === BANKS.length - 1) {
      let fraction = vlen2d ? d / vlen2d : 0.0;
      fraction = Math.max(0.0, Math.min(1.0, fraction));
      return bank.vpos3d + bank.vlen3d * fraction;
    }
    d -= vlen2d;
  }
  return BANKS[BANKS.length - 1].vpos3d + BANKS[BANKS.length - 1].vlen3d;
}

function distFromIncludeHeight(BANKS, distance) {
  let d = distance;
  for (let index = 0; index < BANKS.length; index++) {
    const bank = BANKS[index];
    const vlen3d = (bank.vlen3d !== undefined) ? bank.vlen3d : bank.vlen;
    if (d <= vlen3d || index === BANKS.length - 1) {
      let fraction = vlen3d ? d / vlen3d : 0.0;
      fraction = Math.max(0.0, Math.min(1.0, fraction));
      return bank.vpos2d + bank.vlen2d * fraction;
    }
    d -= vlen3d;
  }
  return BANKS[BANKS.length - 1].vpos2d + BANKS[BANKS.length - 1].vlen2d;
}

function getManualZNodes(CPS) {
  const zNodes = [[0, CPS[0].z]];
  let currentDist = 0;
  for (let index = 1; index < CPS.length; index++) {
    const thisCp = CPS[index];
    const prev = CPS[index - 1];
    let length;
    if (thisCp.seg_len !== undefined && thisCp.seg_len !== null) length = thisCp.seg_len;
    else if (thisCp.formtype === 0 || thisCp.formtype === 3) length = getLength(prev.xy, thisCp.xy);
    else length = Math.abs(thisCp.radius * thisCp.sweepAngle);
    currentDist += length;
    zNodes.push([currentDist, thisCp.z]);
  }
  return zNodes;
}

function calculateManualZ(dist, zNodes, inFactor, outFactor, smooth) {
  if (!zNodes) return 0;
  for (let i = 0; i < zNodes.length - 1; i++) {
    const [d1, z1] = zNodes[i];
    const [d2, z2] = zNodes[i + 1];
    if (d1 <= dist && dist <= d2) {
      if (d2 === d1) return z1;
      const rawFraction = (dist - d1) / (d2 - d1);
      let fraction;
      if (z2 > z1) { // ramping UP
        if (inFactor <= 0.001) fraction = (rawFraction < 0.999) ? 0.0 : 1.0;
        else {
          const startRamp = 1.0 - inFactor;
          fraction = (rawFraction <= startRamp) ? 0.0 : (rawFraction - startRamp) / inFactor;
        }
      } else if (z2 < z1) { // ramping DOWN
        if (outFactor <= 0.001) fraction = (rawFraction > 0.001) ? 1.0 : 0.0;
        else fraction = (rawFraction >= outFactor) ? 1.0 : rawFraction / outFactor;
      } else fraction = rawFraction;

      fraction = Math.max(0.0, Math.min(1.0, fraction));
      if (smooth && fraction > 0.0 && fraction < 1.0) {
        fraction = fraction * fraction * (3 - 2 * fraction);
      }
      return z1 + (z2 - z1) * fraction;
    }
  }
  return zNodes[zNodes.length - 1][1];
}

/* Terrain height at a track distance — min of the two border edges */
function getHeight(CPS, distance, borderWidth, heightMap, alt) {
  const [x, y, angle] = distanceToCoords(CPS, distance);
  const radius = borderWidth / 2;
  const xOffset = radius * Math.cos(angle + Math.PI / 2);
  const yOffset = radius * -Math.sin(angle + Math.PI / 2);
  const h = [];
  for (const i of [-1, 1]) {
    const coords = [x + xOffset * i, y + yOffset * i];
    h.push(heightMap.coordToFraction(coords[0], coords[1], 'm', alt));
  }
  return Math.min(h[0], h[1]);
}

/* ---- Elevation smoothing (findSlopes + roundCorners) ---- */
function smoothenHeights(heightsList, tolerance, minLen, maxLen, flatten) {
  tolerance = (tolerance === undefined) ? 0.04 : tolerance;
  minLen = (minLen === undefined) ? 5 : minLen;
  maxLen = (maxLen === undefined) ? 60 : maxLen;
  flatten = (flatten === undefined) ? true : flatten;

  function findSlopes(heightsList, tol, minL, maxL, fltn) {
    function calcSlope(s) {
      const x1 = s[0][0], z1 = s[0][1], x2 = s[s.length - 1][0], z2 = s[s.length - 1][1];
      return (x2 === x1) ? 0 : (z2 - z1) / (x2 - x1);
    }
    function flattenSlope(s) {
      const out = [];
      const x1 = s[0][0], z1 = s[0][1];
      const slope = calcSlope(s);
      for (const item of s) out.push([item[0], z1 + (item[0] - x1) * slope]);
      return out;
    }
    function flattenSlopes(slopes) {
      for (let i = 1; i < slopes.length - 1; i++) {
        const prevSlope = slopes[i - 1];
        const merged = flattenSlope([prevSlope[prevSlope.length - 1]].concat(slopes[i]));
        slopes[i] = merged.slice(1);
      }
      return slopes;
    }

    const heights = heightsList.slice();
    let slopes = [];

    while (heights.length >= minL) {
      const currentSlope = [];
      for (let i = 0; i < minL; i++) currentSlope.push(heights.shift());
      const slope = calcSlope(currentSlope);

      while (heights.length >= minL && currentSlope.length <= maxL) {
        const nextItem = heights[0];
        if (Math.abs(calcSlope([currentSlope[currentSlope.length - 1], nextItem]) - slope) < tol) {
          currentSlope.push(heights.shift());
        } else break;
      }

      if (heights.length < minL) {
        while (heights.length) currentSlope.push(heights.shift());
      }
      slopes.push(currentSlope);
    }

    if (fltn) slopes = flattenSlopes(slopes);
    return slopes;
  }

  function roundCorners(segs) {
    function spline(A, B, P) {
      const Ax = A[0], Az = A[1], m0 = A[2];
      const Bx = B[0], Bz = B[1], m1 = B[2];
      const Px = P[0];
      let p1 = 0, t = 0;
      if (Bx !== Ax) {
        p1 = (Bz - Az) / (Bx - Ax);
        t = (Px - Ax) / (Bx - Ax);
      }
      const i = (t ** 3 - 2 * t ** 2 + t) * m0;
      const ii = (-2 * t ** 3 + 3 * t ** 2) * p1;
      const iii = (t ** 3 - t ** 2) * m1;
      const p = i + ii + iii;
      const Pz = p * (Bx - Ax) + Az;
      return [Px, Pz];
    }

    const curves = [];
    for (let i = 0; i < segs.length - 1; i++) {
      const segA = segs[i], segB = segs[i + 1];
      const dataA = [segA[0], segA[segA.length - 1]];
      const dataB = [segB[0], segB[segB.length - 1]];
      for (const data of [dataA, dataB]) {
        const deltaX = data[1][0] - data[0][0];
        const deltaY = data[1][1] - data[0][1];
        data.push((deltaX === 0) ? 0 : deltaY / deltaX);
      }
      const indexA = -(Math.floor(segA.length / 2));
      const indexB = Math.floor(segB.length / 2);
      const A = [segA[segA.length + indexA][0], segA[segA.length + indexA][1], dataA[2]];
      const B = [segB[indexB][0], segB[indexB][1], dataB[2]];
      const curve = segA.slice(segA.length + indexA + 1).concat(segB.slice(0, indexB));
      for (const P of curve) curves.push(spline(A, B, P));
    }

    const ungroupedCurves = curves.map(c => [c[0], c[1]]);
    const ungroupedSegs = [];
    for (const seg of segs) for (const item of seg) ungroupedSegs.push([item[0], item[1]]);
    const curveXSet = new Set(ungroupedCurves.map(c => c[0]));
    const assembly = ungroupedSegs.filter(s => !curveXSet.has(s[0]));
    assembly.push(...ungroupedCurves);
    assembly.sort((a, b) => a[0] - b[0]);
    return assembly;
  }

  const segs = findSlopes(heightsList, tolerance, minLen, maxLen, flatten);
  return roundCorners(segs);
}

function constructHeights(CPS, BANKS, S) {
  const zNodes = getManualZNodes(CPS);
  const inFac = S.manualHeightIn;
  const outFac = S.manualHeightOut;
  const smooth = S.manualHeightEase;
  const isManual = S.manualHeight;

  const borderWidth = getBorderWidth(S);
  const roadRadius = S.roadWidth / 2;
  const heightMap = S.heightMap;
  const circuit = S.circuit;

  const BASE_HEIGHTS = [];
  const META_DATA = [];

  function getCamberData(bankIndex, bank) {
    const prevAngle = BANKS[bankIndex - 1] ? BANKS[bankIndex - 1].m_bank : 0;
    const nextIndex = (bankIndex + 1) % BANKS.length;
    const last = nextIndex === 0;
    const nextAngle = BANKS[nextIndex].m_bank;
    const angle = bank.m_bank;
    const prevShift = bank.m_shiftPrev;
    const nextShift = bank.m_shiftNext;

    let startAngle, endAngle;
    if (bankIndex === 0) {
      startAngle = angle; endAngle = angle;
    } else {
      if (bankIndex === 1) startAngle = prevAngle;
      else startAngle = prevAngle + (angle - prevAngle) / 2;
      if (last) endAngle = circuit ? nextAngle : angle;
      else endAngle = angle + (nextAngle - angle) / 2;
    }
    return [startAngle, angle, endAngle, prevShift, nextShift];
  }

  for (let index = 0; index < BANKS.length; index++) {
    const bank = BANKS[index];
    const bankLen = bank.vlen;
    const bankDiv = bank.divNum;
    const [startAngle, angle, endAngle, prevShift, nextShift] = getCamberData(index, bank);
    const nextShiftStart = bankLen - nextShift;

    function makeBase(i) {
      const relativeDistance = (i + 1) * (bankLen / bankDiv);
      const absoluteDistance = bank.vpos + relativeDistance;

      let camberAngle;
      if (relativeDistance < prevShift) {
        const shiftFactor = relativeDistance / prevShift;
        camberAngle = startAngle + (angle - startAngle) * shiftFactor;
      } else if (relativeDistance > nextShiftStart) {
        const shiftFactor = (relativeDistance - nextShiftStart) / nextShift;
        camberAngle = angle + (endAngle - angle) * shiftFactor;
      } else {
        camberAngle = angle;
      }

      const cAngleRad = radians(camberAngle);
      const camberOffset = Math.sin(Math.abs(cAngleRad)) * roadRadius * -S.camberAxis;

      const d = absoluteDistance;
      const zMap = getHeight(CPS, absoluteDistance, borderWidth, heightMap, false);

      BASE_HEIGHTS.push([d, zMap]);
      META_DATA.push([absoluteDistance, camberOffset]);
    }

    if (index === 0) makeBase(-1);
    for (let i = 0; i < bankDiv; i++) makeBase(i);
  }

  // Smooth ONLY the terrain
  const roughBase = BASE_HEIGHTS;
  const smoothBase = smoothenHeights(BASE_HEIGHTS);
  const mix = S.smoothMix;

  let mixedBase;
  if (!smoothBase.length) {
    mixedBase = roughBase;
  } else {
    const sx = smoothBase.map(p => p[0]);
    const sz = smoothBase.map(p => p[1]);
    function zSmoothAt(d) {
      if (d <= sx[0]) return sz[0];
      if (d >= sx[sx.length - 1]) return sz[sz.length - 1];
      const i = bisectRight(sx, d);
      const x0 = sx[i - 1], x1 = sx[i];
      const z0 = sz[i - 1], z1 = sz[i];
      if (x1 === x0) return z0;
      const f = (d - x0) / (x1 - x0);
      return z0 + (z1 - z0) * f;
    }
    mixedBase = roughBase.map(([d, z]) => [d, zSmoothAt(d) * mix + z * (1 - mix)]);
  }

  // Add manual heights + camber offsets
  const HEIGHTS = [];
  for (let i = 0; i < mixedBase.length; i++) {
    const d = mixedBase[i][0];
    const zMapSmoothed = mixedBase[i][1];
    const absDist = META_DATA[i][0];
    const camberOffset = META_DATA[i][1];

    let zFinal;
    if (isManual) {
      const zMan = calculateManualZ(absDist, zNodes, inFac, outFac, smooth);
      zFinal = zMapSmoothed + zMan + camberOffset;
    } else {
      zFinal = zMapSmoothed + camberOffset;
    }
    HEIGHTS.push([d, zFinal]);
  }
  return HEIGHTS;
}

function constructCheckpoints(BANKS, S) {
  const CHECKPOINTS = [];
  const track2d = BANKS.reduce((s, b) => s + ((b.vlen2d !== undefined) ? b.vlen2d : b.vlen), 0);
  const limit = S.circuit ? track2d : track2d - 1000.0;

  let cum = 0.0;
  let nextMark = 1000.0;
  for (const bank of BANKS) {
    cum += (bank.vlen2d !== undefined) ? bank.vlen2d : bank.vlen;
    while (nextMark <= limit + 1e-9 && cum >= nextMark - 1e-9) {
      CHECKPOINTS.push(distToIncludeHeight(BANKS, nextMark));
      nextMark += 1000.0;
    }
  }

  if (!CHECKPOINTS.length) {
    const mid2d = track2d * 0.5;
    CHECKPOINTS.push(distToIncludeHeight(BANKS, mid2d));
  }
  return CHECKPOINTS;
}

function constructRoads(BANKS, S) {
  const uuids = ROAD_TYPES[S.sceneryindex] || ROAD_TYPES_DATA.eifel;

  let startRoadsData;
  if (S.shortStraight) {
    startRoadsData = [uuids.startsprint[uuids.startlineP2P[0]]];
  } else if (S.circuit) {
    startRoadsData = uuids.start.slice();
  } else {
    startRoadsData = uuids.startsprint.slice();
  }

  let endRoadsData;
  if (S.circuit) endRoadsData = [];
  else endRoadsData = uuids.endsprint.slice();

  let tracklength = BANKS.reduce((s, b) => s + ((b.vlen2d !== undefined) ? b.vlen2d : b.vlen), 0);
  if (tracklength < 0.001) tracklength = 1.0;

  const baseLengthA = 100;
  let baseLengthB = baseLengthA * S.roadBaseLen;
  if (baseLengthB <= 0) baseLengthB = 100;

  const startLength = startRoadsData.reduce((s, r) => s + r[1], 0);
  const endLength = endRoadsData.reduce((s, r) => s + r[1], 0);
  let trackLenExcludingEnds = tracklength - (startLength + endLength);
  if (trackLenExcludingEnds < 0) trackLenExcludingEnds = 0;

  let div = 1 + Math.floor(trackLenExcludingEnds / baseLengthB);
  if (div < 2) div = 2;

  const roadLength = trackLenExcludingEnds / div;
  const roadFraction = roadLength / baseLengthA;

  const rawRoads = [];

  // A. Start
  for (const road of startRoadsData) rawRoads.push({ uuid: road[0], flag: 2, len: road[1] });

  // B. Mid
  const flag = S.roadFlag;
  const firstRoad = S.narrowRoad ? uuids.narrow[0] : uuids.normal[0];
  const midRoad = S.narrowRoad ? uuids.narrow[1] : uuids.normal[0];
  const finalRoad = S.narrowRoad ? uuids.narrow[2] : uuids.normal[0];

  rawRoads.push({ uuid: firstRoad[0], flag: flag, len: firstRoad[1] * roadFraction });

  let midDiv = div - 2;
  if (midDiv < 0) midDiv = 0;
  for (let i = 0; i < midDiv; i++) {
    rawRoads.push({ uuid: midRoad[0], flag: flag, len: midRoad[1] * roadFraction });
  }
  rawRoads.push({ uuid: finalRoad[0], flag: flag, len: finalRoad[1] * roadFraction });

  // C. End
  for (const road of endRoadsData) rawRoads.push({ uuid: road[0], flag: 2, len: road[1] });

  const currentVisualTotal = rawRoads.reduce((s, r) => s + r.len, 0);
  if (currentVisualTotal > 0) {
    const normalizationFactor = tracklength / currentVisualTotal;
    for (const r of rawRoads) r.len *= normalizationFactor;
  }

  if (S.circuit && Math.abs(S.pitOffset) > 0.001) {
    const offset = mod(S.pitOffset, tracklength);
    const cutPoint = tracklength - offset;

    let currentLen = 0, splitIndex = 0, targetRoadIdx = -1, remainder = 0;
    for (let i = 0; i < rawRoads.length; i++) {
      const r = rawRoads[i];
      const nextLen = currentLen + r.len;
      if (currentLen <= cutPoint && cutPoint < (nextLen - 0.001)) {
        targetRoadIdx = i;
        remainder = cutPoint - currentLen;
        if (remainder <= 0.001) splitIndex = i;
        else splitIndex = -999;
        break;
      }
      currentLen = nextLen;
    }

    if (splitIndex === -999 && targetRoadIdx !== -1) {
      const original = rawRoads[targetRoadIdx];
      const roadA = Object.assign({}, original);
      roadA.len = remainder;
      const roadB = Object.assign({}, original);
      roadB.len = original.len - remainder;
      rawRoads[targetRoadIdx] = roadA;
      rawRoads.splice(targetRoadIdx + 1, 0, roadB);
      splitIndex = targetRoadIdx + 1;
    }

    const rotated = rawRoads.slice(splitIndex).concat(rawRoads.slice(0, splitIndex));
    rawRoads.length = 0;
    rawRoads.push(...rotated);
  }

  // Remove zero-length / microscopic road segments
  const cleanedRoads = rawRoads.filter(r => r.len > 0.1);

  const ROADS = [];
  let vpos2 = 0;
  for (let i = 0; i < cleanedRoads.length; i++) {
    const r = cleanedRoads[i];
    const vpos = vpos2;
    vpos2 += r.len;
    if (i === cleanedRoads.length - 1) {
      if (Math.abs(vpos2 - tracklength) < 0.01) vpos2 = tracklength;
    }
    ROADS.push({
      uuid: r.uuid, flag: r.flag, vlen: r.len,
      vposIncludeHeight: distToIncludeHeight(BANKS, vpos),
      vposIncludeHeight2: distToIncludeHeight(BANKS, vpos2),
    });
  }

  if (S.circuit && ROADS.length) {
    ROADS[ROADS.length - 1].vposIncludeHeight2 = 0;
  }
  return ROADS;
}

function calculateExactLineDist(roads, isStart, relativeToFile, BANKS, S) {
  const uuids = ROAD_TYPES[S.sceneryindex] || ROAD_TYPES_DATA.eifel;
  let targetUuid = null;
  let lineFactor = 0.5;
  let distInBlock = 0.0;

  if (isStart) {
    if (S.shortStraight) {
      const [idx, factor] = uuids.startlineP2P;
      lineFactor = factor;
      const src = uuids.startsprint;
      if (idx < src.length) {
        targetUuid = src[idx][0];
        distInBlock = src[idx][1] * lineFactor;
      }
    } else if (S.circuit) {
      const [idx, factor] = uuids.startline;
      lineFactor = factor;
      const src = uuids.start;
      if (idx < src.length) {
        targetUuid = src[idx][0];
        for (let i = 0; i < idx; i++) distInBlock += src[i][1];
        distInBlock += src[idx][1] * lineFactor;
      }
    } else {
      const [idx, factor] = uuids.startlineP2P;
      lineFactor = factor;
      const src = uuids.startsprint;
      if (idx < src.length) {
        targetUuid = src[idx][0];
        for (let i = 0; i < idx; i++) distInBlock += src[i][1];
        distInBlock += src[idx][1] * lineFactor;
      }
    }
  } else {
    if (S.circuit) {
      if (relativeToFile) return 0.0;
      const baseDist = S.pitOffset;
      if (S.trackLength > 0) return mod(baseDist, S.trackLength);
      return baseDist;
    }
    const [idx, factor] = uuids.finishlineP2P;
    lineFactor = factor;
    const src = uuids.endsprint;
    if (idx < src.length) {
      targetUuid = src[idx][0];
      for (let i = 0; i < idx; i++) distInBlock += src[i][1];
      distInBlock += src[idx][1] * lineFactor;
      if (!S.circuit) distInBlock += S.trackLength;
    }
  }

  let baseDist = 0.0;
  let found = false;

  if (targetUuid !== null && BANKS && BANKS.length) {
    for (const road of roads) {
      if (road.uuid === targetUuid) {
        const sD = distFromIncludeHeight(BANKS, road.vposIncludeHeight);
        const eD = distFromIncludeHeight(BANKS, road.vposIncludeHeight2);
        let segLen;
        if (eD === 0) segLen = S.trackLength - sD;
        else if (eD < sD) segLen = (S.trackLength - sD) + eD;
        else segLen = eD - sD;

        const segmentRelativeDist = segLen * lineFactor;
        if (relativeToFile) {
          baseDist = sD + segmentRelativeDist;
          if (isStart) baseDist += S.startOffset;
        } else {
          found = false;
          break;
        }
        found = true;
        break;
      }
    }
  }

  if (!found) {
    if (S.trackLength > 0.001) {
      let startLen;
      if (S.shortStraight) startLen = uuids.startsprint[uuids.startlineP2P[0]][1];
      else if (S.circuit) startLen = uuids.start.reduce((s, r) => s + r[1], 0);
      else startLen = uuids.startsprint.reduce((s, r) => s + r[1], 0);

      const endLen = S.circuit ? 0 : uuids.endsprint.reduce((s, r) => s + r[1], 0);

      let trackLenExcludingEnds = S.trackLength - (startLen + endLen);
      if (trackLenExcludingEnds < 0) trackLenExcludingEnds = 0;

      let baseLengthB = 100 * S.roadBaseLen;
      if (baseLengthB <= 0) baseLengthB = 100;
      let div = 1 + Math.floor(trackLenExcludingEnds / baseLengthB);
      if (div < 2) div = 2;

      const roadFraction = (trackLenExcludingEnds / div) / 100.0;

      const firstR = (S.narrowRoad ? uuids.narrow[0][1] : uuids.normal[0][1]);
      const midR = (S.narrowRoad ? uuids.narrow[1][1] : uuids.normal[0][1]);
      const finR = (S.narrowRoad ? uuids.narrow[2][1] : uuids.normal[0][1]);

      let midDiv = div - 2;
      if (midDiv < 0) midDiv = 0;

      const midLen = (firstR * roadFraction) + (midR * roadFraction * midDiv) + (finR * roadFraction);
      const currentVisualTotal = startLen + midLen + endLen;
      if (currentVisualTotal > 0) {
        distInBlock *= (S.trackLength / currentVisualTotal);
      }
    }

    const appliedPitOffset = S.circuit ? S.pitOffset : 0.0;
    if (isStart) baseDist = distInBlock + S.startOffset + appliedPitOffset;
    else baseDist = distInBlock + appliedPitOffset;
  }

  if (S.trackLength > 0) return mod(baseDist, S.trackLength);
  return baseDist;
}

function constructHeader(cps, banks, heights, checkpoints, roads, decorations, S) {
  const HEADER = makeHeaderSpec();

  HEADER['sceneryindex'][3] = S.sceneryindex;

  const roadWidthOffset = 0;
  const actualWidth = S.roadWidth + roadWidthOffset;
  HEADER['roadwidth'][3] = actualWidth;
  HEADER['m_trackwidth_a'][3] = actualWidth / 2.0;
  HEADER['m_trackwidth_b'][3] = actualWidth / 2.0;

  const exactPhysicsLength = banks.reduce((s, b) => s + b.vlen, 0);
  HEADER['tracklength'][3] = exactPhysicsLength;

  HEADER['datetime'][3] = PDIDATETIME(new Date());
  HEADER['isloopcourse'][3] = S.circuit ? 1 : 0;

  if (banks.length) {
    const straightLens = banks.filter(b => b.corner === 0).map(b => b.vlen);
    HEADER['homestraightlength'][3] = straightLens.length ? Math.max(...straightLens) : 0;
  } else {
    HEADER['homestraightlength'][3] = 0;
  }

  if (heights.length) {
    HEADER['elevationdifference'][3] = Math.max(...heights) - Math.min(...heights);
  } else {
    HEADER['elevationdifference'][3] = 0;
  }

  HEADER['cornercount'][3] = S.cornerCount;

  const finishline2d = calculateExactLineDist(roads, false, true, banks, S);
  const startline2d = calculateExactLineDist(roads, true, true, banks, S);
  HEADER['finishline'][3] = finishline2d ? distToIncludeHeight(banks, finishline2d) : 0.0;
  HEADER['startline'][3] = startline2d ? distToIncludeHeight(banks, startline2d) : 0.0;

  // offsets
  const cpsOffset = 156;
  const cpsEntryCount = cps.length;
  const reservedsOffset = cpsOffset + cpsEntryCount * 20;
  const banksOffset = reservedsOffset;
  const banksEntryCount = banks.length;
  const heightsOffset = banksOffset + banksEntryCount * 28;
  const heightsEntryCount = heights.length;
  const checkpointsOffset = heightsOffset + heightsEntryCount * 4;
  const checkpointsEntryCount = checkpoints.length;
  const roadsOffset = checkpointsOffset + checkpointsEntryCount * 4;
  const roadsEntryCount = roads.length;
  const decorationsOffset = roadsOffset + roadsEntryCount * 20;
  const decorationsEntryCount = decorations.length;

  HEADER['cps_offset'][3] = cpsOffset;
  HEADER['cps_entry_count'][3] = cpsEntryCount;
  HEADER['reserved1_offset'][3] = reservedsOffset;
  HEADER['reserved1_entry_count'][3] = 0;
  HEADER['reserved2_offset'][3] = reservedsOffset;
  HEADER['reserved2_entry_count'][3] = 0;
  HEADER['reserved3_offset'][3] = reservedsOffset;
  HEADER['reserved3_entry_count'][3] = 0;
  HEADER['banks_offset'][3] = banksOffset;
  HEADER['banks_entry_count'][3] = banksEntryCount;
  HEADER['heights_offset'][3] = heightsOffset;
  HEADER['heights_entry_count'][3] = heightsEntryCount;
  HEADER['checkpoints_offset'][3] = checkpointsOffset;
  HEADER['checkpoints_entry_count'][3] = checkpointsEntryCount;
  HEADER['roads_offset'][3] = roadsOffset;
  HEADER['roads_entry_count'][3] = roadsEntryCount;
  HEADER['decorations_offset'][3] = decorationsOffset;
  HEADER['decorations_entry_count'][3] = decorationsEntryCount;

  return HEADER;
}

function getBorderWidth(S) {
  const borderSize = S.narrowRoad ? 16 : 40;
  return S.roadWidth + borderSize;
}

function getMainstraightDistance(S) {
  const uuids = ROAD_TYPES[S.sceneryindex] || ROAD_TYPES_DATA.eifel;
  let roads;
  if (S.shortStraight) roads = [uuids.startsprint[uuids.startlineP2P[0]]];
  else if (S.circuit) roads = uuids.start;
  else roads = uuids.startsprint;
  return roads.reduce((s, r) => s + r[1], 0);
}

function getFinishlineDistance(S) {
  if (S.circuit) {
    if (S.trackLength > 0) return mod(S.pitOffset, S.trackLength);
    return S.pitOffset;
  }
  const uuids = ROAD_TYPES[S.sceneryindex] || ROAD_TYPES_DATA.eifel;
  const [lineIndex, lineFactor] = uuids.finishlineP2P;
  const roads = uuids.endsprint;
  const roadSum = roads.reduce((s, r) => s + r[1], 0);
  let distance = 0;
  for (let i = 0; i < lineIndex; i++) distance += roads[i][1];
  distance += roads[lineIndex][1] * lineFactor - roadSum;
  distance += S.trackLength;
  return distance;
}

function getStartlineDistance(S) {
  return calculateExactLineDist([], true, false, null, S);
}

/* Full pipeline: polygon -> TED-ready TrackObject */
function constructTEDData(polygon, S) {
  const CPS = constructCP(polygon, null, S);
  const m = measureTrackLength(CPS);
  S.trackLength = m.total;

  const BANKS = constructBank(CPS);
  const heightPairs = constructHeights(CPS, BANKS, S);
  const HEIGHTS = heightPairs.map(h => h[1]);
  applyIncludeHeightLengths(BANKS, HEIGHTS);
  const CHECKPOINTS = constructCheckpoints(BANKS, S);
  const ROADS = constructRoads(BANKS, S);
  const DECORATIONS = [];

  const HEADER = constructHeader(CPS, BANKS, HEIGHTS, CHECKPOINTS, ROADS, DECORATIONS, S);
  const track = new EditorTrackObject(HEADER, CPS, BANKS, HEIGHTS, CHECKPOINTS, ROADS, DECORATIONS);
  track.mod = HEIGHTS;
  return track;
}

/* Reverse-engineer a parsed TED file back into an editable polygon */
function tedToPolygon(ted) {
  const newPolygon = [];

  const isLoop = !!ted.header['isloopcourse'][3];
  let prevX = 0, prevY = 0;
  if (isLoop && ted.cps.length) {
    prevX = ted.cps[ted.cps.length - 1].x;
    prevY = ted.cps[ted.cps.length - 1].y;
  }

  for (let i = 0; i < ted.cps.length; i++) {
    const cp = ted.cps[i];
    const currX = cp.x, currY = cp.y;

    if (i === 0 && !isLoop) {
      prevX = currX; prevY = currY;
      newPolygon.push(makeCoordinate(currX, currY, 0, 0, -1, 0));
      continue;
    }

    const formtype = cp.formtype;

    if (formtype !== 0 && formtype !== 3) {
      const centerX = cp.x2, centerY = cp.y2;
      const radius = Math.sqrt((currX - centerX) ** 2 + (currY - centerY) ** 2);

      const radVecStart = [prevX - centerX, prevY - centerY];
      const tanVecStart = [-radVecStart[1], radVecStart[0]];
      const radVecEnd = [currX - centerX, currY - centerY];
      const tanVecEnd = [-radVecEnd[1], radVecEnd[0]];

      let node;
      try {
        node = getLineIntersection(
          [[prevX, prevY], [prevX + tanVecStart[0], prevY + tanVecStart[1]]],
          [[currX, currY], [currX + tanVecEnd[0], currY + tanVecEnd[1]]]);
      } catch (e) {
        node = [(prevX + currX) / 2, (prevY + currY) / 2];
      }
      newPolygon.push(makeCoordinate(node[0], node[1], 0, radius, -1, 1));
    }
    prevX = currX; prevY = currY;
  }
  return newPolygon;
}

window.TLCConstruct = {
  constructCP, constructBank, applyIncludeHeightLengths, distToIncludeHeight,
  distFromIncludeHeight, getManualZNodes, calculateManualZ, getHeight, smoothenHeights,
  constructHeights, constructCheckpoints, constructRoads, calculateExactLineDist,
  constructHeader, getBorderWidth, getMainstraightDistance, getFinishlineDistance,
  getStartlineDistance, constructTEDData, tedToPolygon,
};
