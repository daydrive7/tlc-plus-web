/* =========================================================================
 * Track Layout Creator + — Web Port
 * isoview.js — rotatable isometric 3D preview (port of
 *             resources/isometricProjection.py from the MIT-licensed TLC+).
 *
 * Original tool: Copyright (c) 2017 eran0004, (c) 2026 daydrive7 (MIT)
 * ========================================================================= */
'use strict';

class IsoView {
  constructor(opts) {
    this.CPS = opts.CPS;
    this.heightMap = opts.heightMap;
    this.roadWidth = opts.roadWidth;
    this.borderWidth = opts.borderWidth;
    this.trackLength = opts.trackLength;
    this.colors = opts.colors;       // theme colour bundle
    this.onClose = opts.onClose || function () {};

    this.gridResolution = 100;
    this.gridFactor = 1;
    this.xLines = [];
    this.zlist = [];
    this.zmin = 0.0;
    this.cornerPoints = [];
    this.scale = 1;
    this.rotation = 0;
    this.zScale = 4;
    this.displayGrid = true;
    this.displayContours = true;
    this.toolMode = 'rotate';

    this.generateData(opts.bbox);
    this.generateTrackData();

    this.buildDom();
  }

  buildDom() {
    const overlay = document.createElement('div');
    overlay.className = 'iso-overlay';
    overlay.innerHTML =
      '<div class="iso-window">' +
      '  <div class="iso-header">' +
      '    <span class="iso-title">' + (window.tr ? tr('Isometric view') : 'Isometric view') + '</span>' +
      '    <span class="iso-hint">' + (window.tr ? tr('Drag = rotate | Right-drag = pan | Wheel = zoom | R = reset | P = save PNG') : '') + '</span>' +
      '    <button class="iso-close" title="' + (window.tr ? tr('Close') : 'Close') + '">&times;</button>' +
      '  </div>' +
      '  <div class="iso-toolbar">' +
      '    <button data-iso-tool="pan" title="' + tr('Panning tool') + '">&#9995;</button>' +
      '    <button data-iso-tool="rotate" class="active" title="' + tr('Rotate tool') + '">&#8635;</button>' +
      '    <button data-iso-zoom="in" title="' + tr('Zoom in') + '">+</button>' +
      '    <button data-iso-zoom="out" title="' + tr('Zoom out') + '">&minus;</button>' +
      '    <button data-iso-shot title="' + tr('Save screenshot') + '">&#128247;</button>' +
      '  </div>' +
      '  <canvas class="iso-canvas"></canvas>' +
      '</div>';
    document.body.appendChild(overlay);
    this.overlay = overlay;
    this.canvas = overlay.querySelector('.iso-canvas');
    this.resize();

    overlay.querySelector('.iso-close').addEventListener('click', () => this.close());
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) this.close(); });
    for (const btn of overlay.querySelectorAll('[data-iso-tool]')) {
      btn.addEventListener('click', () => {
        this.toolMode = btn.dataset.isoTool;
        overlay.querySelectorAll('[data-iso-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    }
    overlay.querySelector('[data-iso-zoom="in"]').addEventListener('click', () => this.zoom('in'));
    overlay.querySelector('[data-iso-zoom="out"]').addEventListener('click', () => this.zoom('out'));
    overlay.querySelector('[data-iso-shot]').addEventListener('click', () => this.exportPNG());

    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', this._moveHandler = (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', this._upHandler = (e) => this.onMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 'in' : 'out'); }, { passive: false });
    window.addEventListener('keydown', this._keyHandler = (e) => {
      if (!this.overlay.parentNode) return;
      if (e.key === 'r' || e.key === 'R') this.resetView();
      if (e.key === 'p' || e.key === 'P') this.exportPNG();
      if (e.key === 'Escape') this.close();
    });
    window.addEventListener('resize', this._resizeHandler = () => this.resize());

    this.resetView();
  }

  close() {
    window.removeEventListener('mousemove', this._moveHandler);
    window.removeEventListener('mouseup', this._upHandler);
    window.removeEventListener('keydown', this._keyHandler);
    window.removeEventListener('resize', this._resizeHandler);
    this.overlay.remove();
    this.onClose();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(this.canvas.clientWidth * dpr);
    this.canvas.height = Math.floor(this.canvas.clientHeight * dpr);
    this.dpr = dpr;
    this.projectAndDraw();
  }

  /* Sample the heightmap on a square grid covering bbox */
  generateData(bbox) {
    const xsize = bbox[2] - bbox[0];
    const ysize = bbox[3] - bbox[1];
    this.center = [bbox[0] + xsize / 2, bbox[1] + ysize / 2];
    const squareSize = Math.max(xsize, ysize);
    this.bbox = [this.center[0] - squareSize / 2, this.center[1] - squareSize / 2,
                 this.center[0] + squareSize / 2, this.center[1] + squareSize / 2];
    this.scale = 700 / squareSize;

    const [x0, y0, x1, y1] = this.bbox;
    const sub = subdivideDistance(bbox[0], bbox[2], 40);
    const xSteps = sub.points.slice();
    const ySteps = subdivideDistance(bbox[1], bbox[3], 40).points;
    this.gridResolution = sub.step;
    this.gridFactor = sub.factor;

    xSteps.unshift(x0); xSteps.push(x1);
    ySteps.unshift(y0); ySteps.push(y1);

    this.xLines = [];
    this.zlist = [];
    for (const y of ySteps) {
      const line = [];
      for (const x of xSteps) {
        const z = this.heightMap.coordToFraction(x, y, 'm', true);
        this.zlist.push(z);
        line.push([x, y, z]);
      }
      this.xLines.push(line);
    }
    this.zmin = this.zlist.length ? Math.min(...this.zlist) : 0.0;
    this.cornerPoints = [this.xLines[0][0], this.xLines[0][this.xLines[0].length - 1],
                         this.xLines[this.xLines.length - 1][this.xLines[0].length - 1],
                         this.xLines[this.xLines.length - 1][0]];

    const contourResult = contours(this.heightMap, Math.floor(this.gridResolution) || 100, this.bbox, 10);
    this.contourDict = contourResult[0];
    this.contourZmin = contourResult[1];
    this.contourZmax = contourResult[2];
    if (this.contourDict) {
      this.contourZrange = this.contourZmax - this.contourZmin;
      if (this.contourZrange === 0) this.contourZrange = 1;
    } else {
      this.contourZrange = 1;
    }
  }

  generateTrackData() {
    this.centerLine = []; this.baseLine = []; this.leftLine = []; this.rightLine = [];
    this.leftBorder = []; this.rightBorder = []; this.simplifiedLine = [];

    if (this.CPS.length > 1) {
      let d = 0;
      const trackResolution = 10 / this.scale;
      let cL = [], bL = [], lL = [], rL = [], lB = [], rB = [];

      const flush = () => {
        if (cL.length > 1) {
          this.centerLine.push(cL); this.baseLine.push(bL); this.leftLine.push(lL);
          this.rightLine.push(rL); this.leftBorder.push(lB); this.rightBorder.push(rB);
        }
        cL = []; bL = []; lL = []; rL = []; lB = []; rB = [];
      };

      while (d <= this.trackLength) {
        const [x, y, angle] = distanceToCoords(this.CPS, d);
        if (this.bbox[0] <= x && x <= this.bbox[2] && this.bbox[1] <= y && y <= this.bbox[3]) {
          const xOffset = Math.cos(angle + Math.PI / 2);
          const yOffset = -Math.sin(angle + Math.PI / 2);
          const z = this.heightMap.coordToFraction(x, y, 'm', true);
          cL.push([x, y, z]);
          bL.push([x, y, this.zmin]);
          lL.push([x + xOffset * this.roadWidth / 2, y + yOffset * this.roadWidth / 2, z]);
          rL.push([x - xOffset * this.roadWidth / 2, y - yOffset * this.roadWidth / 2, z]);
          lB.push([x + xOffset * this.borderWidth / 2, y + yOffset * this.borderWidth / 2, z]);
          rB.push([x - xOffset * this.borderWidth / 2, y - yOffset * this.borderWidth / 2, z]);
        } else {
          flush();
        }
        if (d < this.trackLength) {
          d += trackResolution;
          if (d > this.trackLength) d = this.trackLength;
        } else break;
      }
      flush();

      const sL = [];
      for (let i = 0; i <= 100; i++) {
        const d = this.trackLength / 100 * i;
        const [x, y] = distanceToCoords(this.CPS, d);
        const z = this.heightMap.coordToFraction(x, y, 'm', true);
        sL.push([x, y, z]);
      }
      this.simplifiedLine.push(sL);
    }
  }

  proj(pt) {
    const [x, y, z] = pt;
    const rot = this.rotation;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const scale = this.scale;
    const cx = this.center[0], cy = this.center[1];
    const zscale = scale * this.zScale;
    const zmin = this.zmin;
    const nHalf = Math.sqrt(3) / 2;
    const tx = (x - cx) * scale;
    const ty = (y - cy) * scale;
    const rx = tx * cosR + ty * sinR;
    const ry = -tx * sinR + ty * cosR;
    return [(rx - ry) * nHalf, (rx + ry) * 0.5 - (z - zmin) * zscale];
  }

  projFlat(x, y) {
    const rot = this.rotation;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const scale = this.scale;
    const cx = this.center[0], cy = this.center[1];
    const nHalf = Math.sqrt(3) / 2;
    const tx = (x - cx) * scale;
    const ty = (y - cy) * scale;
    const rx = tx * cosR + ty * sinR;
    const ry = -tx * sinR + ty * cosR;
    return [(rx - ry) * nHalf, (rx + ry) * 0.5];
  }

  resetView() {
    this.rotation = 0;
    this.drawBasic();
    this.projectAndDraw();
  }

  zoom(direction) {
    let scale = 1;
    if (direction === 'out') scale *= 0.75;
    else if (direction === 'in') scale /= 0.75;
    this.scale *= scale;
    this.projectAndDraw();
  }

  onMouseDown(e) {
    this.mouseLoc = { x: e.clientX, y: e.clientY };
    this.dragging = true;
    this.panMode = (e.button === 2 || this.toolMode === 'pan');
    if (this.panMode) this.panStart = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }

  onMouseMove(e) {
    if (!this.dragging) return;
    if (this.panMode) {
      this.panOffset = this.panOffset || { x: 0, y: 0 };
      this.panOffset.x += e.clientX - this.mouseLoc.x;
      this.panOffset.y += e.clientY - this.mouseLoc.y;
      this.mouseLoc = { x: e.clientX, y: e.clientY };
      this.projectAndDraw();
    } else {
      const deltaX = e.clientX - this.mouseLoc.x;
      this.rotation += deltaX * 0.005;
      this.mouseLoc = { x: e.clientX, y: e.clientY };
      this.drawBasic();
    }
  }

  onMouseUp() {
    if (this.dragging && !this.panMode) this.projectAndDraw();
    this.dragging = false;
  }

  applyView(ctx) {
    const dpr = this.dpr || 1;
    const w = this.canvas.width / dpr, h = this.canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(w / 2 + (this.panOffset ? this.panOffset.x : 0),
                  h / 2 + (this.panOffset ? this.panOffset.y : 0));
  }

  clear() {
    const ctx = this.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.colors.SILVER;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.applyView(ctx);
    return ctx;
  }

  drawBasic() {
    const ctx = this.clear();
    this.drawGrid(ctx, true);
    this.drawBase(ctx);
    if (this.CPS.length > 1) this.drawTrack(ctx, true);
  }

  projectAndDraw() {
    const ctx = this.clear();
    this.drawGrid(ctx, false);
    this.drawBase(ctx);
    if (this.displayContours) this.drawContours(ctx);
    if (this.CPS.length > 1) this.drawTrack(ctx, false);
  }

  drawGrid(ctx, basic) {
    const c = this.colors;
    let xLines;
    if (basic || !this.displayGrid) {
      xLines = [this.xLines[0], this.xLines[this.xLines.length - 1]].map(line => line.map(p => this.proj(p)));
    } else {
      xLines = this.xLines.map(line => line.map(p => this.proj(p)));
    }
    const wideLines = (this.gridFactor === 2.5) ? 4 : 5;

    const drawLines = (lines) => {
      for (let i = 0; i < lines.length; i++) {
        let color = c.DARK_SILVER, width = 0.5;
        if (i % wideLines === 0) width = 1;
        if (i % (2 * wideLines) === 0) color = c.DARKER_SILVER;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        const line = lines[i];
        ctx.moveTo(line[0][0], line[0][1]);
        for (let j = 1; j < line.length; j++) ctx.lineTo(line[j][0], line[j][1]);
        ctx.stroke();
      }
    };
    drawLines(xLines);
    const yLines = [];
    for (let i = 0; i < xLines[0].length; i++) {
      const col = xLines.map(line => line[i]);
      yLines.push(col);
    }
    drawLines(yLines);
  }

  drawBase(ctx) {
    const c = this.colors;
    ctx.strokeStyle = c.GREY;
    ctx.lineWidth = 0.5;
    const pts = [];
    for (const point of this.cornerPoints) {
      pts.push(this.proj(point));
      pts.push(this.projFlat(point[0], point[1]));
    }
    const lines = [
      [pts[0], pts[1]], [pts[2], pts[3]], [pts[4], pts[5]], [pts[6], pts[7]],
      [pts[1], pts[3], pts[5], pts[7], pts[1]],
    ];
    for (const line of lines) {
      ctx.beginPath();
      ctx.moveTo(line[0][0], line[0][1]);
      for (let j = 1; j < line.length; j++) ctx.lineTo(line[j][0], line[j][1]);
      ctx.stroke();
    }
  }

  drawContours(ctx) {
    if (!this.contourDict) return;
    const zmin = this.zmin;
    const zscale = this.scale * this.zScale;
    const rot = this.rotation;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const cx = this.center[0], cy = this.center[1];
    const nHalf = Math.sqrt(3) / 2;

    for (const elevationStr of Object.keys(this.contourDict)) {
      const elevation = parseFloat(elevationStr);
      const zfraction = (elevation - this.contourZmin) / this.contourZrange;
      const hexColor = fractionToHex(zfraction);
      const zOffset = (elevation - zmin) * zscale;

      for (const line of this.contourDict[elevationStr]) {
        ctx.strokeStyle = hexColor;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        const pts = [];
        for (let i = 0; i < line.length; i++) {
          const p = line[i];
          const tx = (p[0] - cx) * this.scale;
          const ty = (p[1] - cy) * this.scale;
          const rx = tx * cosR + ty * sinR;
          const ry = -tx * sinR + ty * cosR;
          pts.push([(rx - ry) * nHalf, (rx + ry) * 0.5 - zOffset]);
        }
        traceSmoothPath(ctx, pts);  // original: create_line(smooth=1)
        ctx.stroke();
      }
    }
  }

  drawTrack(ctx, basic) {
    const c = this.colors;
    const lines = basic ? [this.simplifiedLine]
      : [this.baseLine, this.leftLine, this.rightLine, this.leftBorder, this.rightBorder];

    for (let i = 0; i < lines.length; i++) {
      let fill, width;
      if (i === 0) { fill = c.GREY; }
      else if (i === 1 || i === 2) { fill = c.TRACK_TRACK; }
      else { fill = c.TRACK_BORDER; }
      width = 0.5;
      for (const line of lines[i]) {
        ctx.strokeStyle = fill;
        ctx.lineWidth = width + 0.5;
        ctx.beginPath();
        const pts = line.map(pt => this.proj(pt));
        traceSmoothPath(ctx, pts);  // original: create_line(smooth=1)
        ctx.stroke();
      }
    }
  }

  exportPNG() {
    const temp = document.createElement('canvas');
    temp.width = this.canvas.width;
    temp.height = this.canvas.height;
    const tctx = temp.getContext('2d');
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, temp.width, temp.height);
    tctx.drawImage(this.canvas, 0, 0);
    temp.toBlob((blob) => {
      downloadBlob(blob, 'iso_view.png');
    });
  }
}

/* Download helper */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

window.TLCIso = { IsoView, downloadBlob };
