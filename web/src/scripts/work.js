// Work page: stack or list. The list filters by category and swaps the still on hover.
// The list is endless: its rows repeat below, and scrolling past one set jumps back by
// exactly one set, so the last project runs straight into the first. Only the rows scroll;
// the still and the column bar above them stay put.

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

function originalRows() {
  return [...list.querySelectorAll('li:not([data-work-copy]) > [data-work-row]')];
}

/** Repeats the visible rows until they outrun the screen. Copies are skipped by screen readers and Tab. */
function fillLoop() {
  const rowsEl = list?.querySelector('.work-list__rows');
  if (!rowsEl) return;
  rowsEl.querySelectorAll('[data-work-copy]').forEach((copy) => copy.remove());
  const items = originalRows().map((row) => row.parentElement);
  if (!items.some((item) => !item.firstElementChild.hidden)) return;
  const addSet = () => {
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const copy = item.cloneNode(true);
      copy.setAttribute('data-work-copy', '');
      copy.setAttribute('aria-hidden', 'true');
      copy.querySelector('a')?.setAttribute('tabindex', '-1');
      fragment.append(copy);
    });
    rowsEl.append(fragment);
  };
  // One copy first, to measure a set. Then enough to fill the rows area at the jump.
  addSet();
  const period = loopPeriod();
  if (period <= 0) return;
  const sets = Math.min(200, Math.ceil((rowsEl.clientHeight || window.innerHeight) / period) + 2);
  for (let set = 2; set < sets; set += 1) addSet();
}

function loopPeriod() {
  const rowsEl = list?.querySelector('.work-list__rows');
  const firstCopy = rowsEl?.querySelector('[data-work-copy]');
  const first = rowsEl?.firstElementChild;
  if (!firstCopy || !first) return 0;
  return firstCopy.offsetTop - first.offsetTop;
}

function onListScroll(event) {
  if (!list?.isConnected || list.hidden || document.body.dataset.workView !== 'list') return;
  const rowsEl = list.querySelector('.work-list__rows');
  if (event.target !== rowsEl) return;
  const period = loopPeriod();
  if (period <= 0) return;
  // Past one whole set, the same rows sit one set higher, so the jump does not show.
  if (rowsEl.scrollTop >= period) rowsEl.scrollTop -= period;
}

/** The still and the column bar do not scroll. A wheel over them moves the rows. */
function onListWheel(event) {
  if (!list?.isConnected || list.hidden || document.body.dataset.workView !== 'list') return;
  const rowsEl = list.querySelector('.work-list__rows');
  if (!rowsEl || !(event.target instanceof Node) || !list.contains(event.target) || rowsEl.contains(event.target)) return;
  if (event.target instanceof Element && event.target.closest('.work-list__filters')) return;
  const line = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rowsEl.clientHeight : 1;
  rowsEl.scrollTop += event.deltaY * line;
}

function applyFilter(value) {
  const rows = originalRows();
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
  fillLoop();
}

function syncInset() {
  if (document.body.dataset.workView !== 'list') return;
  const header = document.querySelector('.site-header');
  if (!header) return;
  // About lies over the page and makes the header full size. The list stays where it is.
  if (header.hasAttribute('data-about')) return;

  // The + sits 1px from the Index bar. Ceil would round the edge and the gap
  // together, so a fractional header edge opens a gap of anywhere from 1px to 2px.
  const right = header.getBoundingClientRect().right;
  document.documentElement.style.setProperty('--work-list-inset', `${right + 1}px`);
}

// The list starts 1px right of the header. While the menu grows or folds, the list moves
// with it frame by frame, so the two read as one movement.
let followFrame = 0;
let followUntil = 0;

function followHeader() {
  if (document.body.dataset.workView !== 'list') return;
  followUntil = performance.now() + 1200;
  if (followFrame) return;
  const tick = (now) => {
    syncInset();
    followFrame = now < followUntil && document.body.dataset.workView === 'list' ? requestAnimationFrame(tick) : 0;
  };
  followFrame = requestAnimationFrame(tick);
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
  fillLoop();
}

// Switching between the stack and the list: the page content fades out, changes, and
// fades back in on the same curve as a page change (page.js).
let switching = null;

function switchView(view) {
  const content = document.querySelector('main');
  if (reducedMotion.matches || !content) {
    setView(view);
    return;
  }
  const generation = (switching = {});
  content.getAnimations().forEach((animation) => animation.cancel());
  const out = content.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: 160,
    easing: 'ease-in',
    fill: 'forwards',
  });
  Promise.race([out.finished.catch(() => {}), new Promise((resolve) => window.setTimeout(resolve, 240))]).then(() => {
    if (switching !== generation || !content.isConnected) return;
    // Phone: the list docks the header at the top and the stack at the bottom. It glides there.
    const header = document.querySelector('.site-header');
    const before = header?.getBoundingClientRect().top;
    setView(view);
    window.scrollTo(0, 0);
    out.cancel();
    const after = header?.getBoundingClientRect().top;
    if (header && Math.abs(before - after) > 1) {
      header.animate([{ translate: `0 ${before - after}px` }, { translate: '0 0' }], {
        duration: 500,
        easing: 'cubic-bezier(0.19, 1, 0.22, 1)',
      });
    }
    content.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: 'cubic-bezier(0.19, 1, 0.22, 1)' });
    switching = null;
  });
}

export function setUpWork() {
  switching = null;
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
  syncInset();
}

document.addEventListener('click', (event) => {
  if (!list?.isConnected) return;

  const viewButton = event.target.closest('[data-view]');
  if (viewButton) {
    const current = document.body.dataset.workView === 'list' ? 'list' : 'reel';
    if (viewButton.dataset.view !== current) switchView(viewButton.dataset.view);
    return;
  }

  // Any click can open or close the menu (outside it closes it), so follow the header.
  followHeader();

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

let fillTimer = 0;
window.addEventListener('resize', () => {
  syncInset();
  window.clearTimeout(fillTimer);
  fillTimer = window.setTimeout(() => {
    if (list?.isConnected && !list.hidden) fillLoop();
  }, 150);
});
// Scroll does not bubble, so the rows' own scrolling is caught on the way down.
document.addEventListener('scroll', onListScroll, { capture: true, passive: true });
document.addEventListener('wheel', onListWheel, { passive: true });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && list?.isConnected) followHeader();
});

document.addEventListener('transitionend', (event) => {
  if (event.propertyName !== '--bubble') return;
  syncInset();
  if (event.target === list?.querySelector('[data-filters-panel]')) finishFiltersClose();
});

document.addEventListener('crystal:menu-motion', followHeader);
