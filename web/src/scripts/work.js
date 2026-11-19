// Work page: reel or list. The list filters by category and swaps the still on hover.

import { closeNav } from './header.js';

const VIEW_KEY = 'work-view';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let list;

function stillImage() {
  return list?.querySelector('[data-work-still]');
}

function showStill(src) {
  const image = stillImage();
  if (!image || !src || image.getAttribute('src') === src) return;
  image.removeAttribute('srcset');
  image.src = src;
}

function applyFilter(value) {
  const rows = [...list.querySelectorAll('[data-work-row]')];
  let count = 0;
  rows.forEach((row) => {
    const categories = (row.dataset.categories || '').split(' ').filter(Boolean);
    const show = !value || value === 'all' || categories.includes(value);
    row.hidden = !show;
    if (!show) return;
    count += 1;
    const index = row.querySelector('[data-index]');
    if (index) index.textContent = String(count).padStart(3, '0');
  });

  const empty = list.querySelector('[data-work-empty]');
  if (empty) empty.hidden = count > 0;

  list.querySelectorAll('[data-filter]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.filter === (value || 'all')));
  });

  const first = rows.find((row) => !row.hidden);
  if (first) showStill(first.dataset.still);
}

function syncInset() {
  if (document.body.dataset.workView !== 'list') return;
  const header = document.querySelector('.site-header');
  if (!header) return;

  // The + sits 1px from the Index bar. Ceil would round the edge and the gap
  // together, so a fractional header edge opens a gap of anywhere from 1px to 2px.
  const right = header.getBoundingClientRect().right;
  document.documentElement.style.setProperty('--work-list-inset', `${right + 1}px`);
}

function finishFiltersClose() {
  const filters = list?.querySelector('.work-list__filters');
  const panel = list?.querySelector('[data-filters-panel]');
  const openButton = list?.querySelector('[data-filters-open]');
  const closeButton = list?.querySelector('[data-filters-close]');
  if (!filters || !panel || filters.hasAttribute('data-open')) return;
  panel.hidden = true;
  panel.style.transition = '';
  panel.style.removeProperty('--bubble');
  filters.removeAttribute('data-closing');
  if (openButton) openButton.hidden = false;
  if (closeButton) closeButton.hidden = true;
}

function setFiltersOpen(open) {
  const filters = list?.querySelector('.work-list__filters');
  const panel = list?.querySelector('[data-filters-panel]');
  const openButton = list?.querySelector('[data-filters-open]');
  const closeButton = list?.querySelector('[data-filters-close]');
  if (!filters || !panel || !openButton || !closeButton) return;

  const shown = filters.hasAttribute('data-open');
  if (open === shown && !filters.hasAttribute('data-closing')) return;

  if (reducedMotion.matches) {
    filters.removeAttribute('data-open');
    filters.removeAttribute('data-closing');
    panel.hidden = !open;
    panel.style.removeProperty('--bubble');
    openButton.hidden = open;
    closeButton.hidden = !open;
    return;
  }

  if (open) {
    openButton.hidden = true;
    closeButton.hidden = false;
    panel.hidden = false;
    panel.getAnimations().forEach((animation) => animation.cancel());
    // Pin before data-open. Reversing --bubble from the stylesheet gets stuck.
    panel.style.transition = 'none';
    panel.style.setProperty('--bubble', '0');
    filters.removeAttribute('data-closing');
    filters.setAttribute('data-open', '');
    panel.offsetHeight;
    panel.style.transition = '';
    panel.style.removeProperty('--bubble');
    return;
  }

  const current = getComputedStyle(panel).getPropertyValue('--bubble').trim() || '0';
  panel.getAnimations().forEach((animation) => animation.cancel());
  panel.style.transition = 'none';
  panel.style.setProperty('--bubble', current);
  filters.setAttribute('data-closing', '');
  filters.removeAttribute('data-open');
  panel.offsetHeight;
  panel.style.transition = '';
  panel.style.setProperty('--bubble', '0');
  if (parseFloat(current) === 0) finishFiltersClose();
}

function setView(view) {
  const reel = document.querySelector('[data-reel]');
  if (!list || !reel) return;

  const isList = view === 'list';
  // Close while the current view's menu layout is still in effect.
  if (isList || document.body.dataset.workView === 'list') closeNav();
  list.hidden = !isList;
  reel.hidden = isList;
  if (isList) document.body.dataset.workView = 'list';
  else delete document.body.dataset.workView;
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.view === (isList ? 'list' : 'reel')));
  });

  try {
    sessionStorage.setItem(VIEW_KEY, isList ? 'list' : 'reel');
  } catch {
    // Storage can be blocked. The view still switches for this page.
  }

  if (!isList) return;
  setFiltersOpen(false);
  syncInset();
}

export function setUpWork() {
  list = document.querySelector('[data-work-list]');
  if (!list) {
    delete document.body.dataset.workView;
    document.documentElement.style.removeProperty('--work-list-inset');
    return;
  }

  let stored = 'reel';
  try {
    stored = sessionStorage.getItem(VIEW_KEY) || 'reel';
  } catch {
    // Keep the reel.
  }
  setView(stored === 'list' ? 'list' : 'reel');
}

document.addEventListener('click', (event) => {
  if (!list?.isConnected) return;

  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    const current = document.body.dataset.workView === 'list' ? 'list' : 'reel';
    if (viewButton.dataset.view !== current) setView(viewButton.dataset.view);
    return;
  }

  if (event.target.closest('.site-header__toggle')) syncInset();

  if (event.target.closest('[data-filters-open]')) {
    setFiltersOpen(true);
    return;
  }

  if (event.target.closest('[data-filters-close]')) {
    setFiltersOpen(false);
    return;
  }

  const filter = event.target.closest('[data-filter]');
  if (filter && list.contains(filter)) {
    applyFilter(filter.dataset.filter);
    return;
  }

  if (!event.target.closest('.work-list__filters')) setFiltersOpen(false);
});

/** Points the shared still at the project about to open, so the cover starts there. */
function armListStill(row) {
  if (!row) return;
  showStill(row.dataset.still);
}

document.addEventListener('click', (event) => {
  if (!list?.isConnected || list.hidden) return;
  const row = event.target.closest?.('[data-work-row]');
  if (!row || row.hidden || !list.contains(row)) return;
  armListStill(row);
}, true);

document.addEventListener('pointerover', (event) => {
  if (!list?.isConnected || list.hidden) return;
  const row = event.target.closest?.('[data-work-row]');
  if (!row || row.hidden || !list.contains(row)) return;
  showStill(row.dataset.still);
});

document.addEventListener('focusin', (event) => {
  if (!list?.isConnected || list.hidden) return;
  const row = event.target.closest?.('[data-work-row]');
  if (!row || row.hidden || !list.contains(row)) return;
  showStill(row.dataset.still);
});

window.addEventListener('resize', () => syncInset());

document.addEventListener('transitionend', (event) => {
  if (event.propertyName !== '--bubble') return;
  syncInset();
  if (event.target === list?.querySelector('[data-filters-panel]')) finishFiltersClose();
});
