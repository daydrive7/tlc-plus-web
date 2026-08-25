/* =========================================================================
 * Track Layout Creator + — Web Port
 * ui.js — menus, dialogs, sidebar wiring, file I/O and bootstrap
 *         (web port of the MIT-licensed TLC+ desktop app v1.2.0-beta2)
 *
 * Original tool: Copyright (c) 2017 eran0004, (c) 2026 daydrive7 (MIT)
 * ========================================================================= */
'use strict';

/* ------------------------------------------------------------------ */
/* Tooltips                                                           */
/* ------------------------------------------------------------------ */
let tooltipTimer = null;
function initTooltips() {
  const tooltip = document.getElementById('tooltip');
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip], [title]');
    if (!el) return;
    const text = el.dataset.tip || el.getAttribute('title');
    if (!text) return;
    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(() => {
      tooltip.textContent = text;
      tooltip.classList.remove('hidden');
      const rect = el.getBoundingClientRect();
      tooltip.style.left = Math.min(window.innerWidth - 240, rect.left + 20) + 'px';
      tooltip.style.top = (rect.bottom + 6) + 'px';
    }, 500);
  });
  document.addEventListener('mouseout', () => {
    clearTimeout(tooltipTimer);
    tooltip.classList.add('hidden');
  });
  document.addEventListener('mousedown', () => {
    clearTimeout(tooltipTimer);
    tooltip.classList.add('hidden');
  });
}

/* ------------------------------------------------------------------ */
/* Toasts and message boxes                                           */
/* ------------------------------------------------------------------ */
function toast(message, type, duration) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), duration || 3200);
}

function messageBox(title, message, buttons) {
  return new Promise((resolve) => {
    buttons = buttons || [tr('OK')];
    const layer = document.getElementById('modal-layer');
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML =
      '<div class="modal-window" role="dialog" aria-modal="true">' +
      '  <div class="modal-header"><span class="modal-title"></span>' +
      '    <button class="modal-close" aria-label="Close">&times;</button></div>' +
      '  <div class="modal-body"></div>' +
      '  <div class="modal-footer"></div>' +
      '</div>';
    backdrop.querySelector('.modal-title').textContent = title;
    const body = backdrop.querySelector('.modal-body');
    body.style.whiteSpace = 'pre-wrap';
    body.textContent = message;

    const footer = backdrop.querySelector('.modal-footer');
    buttons.forEach((label, i) => {
      const btn = document.createElement('button');
      btn.className = 'modal-btn' + (i === buttons.length - 1 && buttons.length > 1 ? '' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => { backdrop.remove(); resolve(i); });
      footer.appendChild(btn);
    });
    backdrop.querySelector('.modal-close').addEventListener('click', () => { backdrop.remove(); resolve(-1); });
    layer.appendChild(backdrop);
  });
}

/* ------------------------------------------------------------------ */
/* Generic modal helper                                               */
/* ------------------------------------------------------------------ */
function openModal(title, bodyBuilder, onOpen) {
  const layer = document.getElementById('modal-layer');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML =
    '<div class="modal-window" role="dialog" aria-modal="true">' +
    '  <div class="modal-header"><span class="modal-title"></span>' +
    '    <button class="modal-close" aria-label="Close">&times;</button></div>' +
    '  <div class="modal-body"></div>' +
    '</div>';
  backdrop.querySelector('.modal-title').textContent = title;
  const body = backdrop.querySelector('.modal-body');
  bodyBuilder(body, backdrop);
  backdrop.querySelector('.modal-close').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) backdrop.remove(); });
  layer.appendChild(backdrop);
  if (onOpen) onOpen(body, backdrop);
  return backdrop;
}

/* ------------------------------------------------------------------ */
/* Point properties dialog                                            */
/* ------------------------------------------------------------------ */
function editPointProperties() {
  if (!selectedPoints.length) return;
  const idx = selectedPoints[0];
  const p = polygon[idx];

  openModal(tr('Point Properties'), (body, backdrop) => {
    // Display values with sensible precision (keeps the UI readable) —
    // parsed back to full numbers on Apply.
    const fmt = (v, d) => String(parseFloat((+v).toFixed(d)));
    const fields = [
      ['X (m):', 'x', fmt(p.x, 2)],
      ['Y (m):', 'y', fmt(p.y, 2)],
      ['Z (Height m):', 'z', fmt(p.z, 2)],
      ['Radius (m):', 'radius', fmt(p.radius, 2)],
      ['Camber (\u00B0):', 'camber', fmt(p.camber, 1)],
      ['Segments:', 'segments', String(parseInt(p.segments))],
    ];
    const inputs = {};
    for (const [label, key, value] of fields) {
      const row = document.createElement('div');
      row.className = 'form-row';
      const lbl = document.createElement('label');
      lbl.textContent = tr(label);
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.value = value;
      row.appendChild(lbl); row.appendChild(input);
      body.appendChild(row);
      inputs[key] = input;
    }
    const btn = document.createElement('button');
    btn.className = 'modal-btn';
    btn.style.width = '100%';
    btn.textContent = tr('Apply Changes');
    btn.addEventListener('click', () => {
      try {
        const valX = parseFloat(inputs.x.value);
        const valY = parseFloat(inputs.y.value);
        const valZ = parseFloat(inputs.z.value);
        const valR = parseFloat(inputs.radius.value);
        const valC = parseFloat(inputs.camber.value);
        const valS = parseInt(inputs.segments.value);
        if ([valX, valY, valZ, valR, valC, valS].some(isNaN)) throw new Error();

        const dx = valX - p.x, dy = valY - p.y, dz = valZ - p.z;
        saveToHistory();
        for (const i of selectedPoints) {
          polygon[i].x += dx;
          polygon[i].y += dy;
          polygon[i].z += dz;
          polygon[i].radius = valR;
          polygon[i].camber = valC;
          polygon[i].segments = valS;
        }
        displayChange();
        backdrop.remove();
      } catch (err) {
        messageBox(tr('Invalid Input'), tr('Please enter numeric values.'));
      }
    });
    body.appendChild(btn);
  });
}

/* ------------------------------------------------------------------ */
/* Preferences dialog                                                 */
/* ------------------------------------------------------------------ */
function preferencesWindow() {
  openModal(tr('Sidebar Module Manager'), (body, backdrop) => {
    const prefNote = (key) => {
      const el = document.createElement('div');
      el.className = 'pref-note';
      el.textContent = tr(key);
      return el;
    };

    function checkbox(labelKey, get, set, onChange) {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:12px;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = get();
      cb.style.accentColor = 'var(--accent)';
      cb.addEventListener('change', () => { set(cb.checked); if (onChange) onChange(); });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(tr(labelKey)));
      return label;
    }

    const sec1 = document.createElement('div');
    sec1.className = 'pref-section';
    sec1.appendChild(checkbox('Show Procedural Track Builder', () => S.showProcGen, v => S.showProcGen = v, () => { updateSidebarVisibility(); saveConfig(); }));
    sec1.appendChild(checkbox('Show Image Vectorizer', () => S.showImgVec, v => S.showImgVec = v, () => { updateSidebarVisibility(); saveConfig(); }));
    sec1.appendChild(checkbox('Show External Path Imports', () => S.showExtPath, v => S.showExtPath = v, () => { updateSidebarVisibility(); saveConfig(); }));
    body.appendChild(sec1);

    const sec2 = document.createElement('div');
    sec2.className = 'pref-section';
    sec2.appendChild(checkbox('Allow Circuit on Rally Stages (Exp.)', () => S.allowRallyCircuit, v => {
      S.allowRallyCircuit = v;
      if (v) {
        messageBox(tr('Experimental Override'),
          tr('This configuration would break the generation on rally stages (slightly) and this is experimental.\n\nAre you sure you want to enable this?'),
          [tr('Yes'), tr('No')]).then(r => { if (r === 1) { S.allowRallyCircuit = false; cbEl.checked = false; } });
      }
    }));
    body.appendChild(sec2);
    let cbEl = null;
    // re-fetch the checkbox element for the confirmation flow
    cbEl = sec2.querySelector('input');

    // Accent colours
    const hr = document.createElement('div');
    hr.style.cssText = 'height:1px;background:var(--light-silver);margin:12px 0;';
    body.appendChild(hr);

    const accentTitle = document.createElement('div');
    accentTitle.className = 'sec-label';
    accentTitle.style.paddingLeft = '0';
    accentTitle.textContent = tr('UI ACCENT COLOR');
    body.appendChild(accentTitle);
    body.appendChild(prefNote('Pick the highlight color used for section headers, buttons, the active tab, sliders and the polygon outline.'));

    const swatchRow = document.createElement('div');
    swatchRow.className = 'swatch-row';
    const presets = [
      ['#0A84FF', 'Blue'], ['#64D2FF', 'Cyan'], ['#30D158', 'Green'], ['#FFD60A', 'Yellow'],
      ['#FF9F0A', 'Orange'], ['#FF453A', 'Red'], ['#FF8080', 'Pink'], ['#BF5AF2', 'Purple'],
    ];
    const swatchBtns = [];
    function selectAccent(hex, srcBtn) {
      S.accentColor = hex;
      applyTheme();
      syncSidebarControls();
      swatchBtns.forEach(b => b.classList.toggle('selected', b === srcBtn));
      updateCurrentAccent();
    }
    for (const [hex, name] of presets) {
      const sw = document.createElement('button');
      sw.className = 'color-swatch';
      sw.style.background = hex;
      sw.title = tr(name);
      if (hex.toUpperCase() === String(S.accentColor).toUpperCase()) sw.classList.add('selected');
      sw.addEventListener('click', () => selectAccent(hex, sw));
      swatchRow.appendChild(sw);
      swatchBtns.push(sw);
    }
    // Custom picker
    const customLabel = document.createElement('label');
    customLabel.className = 'custom-color-label';
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = S.accentColor;
    colorInput.addEventListener('input', () => {
      S.accentColor = colorInput.value.toUpperCase();
      applyTheme();
      swatchBtns.forEach(b => b.classList.remove('selected'));
      updateCurrentAccent();
    });
    customLabel.appendChild(colorInput);
    customLabel.appendChild(document.createTextNode(tr('Custom\u2026')));
    swatchRow.appendChild(customLabel);
    body.appendChild(swatchRow);

    const currentRow = document.createElement('div');
    currentRow.className = 'current-accent-row';
    currentRow.innerHTML =
      '<span style="color:var(--grey);font-size:11px;">' + tr('Current:') + '</span>' +
      '<span class="current-accent-swatch"></span>' +
      '<span class="current-accent-value"></span>';
    body.appendChild(currentRow);
    function updateCurrentAccent() {
      currentRow.querySelector('.current-accent-swatch').style.background = S.accentColor;
      currentRow.querySelector('.current-accent-value').textContent = String(S.accentColor).toUpperCase();
    }
    updateCurrentAccent();

    const reminder = document.createElement('div');
    reminder.className = 'pref-note';
    reminder.style.textAlign = 'center';
    reminder.textContent = tr('Looking for Track Settings?\nRoad width, Camber, Toggles, and Start/Pit alignments are located directly in the main Left Sidebar.');
    body.appendChild(reminder);
  });
}

/* ------------------------------------------------------------------ */
/* Help & credits                                                     */
/* ------------------------------------------------------------------ */
function showHelpWindow() {
  const text = (window.TLC_LOCALES || {})[CURRENT_LANG] && TLC_LOCALES[CURRENT_LANG]['MOUSE_CONTROLS_TEXT'] ||
    'MOUSE CONTROLS\n----------------\nL-Click       : Select point / Place point\nR-Click       : Pan view (hold) / Context\nWheel         : Zoom In/Out\nShift+L-Click : Add/Remove from selection\nDouble-Click  : Edit Point Properties (Precision)\n\nKEYBOARD SHORTCUTS\n------------------\nArrows : Nudge selected point\nEnter  : Edit Point Properties (Precision)\nDel    : Delete selected points\nEsc    : Deselect all / Cancel tool\n\nA : Select All\nC : Center view on track\nE : Toggle Euler/Circular curve\nF : Flip track direction\nR : Rotate Tool\nS : Scale Tool\nX / Y : Toggle Axis Constraints\n\nCtrl+Z : Undo\nCtrl+Y : Redo\nCtrl+S : Save Track\nCtrl+O : Load Track';
  openModal(tr('Controls'), (body) => {
    const pre = document.createElement('div');
    pre.className = 'help-text';
    pre.textContent = text;
    body.appendChild(pre);
  });
}

function showCreditsWindow() {
  const lang = (window.TLC_LOCALES || {})[CURRENT_LANG];
  const text = (lang && lang['CREDITS_TEXT']) ||
    'Original Creator for TLC+:\n' +
    '  \u2022 daydrive7 (Discord, TikTok)\n\n' +
    'Community Modifications & Version 1.2:\n' +
    '  \u2022 daydrive7 (Discord, GitHub)\n\n' +
    'Original Creator for TLC (original):\n' +
    '  \u2022 eran0004 (GTPlanet)';
  openModal(tr('Credits'), (body) => {
    const div = document.createElement('div');
    div.className = 'credits-text';
    div.textContent = text;
    body.appendChild(div);
    const hr = document.createElement('div');
    hr.style.cssText = 'height:1px;background:var(--light-silver);margin:12px 0;';
    div.appendChild(hr);
    const web = document.createElement('div');
    web.className = 'credits-text';
    web.style.color = 'var(--grey)';
    web.textContent =
      'TLC+ Web v1.0.0 (this page):\n' +
      '  \u2022 Web port of the MIT-licensed desktop tool \u2014 same geometry\n' +
      '    engine, TED exporter and terrain data, rebuilt for the browser.\n' +
      '  \u2022 Desktop releases: stable v1.1.2 \u00B7 latest beta v1.2.0-beta2.\n' +
      '  \u2022 Runs fully client-side; hostable on GitHub Pages. MIT licensed.';
    div.appendChild(web);
  });
}

/* ------------------------------------------------------------------ */
/* Menus                                                              */
/* ------------------------------------------------------------------ */
let openMenuBtn = null;
function closeMenus() {
  document.querySelectorAll('.dropdown-menu').forEach(m => m.remove());
  document.querySelectorAll('.tb-menu-btn.open').forEach(b => b.classList.remove('open'));
  openMenuBtn = null;
}

function showMenu(anchorBtn, items) {
  if (openMenuBtn === anchorBtn) { closeMenus(); return; }
  closeMenus();
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  for (const item of items) {
    if (item === '-') {
      const sep = document.createElement('div');
      sep.className = 'menu-sep';
      menu.appendChild(sep);
      continue;
    }
    if (item.labelOnly) {
      const lbl = document.createElement('div');
      lbl.className = 'menu-sub-label';
      lbl.textContent = item.labelOnly;
      menu.appendChild(lbl);
      continue;
    }
    const btn = document.createElement('button');
    btn.className = 'menu-item' + (item.danger ? ' danger' : '');
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      closeMenus();
      item.action();
    });
    menu.appendChild(btn);
  }
  const rect = anchorBtn.getBoundingClientRect();
  menu.style.left = rect.left + 'px';
  menu.style.top = rect.bottom + 'px';
  document.getElementById('menu-layer').appendChild(menu);
  anchorBtn.classList.add('open');
  openMenuBtn = anchorBtn;
}

/* Menu definitions are built fresh on each open so language changes apply */
const MENU_BUILDERS = {
  file: () => {
    const LANGS = [
      ['English', 'en'], ['Polski', 'pl'], ['Espa\u00F1ol', 'es'], ['Portugu\u00EAs (BR)', 'pt-br'],
      ['Portugu\u00EAs (PT)', 'pt-pt'], ['Fran\u00E7ais', 'fr'], ['Deutsch', 'de'],
      ['\u65E5\u672C\u8A9E', 'ja'], ['\u0420\u0443\u0441\u0441\u043A\u0438\u0439', 'ru'],
    ];
    return [
      { label: tr('Load track'), action: loadTrackFile },
      { label: tr('Save track'), action: saveTrackFile },
      '-',
      { label: tr('Import polygon'), action: importPolygonFile },
      { label: tr('Export polygon'), action: exportPolygonFile },
      { label: tr('Import TED'), action: importTedEditable },
      '-',
      { label: tr('Export to TED'), action: exportTEDFile },
      { label: tr('Save screenshot (PNG)'), action: exportScreen },
      { label: tr('Draw isometric view'), action: drawIsoMap },
      '-',
      { label: tr('Preferences'), action: preferencesWindow },
      '-',
      { labelOnly: tr('Language') },
      ...LANGS.map(([name, code]) => ({
        label: (code === CURRENT_LANG ? '\u2713 ' : '   ') + name,
        action: () => setLanguage(code),
      })),
      '-',
      { label: tr('Quit'), action: () => { saveConfig(); location.reload(); }, danger: true },
    ];
  },
  edit: () => [
    { label: tr('Undo') + ' (Ctrl+Z)', action: undo },
    { label: tr('Redo') + ' (Ctrl+Y)', action: redo },
    '-',
    { label: tr('Select All') + ' (A)', action: selectAll },
    { label: tr('Deselect') + ' (Esc)', action: escapeKey },
    '-',
    { label: tr('Flip direction') + ' (F)', action: flipDirection },
  ],
  theme: () => [
    { label: tr('Death Valley'), action: () => switchScenery(1) },
    { label: tr('Eifel'), action: () => switchScenery(2) },
    { label: tr('Andalusia'), action: () => switchScenery(3) },
    { label: tr('Eifel Flat'), action: () => switchScenery(5) },
  ],
  help: () => [
    { label: tr('Controls'), action: showHelpWindow },
    { label: tr('Credits'), action: showCreditsWindow },
    '-',
    { label: 'TLC+ on GitHub \u2197', action: () => window.open('https://github.com/daydrive7/track-layout-creator-plus', '_blank') },
  ],
};

function initMenus() {
  for (const key of Object.keys(MENU_BUILDERS)) {
    const btn = document.getElementById('mb-' + key);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showMenu(btn, MENU_BUILDERS[key]());
    });
  }
  document.addEventListener('click', closeMenus);
}

function setLanguage(code) {
  CURRENT_LANG = code;
  saveConfig();
  applyLanguageToDom();
  displayChange();
  toast(tr('Language updated'));
}

/* Translate all sidebar/menu text using the locale map.
 * Preserves element children (checkboxes/radios inside labels). */
function applyLanguageToDom() {
  const lang = (window.TLC_LOCALES || {})[CURRENT_LANG];
  if (!lang) return;
  const translateText = (el) => {
    const raw = el.dataset.origText || el.textContent.trim();
    if (!raw) return;
    if (!el.dataset.origText) el.dataset.origText = raw;
    if (!Object.prototype.hasOwnProperty.call(lang, el.dataset.origText)) return;
    const translated = lang[el.dataset.origText];
    if (el.children.length === 0) {
      el.textContent = translated;
    } else {
      // keep element children (e.g. the checkbox inside a <label>) — update
      // only the trailing text node
      const textNodes = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (textNodes.length) textNodes[textNodes.length - 1].textContent = ' ' + translated;
    }
  };
  document.querySelectorAll('#tab-bar .tab-btn, .sec-label, .slider-row > label, .check-row label, .styled-btn, .radio-row-group label, #stats-card .stat-label, .sidebar-toggle-btn').forEach(translateText);
  document.querySelectorAll('.tb-menu-btn').forEach(translateText);
  closeMenus();
}

/* ------------------------------------------------------------------ */
/* Scenery switching                                                  */
/* ------------------------------------------------------------------ */
function switchScenery(index) {
  S.sceneryindex = index;
  getHeightmap(index).then((hm) => {
    S.heightMap = hm;
    updateStats();
    navTerrainCache = null;
    displayChange();
    toast(tr('Scenery') + ': ' + tr(SCENERIES[index]));
  });
}

function loadHeightMap(display) {
  return getHeightmap(S.sceneryindex).then((hm) => {
    S.heightMap = hm;
    if (display !== false) {
      displayChange();
    }
  });
}

/* ------------------------------------------------------------------ */
/* File operations                                                    */
/* ------------------------------------------------------------------ */
function promptFile(accept, asText) {
  return new Promise((resolve) => {
    const input = document.getElementById('file-input');
    input.value = '';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) { resolve(null); return; }
      if (asText) {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, content: reader.result });
        reader.readAsText(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, buffer: reader.result });
        reader.readAsArrayBuffer(file);
      }
    };
    input.click();
  });
}

function timestampName(ext) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
    pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + ext;
}

function exportTEDFile() {
  if (polygon.length - (S.circuit ? 1 : 0) < 2) {
    messageBox(tr('Error'), tr('Polygon has too few points. Need at least 3 for a circuit or 2 for point-to-point.'));
    return;
  }
  try {
    const track = constructTEDData(polygon, S);
    const buf = generateTedFile(track);
    downloadBlob(new Blob([buf], { type: 'application/octet-stream' }), timestampName('.ted'));
    toast(tr('Exported TED file'), 'success');
  } catch (e) {
    console.error(e);
    messageBox(tr('Error'), String(e.message || e));
  }
}

function saveTrackFile() {
  const buf = makeTrk5(S, polygon);
  downloadBlob(new Blob([buf], { type: 'application/octet-stream' }), timestampName('.trk5'));
  toast(tr('Track saved'), 'success');
}

function loadTrackFile() {
  promptFile('.trk,.trk5,.trk4,.trk3,.trk2', false).then((res) => {
    if (!res) return;
    try {
      const parsed = parseTrkFile(res.buffer);
      if (!parsed || !parsed.polygon.length) {
        messageBox(tr('Error'), tr('Could not read track file.'));
        return;
      }
      saveToHistory();
      polygon = parsed.polygon;
      Object.assign(S, parsed.state);
      selectedPoints = [];
      syncSidebarControls();
      loadHeightMap(false).then(() => {
        displayChange();
        centerOnTrack();
      });
      toast(tr('Track loaded'), 'success');
    } catch (e) {
      console.error(e);
      messageBox(tr('Error'), String(e.message || e));
    }
  });
}

function importPolygonFile() {
  promptFile('.pgn,.csv,.txt', true).then((res) => {
    if (!res) return;
    const raw = parsePolygonCSV(res.content);
    if (!raw.length) { messageBox(tr('Error'), tr('Could not import polygon.')); return; }
    saveToHistory();
    polygon = raw.map(pt => makeCoordinate(pt[0], pt[1], pt[2] !== undefined ? pt[2] : 0,
      pt[3] !== undefined ? pt[3] : 90, pt[4] !== undefined ? pt[4] : -1,
      pt[5] !== undefined ? parseInt(pt[5]) : 0));
    selectedPoints = [];
    polygonChange();
    trackChange();
    centerOnTrack();
  });
}

function exportPolygonFile() {
  const csv = polygonToCSV(polygon);
  downloadBlob(new Blob([csv], { type: 'text/plain' }), timestampName('.pgn'));
  toast(tr('Polygon exported'), 'success');
}

function importTedEditable() {
  promptFile('.ted', false).then((res) => {
    if (!res) return;
    try {
      const ted = new TEDTrackObject(res.buffer, res.name);
      const newPolygon = tedToPolygon(ted);
      if (newPolygon.length > 2) {
        saveToHistory();
        polygon = newPolygon;
        selectedPoints = [];
        S.circuit = !!ted.header['isloopcourse'][3];
        S.sceneryindex = ted.header['sceneryindex'][3];
        S.roadWidth = ted.header['roadwidth'][3] - roadWidthOffset;
        syncSidebarControls();
        loadHeightMap(false).then(() => {
          displayChange();
          centerOnTrack();
        });
        messageBox(tr('Import Successful'),
          tr('Recovered {0} editable nodes.\n\nNote: Heights and Banking have been reset to 0/Global to prevent geometry errors.')
            .replace('{0}', String(polygon.length)));
      } else {
        messageBox(tr('Import Failed'), tr('Could not reconstruct enough nodes from this file.'));
      }
    } catch (e) {
      console.error(e);
      messageBox(tr('Import Failed'), String(e.message || e));
    }
  });
}

function importTedReference() {
  promptFile('.ted', false).then((res) => {
    if (!res) return;
    try {
      const ted = new TEDTrackObject(res.buffer, res.name);
      referencePath = ted.cps.map(cp => makeCP([cp.x, cp.y], [cp.x2, cp.y2], cp.formtype));
      canvasChange();
      toast(tr('Reference path imported'), 'success');
    } catch (e) {
      messageBox(tr('Error'), String(e.message || e));
    }
  });
}

function importGPXFile() {
  promptFile('.gpx', true).then((res) => {
    if (!res) return;
    const path = parseGPX(res.content);
    if (!path.length) { messageBox(tr('Error'), tr('No track points found in GPX file.')); return; }
    referencePath = path.map(([x, y]) => makeCP([x, -y]));
    canvasChange();
    toast(tr('Reference path imported'), 'success');
  });
}

function importCSVPathFile() {
  promptFile('.csv,.txt', true).then((res) => {
    if (!res) return;
    const path = parseCSVPath(res.content);
    if (!path || !path.length) {
      messageBox(tr('Error'), tr('Failed to import. Latitude or Longitude missing in header.'));
      return;
    }
    referencePath = path.map(([x, y]) => makeCP([x, -y]));
    canvasChange();
    toast(tr('Reference path imported'), 'success');
  });
}

function clearReferencePath() {
  referencePath = [];
  displayChange();
}

function exportScreen() {
  // White background composite, then download as PNG (web equivalent of the PostScript export)
  const temp = document.createElement('canvas');
  temp.width = mainCanvas.width;
  temp.height = mainCanvas.height;
  const tctx = temp.getContext('2d');
  tctx.fillStyle = '#ffffff';
  tctx.fillRect(0, 0, temp.width, temp.height);
  tctx.drawImage(mainCanvas, 0, 0);
  temp.toBlob((blob) => {
    downloadBlob(blob, timestampName('.png'));
    toast(tr('Screenshot saved'), 'success');
  });
}

let currentIsoView = null;

function drawIsoMap() {
  const rect = mainCanvas.getBoundingClientRect();
  const x0 = canvasX(0) / zoom, y0 = canvasY(0) / zoom;
  const x1 = canvasX(rect.width) / zoom, y1 = canvasY(rect.height) / zoom;
  if (!S.heightMap) { toast(tr('Heightmap not loaded yet'), 'error'); return; }
  // only one isometric window at a time (the original lifts the existing one)
  if (currentIsoView) currentIsoView.close();
  currentIsoView = new IsoView({
    bbox: [x0, y0, x1, y1],
    roadWidth: S.roadWidth,
    borderWidth: getBorderWidth(S),
    trackLength: trackLengthState.total,
    heightMap: S.heightMap,
    CPS: CPS,
    colors: THEME,
    onClose: () => { currentIsoView = null; },
  });
}

/* ------------------------------------------------------------------ */
/* Generators                                                         */
/* ------------------------------------------------------------------ */
function runGenerator(style) {
  if (style === 'rally' && S.circuit && !S.allowRallyCircuit) {
    messageBox(tr('Invalid Configuration'),
      tr("Rally stages are point-to-point tracks and cannot be generated while 'Circuit' is enabled.\n\nPlease uncheck 'Circuit' in the 'Geometry' tab first, or override this requirement in App Preferences."));
    return;
  }
  saveToHistory();
  const result = generateMathTrack(style);
  polygon = result.polygon;
  S.circuit = result.circuit;
  selectedPoints = [];
  syncSidebarControls();
  displayChange();
  centerOnTrack();
  toast(tr('Generated') + ' ' + style.toUpperCase());
}

function runRandomLayout() {
  saveToHistory();
  const result = generateRandomLayout();
  polygon = result.polygon;
  S.circuit = result.circuit;
  selectedPoints = [];
  syncSidebarControls();
  displayChange();
  centerOnTrack();
}

function runImageTrace() {
  promptFile('image/*', false).then((res) => {
    if (!res) return;
    const modeEl = document.querySelector('#trace-modes input:checked');
    const mode = modeEl ? modeEl.value : 'centerline';
    loadImageFile(new File([res.buffer], res.name)).then((img) => {
      try {
        const finalPoints = traceImageToTrack(img, 1000, mode);
        saveToHistory();
        polygon = finalPoints;
        selectedPoints = [];
        S.circuit = true;
        syncSidebarControls();
        displayChange();
        centerOnTrack();
        toast(tr('Vectorized ({0})! {1} nodes.').replace('{0}', mode).replace('{1}', String(polygon.length)), 'success');
      } catch (e) {
        messageBox(tr('Error'), tr('Processing failed: {0}').replace('{0}', String(e.message || e)));
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* Sidebar wiring                                                     */
/* ------------------------------------------------------------------ */
const sliderElements = [];

function initSidebar() {
  initCollapsibleSections();

  // Sliders (range + inline numeric input)
  document.querySelectorAll('.slider-row').forEach((row) => {
    const varName = row.dataset.var;
    const input = row.querySelector('input[type="range"]');
    const valEl = row.querySelector('.slider-val');
    const min = parseFloat(row.dataset.min);
    const max = parseFloat(row.dataset.max);
    const res = parseFloat(row.dataset.res);
    input.min = min; input.max = max; input.step = res;
    if (valEl && valEl.tagName === 'INPUT') {
      valEl.min = min; valEl.max = max; valEl.step = res;
    }

    function readVar() {
      let v = (varName === 'pitOffset2') ? S.pitOffset : S[varName];
      if (v === undefined) v = min;
      return v;
    }
    function refresh() {
      const v = readVar();
      input.value = v;
      if (valEl && valEl.tagName === 'INPUT') valEl.value = formatSliderValue(v, res);
      else if (valEl) valEl.textContent = formatSliderValue(v, res);
    }
    function applyValue(v) {
      if (isNaN(v)) v = min;
      if (varName === 'pitOffset2') S.pitOffset = v;
      else S[varName] = v;
      input.value = v;
      if (valEl && valEl.tagName === 'INPUT') valEl.value = formatSliderValue(v, res);
      else if (valEl) valEl.textContent = formatSliderValue(v, res);
      navTerrainCache = null;
      if (varName === 'labelFontSize') { polygonChange(); trackChange(); }
      else if (varName === 'heightMapFidelity') canvasChange();
      else if (varName === 'mapBorder') { clampPan(); displayChange(); }
      else if (varName === 'referenceScale') canvasChange();
      else displayChange();
    }
    function apply() { applyValue(parseFloat(input.value)); }

    input.addEventListener('input', apply);

    // Typed numeric entry: clamp to range and snap to the slider step
    if (valEl && valEl.tagName === 'INPUT') {
      valEl.addEventListener('change', () => {
        let v = parseFloat(valEl.value);
        if (isNaN(v)) v = readVar();
        v = Math.max(min, Math.min(max, v));
        v = Math.round(v / res) * res;
        v = parseFloat(v.toFixed(4));
        applyValue(v);
      });
      valEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') valEl.blur();
      });
    }

    sliderElements.push({ name: varName, refresh: refresh });
    refresh();
    if (row.dataset.tip) row.dataset.tip = row.dataset.tip;
  });

  // Checkboxes
  document.querySelectorAll('.check-row').forEach((row) => {
    const varName = row.dataset.var;
    const input = row.querySelector('input[type="checkbox"]');
    input.addEventListener('change', () => {
      S[varName] = input.checked;
      navTerrainCache = null;
      const cmd = row.dataset.cmd;
      if (cmd && typeof window[cmd] === 'function') window[cmd]();
      else displayChange();
    });
  });

  // Track length mode radios
  document.querySelectorAll('#tracklength-mode input[name="tlmode"]').forEach((rb) => {
    rb.addEventListener('change', () => {
      S.tracklengthLabelsMode = rb.value;
      trackChange();
    });
  });

  // Trace mode radios need no extra wiring (read on demand)

  // Pit UI
  updatePitUI();

  // Tool buttons
  document.querySelectorAll('#toolbar .tool-btn[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => setToolMode(btn.dataset.tool));
  });
  setToolMode('pan');

  document.getElementById('btn-zoom-in').addEventListener('click', zoomIn);
  document.getElementById('btn-zoom-out').addEventListener('click', zoomOut);
  document.getElementById('btn-reverse').addEventListener('click', flipDirection);
  document.getElementById('btn-screenshot').addEventListener('click', exportScreen);
  document.getElementById('btn-toggle-sidebar').addEventListener('click', toggleSidebar);

  document.getElementById('btn-rotate-tool').addEventListener('click', () => setToolMode('rotate'));
  document.getElementById('btn-scale-tool').addEventListener('click', () => { setToolMode('scale'); axis.x = axis.y = true; });
  document.getElementById('btn-random-tool').addEventListener('click', randomTranslation);

  // Tabs
  document.querySelectorAll('#tab-bar .tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchSidebarTab(btn.dataset.tab));
  });
  switchSidebarTab('geometry');

  // Generator buttons
  document.querySelectorAll('[data-gen]').forEach((btn) => {
    btn.addEventListener('click', () => runGenerator(btn.dataset.gen));
  });
  document.getElementById('btn-random-layout').addEventListener('click', runRandomLayout);
  document.getElementById('btn-trace-image').addEventListener('click', runImageTrace);
  document.getElementById('btn-import-gpx').addEventListener('click', importGPXFile);
  document.getElementById('btn-import-csv').addEventListener('click', importCSVPathFile);
  document.getElementById('btn-import-ted-ref').addEventListener('click', importTedReference);
  document.getElementById('btn-clear-ref').addEventListener('click', clearReferencePath);

  // Sidebar divider (collapse)
  document.getElementById('sidebar-divider').addEventListener('click', toggleSidebar);

  updateSidebarVisibility();
}

function formatSliderValue(v, res) {
  if (res >= 1) return String(Math.round(v));
  return String(parseFloat(v.toFixed(2)));
}

function updatePitUI() {
  const align = document.getElementById('pit-slider-align');
  const start = document.getElementById('pit-slider-start');
  const pit = document.getElementById('pit-slider-pit');
  if (S.separateStartPit) {
    align.classList.add('hidden');
    start.classList.remove('hidden');
    pit.classList.remove('hidden');
  } else {
    start.classList.add('hidden');
    pit.classList.add('hidden');
    S.startOffset = -3;
    align.classList.remove('hidden');
  }
  syncSidebarControls();
  displayChange();
}

function switchSidebarTab(tabName) {
  document.querySelectorAll('#tab-bar .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.classList.toggle('hidden', tab.id !== 'tab-' + tabName);
  });
}

function toggleSidebar() {
  const panel = document.getElementById('left-panel');
  const divider = document.getElementById('sidebar-divider');
  const collapsed = panel.classList.toggle('hidden');
  divider.classList.toggle('hidden', collapsed);
  setTimeout(() => { sizeCanvases(); displayChange(); }, 20);
}

function updateSidebarVisibility() {
  const proc = document.getElementById('proc-container');
  const img = document.getElementById('img-container');
  const imp = document.getElementById('imp-container');
  if (proc) proc.classList.toggle('hidden', !S.showProcGen);
  if (img) img.classList.toggle('hidden', !S.showImgVec);
  if (imp) imp.classList.toggle('hidden', !S.showExtPath);
}

/* Sync all sidebar controls from S (used after load/generation) */
function syncSidebarControls() {
  for (const { refresh } of sliderElements) refresh();
  document.querySelectorAll('.check-row').forEach((row) => {
    const input = row.querySelector('input[type="checkbox"]');
    const v = S[row.dataset.var];
    if (v !== undefined) input.checked = !!v;
  });
  document.querySelectorAll('#tracklength-mode input[name="tlmode"]').forEach((rb) => {
    rb.checked = (rb.value === S.tracklengthLabelsMode);
  });
  updateSidebarVisibility();
  updateStats();
}

/* ------------------------------------------------------------------ */
/* Collapsible sidebar sections                                        */
/* ------------------------------------------------------------------ */
function initCollapsibleSections() {
  document.querySelectorAll('.sidebar-tab').forEach((tab) => {
    let current = null; // tracks where subsequent rows get appended
    Array.from(tab.children).forEach((child) => {
      if (child.classList && child.classList.contains('sec-label')) {
        // Start a new section group; the original label element is kept
        // (so translation + dataset.origText survive) and gets a toggle.
        // NOTE: the group must be captured per-section (const) — closures
        // over a shared loop variable would all toggle the last group.
        const sectionGroup = document.createElement('div');
        sectionGroup.className = 'sec-group';
        const head = document.createElement('div');
        head.className = 'sec-head';
        head.setAttribute('role', 'button');
        head.setAttribute('tabindex', '0');
        head.setAttribute('aria-expanded', 'true');
        head.title = tr('Click to collapse / expand section');
        child.replaceWith(sectionGroup);
        head.appendChild(child);
        const toggle = document.createElement('span');
        toggle.className = 'sec-toggle';
        toggle.setAttribute('aria-hidden', 'true');
        toggle.textContent = '\u25BE';
        head.appendChild(toggle);
        sectionGroup.appendChild(head);
        const toggleSection = () => {
          const collapsed = sectionGroup.classList.toggle('collapsed');
          head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        };
        head.addEventListener('click', toggleSection);
        head.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection(); }
        });
        current = sectionGroup;
      } else if (current) {
        // Everything up to the next section label belongs to this group
        current.appendChild(child);
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* Elevation graph expand / restore                                    */
/* ------------------------------------------------------------------ */
function initNavExpand() {
  const btn = document.getElementById('nav-expand-btn');
  const navArea = document.getElementById('nav-area');
  if (!btn || !navArea) return;
  let prevH = null;

  function setHeight(h) {
    navArea.style.flexBasis = h + 'px';
    navArea.style.height = h + 'px';
    sizeCanvases();
    displayChange();
    saveConfig();
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const curH = navArea.getBoundingClientRect().height;
    const expanded = navArea.classList.toggle('expanded');
    if (expanded) {
      prevH = curH;
      btn.title = tr('Restore elevation graph size');
      setHeight(Math.round(window.innerHeight * 0.6));
    } else {
      btn.title = tr('Expand elevation graph');
      setHeight(prevH && prevH > 40 ? prevH : 160);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Elevation splitter drag                                            */
/* ------------------------------------------------------------------ */
function initSplitter() {
  const splitter = document.getElementById('elev-splitter');
  const navArea = document.getElementById('nav-area');
  let dragging = false;
  let startY = 0, startH = 0;
  splitter.addEventListener('mousedown', (e) => {
    dragging = true;
    startY = e.clientY;
    startH = navArea.getBoundingClientRect().height;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const h = Math.max(50, Math.min(window.innerHeight - 200, startH - (e.clientY - startY)));
    navArea.style.flexBasis = h + 'px';
    navArea.style.height = h + 'px';
    sizeCanvases();
    displayChange();
  });
  window.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; saveConfig(); }
  });
}

/* ------------------------------------------------------------------ */
/* Warning flasher                                                    */
/* ------------------------------------------------------------------ */
function initWarningFlasher() {
  setInterval(() => {
    // Only re-render while warnings actually exist (the original just
    // recolours items; we redraw the track layer — keep it idle otherwise).
    if (!hasWarnings) return;
    warningFlash = !warningFlash;
    trackChange();
  }, 600);
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                          */
/* ------------------------------------------------------------------ */
function initApp() {
  mainCanvas = document.getElementById('main-canvas');
  mainCtx = mainCanvas.getContext('2d');
  rulerNorth = document.getElementById('ruler-north');
  rulerNorthCtx = rulerNorth.getContext('2d');
  rulerWest = document.getElementById('ruler-west');
  rulerWestCtx = rulerWest.getContext('2d');
  navCanvas = document.getElementById('nav-canvas');
  navCtx = navCanvas.getContext('2d');
  navRuler = document.getElementById('nav-ruler');
  navRulerCtx = navRuler.getContext('2d');

  loadConfig();
  applyTheme();
  applyLanguageToDom();

  initSidebar();
  initMenus();
  initSplitter();
  initNavExpand();
  initTooltips();
  initWarningFlasher();
  bindCanvasEvents();
  bindKeyboard();

  window.addEventListener('resize', () => { sizeCanvases(); displayChange(); });

  sizeCanvases();

  // initial heightmap load + first paint
  loadHeightMap(false).then(() => {
    sizeCanvases();
    centerOnCoord([0, 0]);
    displayChange();
  });

  // Show the app behind the splash, then fade the splash out
  const splash = document.getElementById('splash');
  document.getElementById('app').classList.remove('hidden');
  setTimeout(() => {
    splash.classList.add('fade-out');
    setTimeout(() => splash.remove(), 500);
  }, 700);
}

document.addEventListener('DOMContentLoaded', initApp);
