/* =========================================================================
 * Track Layout Creator + — Web Port
 * generators.js — procedural track generators (port of generateMathTrack /
 *                generateRandomLayout from the MIT-licensed TLC+ source).
 *
 * Original tool: Copyright (c) 2017 eran0004, (c) 2026 daydrive7 (MIT)
 * ========================================================================= */
'use strict';

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randUniform(min, max) { return Math.random() * (max - min) + min; }

/* Offline math generator (generateRandomLayout in the original) */
function generateRandomLayout() {
  const polygon = [];
  const numPoints = randInt(12, 18);
  const rawPoints = [];
  for (let i = 0; i < numPoints; i++) rawPoints.push([randInt(-400, 400), randInt(-400, 400)]);
  const cx = rawPoints.reduce((s, p) => s + p[0], 0) / numPoints;
  const cy = rawPoints.reduce((s, p) => s + p[1], 0) / numPoints;
  rawPoints.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));

  for (const [x, y] of rawPoints) {
    polygon.push(makeCoordinate(x, y, 0, randInt(40, 120), -1, 1));
  }
  return { polygon: polygon, circuit: true };
}

/* Style-specific math generator (generateMathTrack in the original) */
function generateMathTrack(style) {
  const polygon = [];
  const points = [];
  let areaX, areaY, minRad, maxRad, irregularity, numPoints;

  if (style === 'gp') {
    numPoints = randInt(12, 18);
    areaX = 600; areaY = 400;
    minRad = 40; maxRad = 140;
    irregularity = 0.6;
  } else if (style === 'tech') {
    numPoints = randInt(18, 26);
    areaX = 300; areaY = 300;
    minRad = 20; maxRad = 60;
    irregularity = 0.3;
  } else if (style === 'oval') {
    numPoints = 4;
    areaX = 700; areaY = 300;
    minRad = 100; maxRad = 200;
    irregularity = 0.1;
  } else if (style === 'rally') {
    numPoints = randInt(38, 55);
    const startY = -1100, endY = 1100;
    const stepY = (endY - startY) / (numPoints - 1);
    let currX = randInt(-200, 200);
    for (let i = 0; i < numPoints; i++) {
      const currY = startY + i * stepY;
      currX += randUniform(-250, 250);
      currX = Math.max(-1000, Math.min(1000, currX));
      points.push([currX, currY]);
    }
  } else { // chaos
    numPoints = randInt(8, 30);
    areaX = 500; areaY = 500;
    minRad = 10; maxRad = 150;
    irregularity = 0.8;
  }

  if (style !== 'rally') {
    for (let i = 0; i < numPoints; i++) {
      let angle = (2 * Math.PI * i) / numPoints;
      const distX = areaX * (1 - irregularity / 2 + Math.random() * irregularity);
      const distY = areaY * (1 - irregularity / 2 + Math.random() * irregularity);
      if (style === 'oval') angle += Math.PI / 4;
      let x = Math.cos(angle) * distX;
      let y = Math.sin(angle) * distY;
      const noise = (style !== 'oval') ? 50 : 0;
      x += randUniform(-noise, noise);
      y += randUniform(-noise, noise);
      points.push([x, y]);
    }
  }

  for (const pt of points) {
    let r;
    if (style === 'rally') {
      r = randUniform(35, 90);
    } else {
      const distFromCenter = Math.sqrt(pt[0] ** 2 + pt[1] ** 2);
      const normDist = distFromCenter / Math.max(areaX, areaY);
      r = minRad + (maxRad - minRad) * normDist;
      r *= randUniform(0.8, 1.2);
    }
    polygon.push(makeCoordinate(pt[0], pt[1], 0, r, -1, 1));
  }

  const circuit = (style === 'rally') ? false : true;
  return { polygon: polygon, circuit: circuit };
}

window.TLCGen = { generateRandomLayout, generateMathTrack };
