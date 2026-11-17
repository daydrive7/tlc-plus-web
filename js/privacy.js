/* Local storage choices. No network calls, cookies, analytics or identifiers. */
'use strict';
window.TLCPrivacy = (() => {
  const KEY = 'tlcp_storage';
  const DURATION = 180 * 24 * 60 * 60 * 1000;
  let choice = readChoice();
  function readChoice() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY));
      if (value && value.version === 1 && typeof value.preferences === 'boolean' &&
          Number.isFinite(value.expires) && value.expires > Date.now() && value.expires <= Date.now() + DURATION) return value;
    } catch (_) { /* Storage may be blocked. The editor still works. */ }
    return null;
  }
  function allowed() { return !!(choice && choice.preferences && choice.expires > Date.now()); }
  function choose(preferences) {
    choice = {version: 1, preferences, expires: Date.now() + DURATION};
    let stored = true;
    try {
      localStorage.setItem(KEY, JSON.stringify(choice));
      if (!preferences) localStorage.removeItem('tlcp_config');
    } catch (_) { stored = false; }
    document.querySelectorAll('[data-storage-notice]').forEach(el => el.remove());
    window.dispatchEvent(new CustomEvent('tlcp-storage-change', {detail: {preferences}}));
    return stored;
  }
  function controls(container) {
    const p = document.createElement('p');
    p.textContent = 'TLC+ processes track files on your device. No advertising or analytics. May we remember your display, language and editor preferences on this device? Your choice is kept for 180 days. Browser track saves are separate and only happen when you request them.';
    container.appendChild(p);
    const actions = document.createElement('div');
    actions.className = 'storage-actions';
    for (const [label, value] of [['Use without remembered settings', false], ['Remember my settings', true]]) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'storage-button'; button.textContent = label;
      button.addEventListener('click', () => {
        const stored = choose(value);
        const status = document.getElementById('privacy-status');
        if (status) status.textContent = stored ? (value ? 'Remembered settings enabled.' : 'Remembered settings disabled. Previously saved preferences removed. Browser tracks kept.') : 'Browser storage is blocked. Your choice applies to this visit; it could not be saved.';
        if (!container.isConnected) document.querySelector('[data-storage-settings]')?.focus();
        renderState();
      });
      actions.appendChild(button);
    }
    container.appendChild(actions);
    const link = document.createElement('a');
    link.href = 'legal.html#storage'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Privacy, cookies & browser storage';
    container.appendChild(link);
  }
  function showNotice() {
    const existing = document.querySelector('[data-storage-notice]');
    if (existing) { existing.querySelector('button').focus(); return; }
    const notice = document.createElement('aside');
    notice.lang = 'en';
    notice.dataset.storageNotice = ''; notice.className = 'storage-notice';
    notice.setAttribute('aria-labelledby', 'storage-notice-title');
    const heading = document.createElement('h2'); heading.id = 'storage-notice-title'; heading.textContent = 'Your browser, your choice';
    notice.appendChild(heading); controls(notice); document.body.appendChild(notice);
  }
  function renderState() {
    document.querySelectorAll('[data-storage-state]').forEach(el => {
      el.textContent = allowed() ? 'Remembered preferences: enabled.' : 'Remembered preferences: disabled.';
    });
  }
  function init() {
    document.querySelectorAll('[data-storage-settings]').forEach(button => button.addEventListener('click', showNotice));
    document.querySelectorAll('[data-storage-controls]').forEach(controls);
    document.querySelectorAll('[data-clear-vault]').forEach(button => button.addEventListener('click', () => {
      if (!window.confirm('Delete every track saved to this browser? Download backups first. This cannot be undone. Your open editor and downloaded files will not be changed.')) return;
      const status = document.getElementById('privacy-status');
      try { localStorage.removeItem('tlcp_vault'); if (status) status.textContent = 'All browser track saves deleted. Downloaded files and your open editor were not changed.'; }
      catch (_) { if (status) status.textContent = 'Browser storage is blocked. Use your browser site-data settings to delete saved tracks.'; }
    }));
    renderState();
    if (document.getElementById('app') && !choice) showNotice();
    // Changes in another tab must take effect before any subsequent config read/write.
    window.addEventListener('storage', event => {
      if (event.key === KEY || event.key === null) {
        choice = readChoice(); renderState();
        if (document.getElementById('app') && !choice) showNotice();
      }
    });
  }
  document.addEventListener('DOMContentLoaded', init);
  return {allowed, choose, showNotice};
})();
