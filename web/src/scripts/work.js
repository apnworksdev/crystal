// Work page: stack or list. The list filters by category and swaps the still on hover.
// The list is endless both ways: copies of the rows sit above and below the real ones,
// and the list opens on the real ones in the middle. Scrolling never moves the position by
// script while it runs: on a phone that stops the momentum dead. Once it has stopped, it
// goes back towards the middle by whole sets of rows, which looks exactly the same. Only
// the rows scroll; the still and the column bar above them stay put.

import { closeNav } from './header.js';

const VIEW_KEY = 'work-view';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
// The phone layout, as in the stylesheets.
const phoneQuery = matchMedia('(max-width: 48rem), (max-height: 30rem) and (pointer: coarse)');
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

// How far a scroll can run each way before it reaches the copies' end: more than a fast
// fling on a phone covers, so a fling never hits the end.
const LOOP_REACH = 9000;
// A pause in scroll events this long means it has stopped (Safari has no scrollend).
const LOOP_PAUSE_MS = 140;
// The height of one set of rows, and the scroll position with the real rows at the top.
let period = 0;
let home = 0;
let loopTimer = 0;

function rowsElement() {
  return list?.querySelector('.work-list__rows');
}

/** Repeats the visible rows above and below the real ones. Copies are skipped by screen readers and Tab. */
function fillLoop({ keepPlace = false } = {}) {
  endLight();
  const rowsEl = rowsElement();
  // Where the rows were within a set, to land on the same row after a rebuild.
  const place = keepPlace && period > 0 && rowsEl ? (((rowsEl.scrollTop - home) % period) + period) % period : 0;
  period = 0;
  home = 0;
  if (!rowsEl) return;
  rowsEl.querySelectorAll('[data-work-copy]').forEach((copy) => copy.remove());
  // Only the rows the filter shows are repeated. A hidden row measures 0 from the top, so
  // a set measured from it came out short and the copies drifted out of step.
  const items = originalRows()
    .filter((row) => !row.hidden)
    .map((row) => row.parentElement);
  if (!items.length) return;
  const makeSet = () => {
    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const copy = item.cloneNode(true);
      copy.setAttribute('data-work-copy', '');
      copy.setAttribute('aria-hidden', 'true');
      copy.querySelector('a')?.setAttribute('tabindex', '-1');
      fragment.append(copy);
    });
    return fragment;
  };
  // One copy below first, to measure a set.
  rowsEl.append(makeSet());
  const firstCopy = rowsEl.querySelector('[data-work-copy]');
  period = firstCopy ? firstCopy.offsetTop - items[0].offsetTop : 0;
  if (period <= 0) return;
  const screen = rowsEl.clientHeight || window.innerHeight;
  const sets = Math.min(200, Math.ceil((LOOP_REACH + screen) / period));
  for (let set = 1; set < sets; set += 1) rowsEl.append(makeSet());
  const above = document.createDocumentFragment();
  for (let set = 0; set < sets; set += 1) above.append(makeSet());
  rowsEl.prepend(above);
  home = period * sets;
  rowsEl.scrollTop = home + place;
  currentRow?.removeAttribute('data-current');
  currentRow = null;
  followCurrentRow();
}

/* ---------- Phone: the current row ----------

   There is no hover on a phone. The row on the line just under the still is the current
   one: it is marked, and the still shows its picture. The rows snap to that line. */

let currentRow = null;
let currentFrame = 0;

function markCurrent(row) {
  if (row === currentRow) return;
  currentRow?.removeAttribute('data-current');
  currentRow = row;
  row.setAttribute('data-current', '');
  showStill(row.dataset.still);
  warmNeighbours(row);
}

function followCurrentRow() {
  currentFrame = 0;
  // While rows are set aside (light), their places read 0: wait for them to come back.
  if (!list?.isConnected || list.hidden || light || !phoneQuery.matches) return;
  const rowsEl = rowsElement();
  if (!rowsEl) return;
  // The shown rows, top to bottom (hidden ones measure 0, so they are left out).
  const shown = [...rowsEl.children].filter((item) => !item.hidden && item.firstElementChild?.hasAttribute('data-work-row'));
  if (!shown.length) return;
  const base = shown[0].offsetTop;
  // The line, a few pixels into the first row under the still.
  const line = rowsEl.scrollTop + 6;
  let low = 0;
  let high = shown.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (shown[mid].offsetTop - base <= line) low = mid;
    else high = mid - 1;
  }
  const row = shown[low].firstElementChild;
  if (row?.hasAttribute('data-work-row')) markCurrent(row);
}

function followCurrentRowSoon() {
  if (!currentFrame && phoneQuery.matches) currentFrame = requestAnimationFrame(followCurrentRow);
}

/** Back towards the real rows by whole sets, once the scroll has stopped. Nothing moves on screen. */
function recentre() {
  const rowsEl = rowsElement();
  if (!rowsEl || period <= 0 || list.hidden) return;
  const away = rowsEl.scrollTop - home;
  const sets = away > 0 ? Math.floor(away / period) : Math.ceil(away / period);
  if (!sets) return;
  endLight();
  rowsEl.scrollTop -= sets * period;
}

function onListScroll(event) {
  if (!list?.isConnected || list.hidden || document.body.dataset.workView !== 'list') return;
  if (event.target !== rowsElement()) return;
  // Scrolling while the far rows are set aside would run into the gap they left. Setting
  // them aside sends a scroll event of its own, at the same place: that one is ignored.
  if (light && Math.abs(event.target.scrollTop - light.top) >= 1) endLight();
  followCurrentRowSoon();
  window.clearTimeout(loopTimer);
  loopTimer = window.setTimeout(recentre, LOOP_PAUSE_MS);
}

function onListScrollEnd(event) {
  if (!list?.isConnected || event.target !== rowsElement()) return;
  window.clearTimeout(loopTimer);
  recentre();
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
    // The list item too: an empty one still took a gap, so filtered rows were spaced unevenly.
    row.parentElement.hidden = !show;
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
  // Runs every frame while the menu moves. Writing the same value still restyles the list.
  // Set on the list itself: on the root it restyled the whole page every frame.
  const inset = `${right + 1}px`;
  const style = list?.style;
  if (style && style.getPropertyValue('--work-list-inset') !== inset) style.setProperty('--work-list-inset', inset);
}

/* ---------- Light while the header moves ----------

   The list repeats its rows thousands of pixels each way, and moving it sideways makes the
   browser lay out every one of them again, every frame. Safari could not keep up, so the
   menu seemed to open with no motion. While the header moves, only the rows on or near the
   screen stay in the layout; the rest are set aside and an empty spacer row takes their
   exact place, so nothing on screen moves. Setting them aside takes one long frame, so it is done when a
   finger or the pointer goes down on the header, before anything moves. They stay aside
   while the menu is open and come back once it has closed, or on any scroll. */

let light = null;
// Rows kept either side of the screen while light, in screens.
const LIGHT_MARGIN = 0.5;
// Set aside on a press that never became a click: put back after this long.
const LIGHT_IDLE_MS = 1500;

function menuOpen() {
  const header = document.querySelector('.site-header');
  return Boolean(header?.hasAttribute('data-open') && !header.hasAttribute('data-closing'));
}

/** Puts the rows back unless the header is moving or the menu is open. */
function settleLight() {
  if (!light || followFrame || menuOpen()) return;
  endLight();
}

function lighten() {
  if (light || !list?.isConnected || list.hidden || document.body.dataset.workView !== 'list') return;
  const rowsEl = rowsElement();
  const items = rowsEl ? [...rowsEl.children] : [];
  if (items.length < 60) return;
  const padTop = parseFloat(getComputedStyle(rowsEl).paddingTop) || 0;
  const gap = parseFloat(getComputedStyle(rowsEl).rowGap) || 0;
  const base = items[0].offsetTop;
  const view = rowsEl.clientHeight;
  const top = rowsEl.scrollTop;
  const from = top - view * LIGHT_MARGIN;
  const to = top + view * (1 + LIGHT_MARGIN);
  // Where each row sits in the scroll, from the top of the padding.
  const place = (item) => padTop + item.offsetTop - base;
  const first = items.findIndex((item) => place(item) + item.offsetHeight >= from);
  if (first < 0) return;
  let last = first;
  while (last + 1 < items.length && place(items[last + 1]) <= to) last += 1;
  const end = items[items.length - 1];
  const above = items[first].offsetTop - base;
  const below = end.offsetTop + end.offsetHeight - (items[last].offsetTop + items[last].offsetHeight);
  if (above < 1 && below < 1) return;
  // One empty row of the same height stands in for each run of rows set aside. (Padding on
  // the list instead made Chrome lose the scroll position.) The gap between rows is part of
  // what they took up, and the spacer brings one gap of its own.
  const spacer = (height) => {
    const item = document.createElement('li');
    item.setAttribute('aria-hidden', 'true');
    item.setAttribute('data-work-spacer', '');
    item.style.height = `${Math.max(0, height)}px`;
    return item;
  };
  const spacers = [];
  // Scroll anchoring would follow a row that is set aside and move the list.
  rowsEl.style.overflowAnchor = 'none';
  const aside = items.filter((item, index) => index < first || index > last);
  aside.forEach((item) => {
    item.style.display = 'none';
  });
  if (above >= 1) {
    spacers.push(spacer(above - gap));
    items[first].before(spacers[spacers.length - 1]);
  }
  if (below >= 1) {
    spacers.push(spacer(below - gap));
    items[last].after(spacers[spacers.length - 1]);
  }
  if (Math.abs(rowsEl.scrollTop - top) >= 1) rowsEl.scrollTop = top;
  light = { rowsEl, aside, spacers, top, timer: window.setTimeout(settleLight, LIGHT_IDLE_MS) };
}

function endLight() {
  if (!light) return;
  const { rowsEl, aside, spacers, timer } = light;
  light = null;
  window.clearTimeout(timer);
  const now = rowsEl.scrollTop;
  spacers.forEach((item) => item.remove());
  aside.forEach((item) => {
    item.style.display = '';
  });
  // The spacers stood in for the rows exactly, so the place is kept as it is now.
  if (rowsEl.isConnected && Math.abs(rowsEl.scrollTop - now) >= 1) rowsEl.scrollTop = now;
  rowsEl.style.overflowAnchor = '';
}

// The list starts 1px right of the header. While the menu grows or folds, the list moves
// with it frame by frame, so the two read as one movement.
let followFrame = 0;
let followUntil = 0;

/** `moving`: the header is about to move (crystal:menu-motion), so the list goes light. */
function followHeader(moving = false) {
  if (document.body.dataset.workView !== 'list') return;
  if (moving === true) lighten();
  followUntil = performance.now() + 1200;
  if (followFrame) return;
  const tick = (now) => {
    syncInset();
    const going = now < followUntil && document.body.dataset.workView === 'list';
    followFrame = going ? requestAnimationFrame(tick) : 0;
    if (!going) settleLight();
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
  endLight();
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
  currentRow = null;
  cancelAnimationFrame(currentFrame);
  currentFrame = 0;
  endLight();
  list = document.querySelector('[data-work-list]');
  if (!list) {
    delete document.body.dataset.workView;
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

// The still only changes once its file has arrived, so on a first pass down the list it
// lagged behind the pointer. The rows around the hovered one start loading ahead of time.
const warmed = new Set();
const WARM_AROUND = 3;

function warmNeighbours(row) {
  const rows = [...list.querySelectorAll('[data-work-row]:not([hidden])')];
  const at = rows.indexOf(row);
  if (at < 0) return;
  rows.slice(Math.max(0, at - WARM_AROUND), at + WARM_AROUND + 1).forEach((near) => {
    const src = near.dataset.still;
    if (!src || warmed.has(src)) return;
    warmed.add(src);
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
  });
}

document.addEventListener('pointerover', (event) => {
  if (!list?.isConnected || list.hidden || phoneQuery.matches) return;
  const row = event.target.closest?.('[data-work-row]');
  if (!row || row.hidden || !list.contains(row)) return;
  showStill(row.dataset.still);
  warmNeighbours(row);
});

document.addEventListener('focusin', (event) => {
  if (!list?.isConnected || list.hidden) return;
  const row = event.target.closest?.('[data-work-row]');
  if (!row || row.hidden || !list.contains(row)) return;
  showStill(row.dataset.still);
});

let fillTimer = 0;
let fillWidth = window.innerWidth;
window.addEventListener('resize', () => {
  syncInset();
  // A phone's address bar changes the height alone while scrolling. Rebuilding then would
  // move the rows under the finger, and the copies already reach far past the screen.
  if (window.innerWidth === fillWidth) return;
  fillWidth = window.innerWidth;
  window.clearTimeout(fillTimer);
  fillTimer = window.setTimeout(() => {
    if (list?.isConnected && !list.hidden) fillLoop({ keepPlace: true });
  }, 150);
});
// Scroll does not bubble, so the rows' own scrolling is caught on the way down.
document.addEventListener('scroll', onListScroll, { capture: true, passive: true });
document.addEventListener('scrollend', onListScrollEnd, { capture: true, passive: true });
document.addEventListener('wheel', onListWheel, { passive: true });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && list?.isConnected) followHeader();
});

document.addEventListener('transitionend', (event) => {
  if (event.propertyName !== '--bubble') return;
  syncInset();
  if (event.target === list?.querySelector('[data-filters-panel]')) finishFiltersClose();
});

document.addEventListener('crystal:menu-motion', () => followHeader(true));
// A press on the header usually opens or closes something there: get light before it moves.
document.addEventListener('pointerdown', (event) => {
  if (!list?.isConnected || !(event.target instanceof Element)) return;
  if (event.target.closest('.site-header')) lighten();
}, { passive: true });
