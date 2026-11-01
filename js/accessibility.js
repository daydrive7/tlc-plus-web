/* Keyboard and assistive-technology support for the application shell. */
'use strict';
let accessibleId = 0;
const modalInertState = new Map();
function modalFocusables(dialog) {
  return [...dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
    .filter(el => !el.disabled && el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length);
}
function topModal() { return [...document.querySelectorAll('#modal-layer .modal-backdrop')].at(-1); }
function syncModalBackground() {
  const top = topModal();
  if (top) {
    for (const el of document.body.children) {
      if (el.id === 'modal-layer' || el.tagName === 'SCRIPT') continue;
      if (!modalInertState.has(el)) modalInertState.set(el, el.inert);
      el.inert = true;
    }
    document.querySelectorAll('#modal-layer .modal-backdrop').forEach(el => { el.inert = el !== top; });
  } else {
    for (const [el, value] of modalInertState) el.inert = value;
    modalInertState.clear();
  }
}
function activateAccessibleModal(backdrop, onDismiss) {
  const previous = document.activeElement;
  const dialog = backdrop.querySelector('.modal-window');
  const title = backdrop.querySelector('.modal-title');
  title.id = 'dialog-title-' + ++accessibleId;
  dialog.setAttribute('aria-labelledby', title.id);
  dialog.tabIndex = -1;
  backdrop.querySelectorAll('.form-row').forEach(row => {
    const label = row.querySelector('label'), input = row.querySelector('input, select, textarea');
    if (label && input && !label.contains(input)) {
      if (!input.id) input.id = 'dialog-input-' + ++accessibleId;
      label.htmlFor = input.id;
    }
  });
  const remove = backdrop.remove.bind(backdrop);
  let closed = false;
  backdrop.remove = () => {
    if (closed) return;
    closed = true; remove(); syncModalBackground();
    if (onDismiss) onDismiss();
    const parent = topModal();
    if (previous?.isConnected && !previous.closest('[inert]') && previous.getClientRects().length) previous.focus();
    else if (parent) (modalFocusables(parent)[0] || parent.querySelector('.modal-window')).focus();
    else document.getElementById('main-canvas')?.focus();
    document.dispatchEvent(new Event('tlcp-dialog-closed'));
  };
  syncModalBackground();
  (modalFocusables(dialog)[0] || dialog).focus();
}
function refreshAccessibleLabels() {
  document.querySelectorAll('.slider-row').forEach(row => {
    const label = row.querySelector('label');
    if (!label) return;
    if (!label.id) label.id = 'slider-label-' + row.dataset.var;
    row.querySelectorAll('input').forEach(input => input.setAttribute('aria-labelledby', label.id));
  });
  document.querySelectorAll('button[title]').forEach(button => {
    if (!button.textContent.trim() || button.querySelector('svg, img')) button.setAttribute('aria-label', button.title);
  });
  document.querySelectorAll('button svg').forEach(svg => { svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); });
}
function initAccessibility() {
  refreshAccessibleLabels();
  document.getElementById('btn-track-points').addEventListener('click', showTrackPointsWindow);
  const toastWrap = document.querySelector('.toast-wrap');
  if (toastWrap) toastWrap.setAttribute('role', 'status');
  document.querySelectorAll('#tab-bar .tab-btn').forEach((button, index) => {
    if (!button.id) button.id = 'sidebar-tab-button-' + index;
    button.setAttribute('aria-controls', 'tab-' + button.dataset.tab);
    document.getElementById('tab-' + button.dataset.tab).setAttribute('aria-labelledby', button.id);
  });
  document.getElementById('tab-bar').setAttribute('aria-label', 'Editor settings');
  document.getElementById('tab-bar').addEventListener('keydown', event => {
    const tabs = [...document.querySelectorAll('#tab-bar .tab-btn')];
    let index = tabs.indexOf(event.target);
    if (index < 0) return;
    if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tabs.length - 1;
    else return;
    event.preventDefault(); switchSidebarTab(tabs[index].dataset.tab); tabs[index].focus();
  });
  document.querySelectorAll('.tb-menu-btn').forEach(button => {
    button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', event => {
    const backdrop = topModal();
    if (backdrop) {
      const dialog = backdrop.querySelector('.modal-window');
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); backdrop.remove(); }
      if (event.key === 'Tab') {
        const list = modalFocusables(dialog), first = list[0], last = list.at(-1);
        if (!first) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && (event.target === first || !list.includes(event.target))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (event.target === last || !list.includes(event.target))) { event.preventDefault(); first.focus(); }
      }
      return;
    }
    const mainButton = event.target.closest('.tb-menu-btn');
    if (mainButton && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if (openMenuBtn !== mainButton) showMenu(mainButton, MENU_BUILDERS[mainButton.dataset.menu]());
      const list = [...document.querySelector('.dropdown-menu').querySelectorAll('button')];
      (event.key === 'ArrowUp' ? list.at(-1) : list[0])?.focus();
      return;
    }
    const menu = event.target.closest('.dropdown-menu');
    if (!menu) return;
    const list = [...menu.querySelectorAll('button')];
    let index = list.indexOf(event.target.closest('button'));
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'ArrowDown') index = (index + 1) % list.length;
      if (event.key === 'ArrowUp') index = (index + list.length - 1) % list.length;
      if (event.key === 'Home') index = 0;
      if (event.key === 'End') index = list.length - 1;
      list[index]?.focus();
    } else if (event.key === 'ArrowRight' && event.target.classList.contains('has-submenu')) {
      event.preventDefault(); event.target.click(); openSubMenu?.querySelector('button')?.focus();
    } else if (event.key === 'ArrowLeft' && menu.classList.contains('submenu')) {
      event.preventDefault(); const anchor = openSubMenu?._anchor; closeSubMenu(); anchor?.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      const anchor = openMenuBtn; closeMenus(); anchor?.focus();
    }
  }, true);
  document.addEventListener('focusin', event => {
    const backdrop = topModal();
    if (backdrop && !backdrop.contains(event.target)) (modalFocusables(backdrop)[0] || backdrop.querySelector('.modal-window')).focus();
  });
  const splitter = document.getElementById('elev-splitter');
  splitter.tabIndex = 0; splitter.setAttribute('role', 'separator'); splitter.setAttribute('aria-orientation', 'horizontal');
  splitter.setAttribute('aria-label', 'Elevation panel height'); splitter.setAttribute('aria-controls', 'nav-area');
  const syncSplitter = () => {
    splitter.setAttribute('aria-valuemin', '50'); splitter.setAttribute('aria-valuemax', String(Math.max(50, window.innerHeight - 200)));
    splitter.setAttribute('aria-valuenow', String(Math.round(document.getElementById('nav-area').getBoundingClientRect().height)));
  };
  splitter.addEventListener('focus', syncSplitter);
  splitter.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const area = document.getElementById('nav-area'), max = Math.max(50, window.innerHeight - 200);
    let height = area.getBoundingClientRect().height + (event.key === 'ArrowUp' ? 10 : -10);
    if (event.key === 'Home') height = 50; if (event.key === 'End') height = max;
    area.style.flexBasis = area.style.height = Math.max(50, Math.min(max, height)) + 'px';
    sizeCanvases(); displayChange(); saveConfig(); syncSplitter();
  });
  const divider = document.getElementById('sidebar-divider');
  divider.tabIndex = 0; divider.setAttribute('role', 'button'); divider.setAttribute('aria-label', 'Toggle settings sidebar');
  divider.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleSidebar(); } });
}

function showTrackPointsWindow() {
  let refresh;
  const backdrop = openModal('Track points — keyboard editor', body => {
    const note = document.createElement('p');
    note.textContent = 'Inspect and change the control points without dragging. Select a point to edit its coordinates, radius and camber. New points are appended to the track. Undo is available after closing this dialog.';
    body.appendChild(note);
    const label = document.createElement('label'); label.textContent = 'Track point';
    const select = document.createElement('select'); select.id = 'accessible-point-select'; label.htmlFor = select.id;
    select.style.cssText = 'display:block;width:100%;margin:8px 0;padding:8px';
    body.append(label, select);
    const summary = document.createElement('p'); summary.setAttribute('role', 'status'); body.appendChild(summary);
    function button(text, action) { const el = document.createElement('button'); el.type = 'button'; el.className = 'modal-btn'; el.textContent = text; el.onclick = action; body.appendChild(el); return el; }
    function choose() { selectedPoints = select.value === '' ? [] : [Number(select.value)]; displayChange(); }
    const edit = button('Edit selected point', () => { choose(); editPointProperties(); });
    const remove = button('Delete selected point', () => { choose(); deletePoints(); refresh(); });
    select.addEventListener('change', choose);
    refresh = () => {
      const index = select.value || '0'; select.replaceChildren();
      polygon.forEach((p, i) => {
        const option = document.createElement('option'); option.value = String(i);
        option.textContent = `${i + 1}: X ${p.x.toFixed(2)}, Y ${p.y.toFixed(2)}, Z ${p.z.toFixed(2)} m; radius ${p.radius.toFixed(2)} m; camber ${p.camber.toFixed(1)}°; segments ${p.segments}`;
        select.appendChild(option);
      });
      if (polygon.length) select.value = String(Math.min(Number(index), polygon.length - 1));
      edit.disabled = remove.disabled = !polygon.length;
      summary.textContent = `${polygon.length} control points. ${document.getElementById('stat-length').textContent} track length.`;
    };
    const fields = {};
    for (const key of ['X', 'Y', 'Z']) {
      const row = document.createElement('label'); row.textContent = 'New point ' + key + ' (m)';
      const input = document.createElement('input'); input.type = 'number'; input.step = 'any'; input.value = '0'; input.dataset.pointAxis = key;
      input.style.cssText = 'display:block;width:100%;padding:8px;margin:4px 0 10px'; row.appendChild(input); body.appendChild(row); fields[key] = input;
    }
    button('Append point', () => {
      const values = Object.values(fields).map(input => input.value.trim() === '' ? NaN : Number(input.value));
      if (!values.every(Number.isFinite)) { summary.textContent = 'Enter finite numeric coordinates for X, Y and Z.'; return; }
      saveToHistory(); polygon.push(makeCoordinate(...values, 100, -1, 1)); selectedPoints = [polygon.length - 1];
      displayChange(); refresh(); select.value = String(polygon.length - 1);
    });
    refresh();
  });
  const listener = () => { if (backdrop.isConnected) refresh(); else document.removeEventListener('tlcp-dialog-closed', listener); };
  document.addEventListener('tlcp-dialog-closed', listener);
}
