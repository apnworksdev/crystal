// Work page: reel or list. The list filters by category and swaps the still on hover.

import { closeNav } from './header.js';

const VIEW_KEY = 'work-view';
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

function setFiltersOpen(open) {
  const panel = list?.querySelector('[data-filters-panel]');
  const openButton = list?.querySelector('[data-filters-open]');
  const closeButton = list?.querySelector('[data-filters-close]');
  if (!panel || !openButton || !closeButton) return;
  panel.hidden = !open;
  openButton.hidden = open;
  closeButton.hidden = !open;
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
  if (event.propertyName === '--bubble') syncInset();
});
