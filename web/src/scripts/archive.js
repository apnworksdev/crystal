// The archive. The list is a native scroll behind the header bar, which sits in the
// middle of the screen (archive.css). The scroll snaps so a row always rests just under
// the bar. Rows that pass the bar sit just above it instead of under it. Where the browser
// supports scroll-driven animations, the stylesheet does that in step with the scroll.
// Elsewhere two IntersectionObservers move each row up by the bar's height as it crosses,
// and back down when it returns.
//
// The list is endless both ways, as the Work list is (work.js): copies of the rows sit
// above and below the real ones, and the list opens on the real ones. Once a scroll has
// stopped, it goes back towards the middle by whole sets of rows, which looks exactly the
// same. The footer is not part of the list: it is fixed to the bottom of the screen
// (footer.css, archive.css).
//
// The bar and the rows share one horizontal scroll. The bar eases open on arrival and
// shut before a section change. While the menu grows or folds, the list follows the bar
// frame by frame (followMenu). It reads the bar's live size once a frame and never
// re-measures the open layout then, which switched the bar's transition off and was the lag.

import { watchScrollEnd } from './scroll-end.js';

let scrollEl = null;
let headerEl = null;
let observer = null;
let rows = [];
let layoutFrame = 0;
let lastAlign = '';
/** Rows below the bar: they move up once their top passes it. */
let below = null;
/** Rows moved above the bar: they move back once their own place is below it again. */
let above = null;
let watchedHeight = 0;
/** True while the columns fold away with the menu (foldColumns). */
let folding = false;
let stopScrollEnd = null;
// How far a scroll can run each way before it reaches the copies' end: more than a fast
// fling on a phone covers, so a fling never hits the end.
const LOOP_REACH = 9000;
// The height of one set of rows, and the scroll position with the real rows under the bar.
let period = 0;
let home = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
// Browsers that can tie an animation to the scroll move the rows in CSS, in the same frame.
const scrollDriven = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()');

/**
 * Where the bar's columns sit once the bar is fully open. While it eases open the
 * columns are still narrow, so measuring them then would squash the rows and grow
 * them with the bar. Offsets ignore transforms, such as the header sliding in from
 * the previous page or following the sideways scroll.
 */
function openLayout(header, columns) {
  const measure = () => ({
    inset: header.offsetLeft + columns.offsetLeft,
    width: columns.offsetWidth,
    track: header.offsetLeft + header.offsetWidth,
  });
  if (header.classList.contains('is-archive-open') && !header.style.width) return measure();

  const still = [header, columns];
  const width = header.style.width;
  const wasOpen = header.classList.contains('is-archive-open');
  // Put back whatever was set inline, such as a fold in progress, not just ''.
  const transitions = still.map((element) => element.style.transition);
  still.forEach((element) => {
    element.style.transition = 'none';
  });
  header.style.width = '';
  header.classList.add('is-archive-open');
  const layout = measure();
  header.classList.toggle('is-archive-open', wasOpen);
  header.style.width = width;
  header.offsetWidth;
  still.forEach((element, index) => {
    element.style.transition = transitions[index];
  });
  return layout;
}

function align() {
  const header = headerEl;
  const scroll = scrollEl;
  const columns = header?.querySelector('[data-archive-columns]');
  if (!header || !scroll || !columns) return;
  // Measuring switches the bar's transition off for a moment, which would cut a running
  // open, close or fold short. Those measure once they have finished instead.
  if (endTween || folding) return;
  // About hides the bar. Measuring it then would resize the header, fire the observer
  // again and loop every frame until About closes.
  if (header.hasAttribute('data-about')) return;
  // Menu open: followMenu keeps the list with the bar. Measuring the open layout here would
  // switch the bar's transition off mid-motion.
  if (header.hasAttribute('data-open')) return;

  const { inset, width, track } = openLayout(header, columns);
  const key = `${Math.round(inset)}|${Math.round(width)}|${Math.round(track)}`;
  if (key === lastAlign) return;
  lastAlign = key;
  commitFollow();
  scroll.style.setProperty('--archive-inset', `${Math.round(inset)}px`);
  scroll.style.setProperty('--archive-columns-width', `${Math.round(width)}px`);
  scroll.style.setProperty('--archive-track', `${Math.round(track)}px`);
}

/* ---------- Following the menu ---------- */

let followFrame = 0;
let followUntil = 0;
/** What followBar set directly while the bar moved, or null. */
let followed = null;

/** The bar as it is drawn this frame. Offsets ignore the sideways-scroll transform. */
function followBar() {
  const header = headerEl;
  const scroll = scrollEl;
  const columns = header?.querySelector('[data-archive-columns]');
  if (!header || !scroll || !columns || !header.isConnected) return;
  // The bar is hidden behind About, eases open or shut, or folds with a section change:
  // those have their own measuring.
  if (header.hasAttribute('data-about') || endTween || folding) return;
  if (!header.classList.contains('is-archive-open')) return;
  const inset = Math.round(header.offsetLeft + columns.offsetLeft);
  const width = Math.round(columns.offsetWidth);
  const track = Math.round(header.offsetLeft + header.offsetWidth);
  const key = `${inset}|${width}|${track}`;
  if (key === lastAlign) return;
  lastAlign = key;
  // A custom property on the scroller restyles every row and its cells, thousands of
  // elements, each frame. While the bar moves, the list and main take the same lengths
  // directly instead, which restyles only them (commitFollow puts the properties back).
  const list = scroll.querySelector('.archive');
  const main = list?.parentElement;
  if (!list || !main) return;
  followed = { scroll, list, main, inset, width, track };
  list.style.marginLeft = `${inset}px`;
  list.style.width = `${width}px`;
  main.style.minWidth = `${track}px`;
}

/** Once the bar has settled: back to the stylesheet's custom properties, at the same lengths. */
function commitFollow() {
  if (!followed) return;
  const { scroll, list, main, inset, width, track } = followed;
  followed = null;
  scroll.style.setProperty('--archive-inset', `${inset}px`);
  scroll.style.setProperty('--archive-columns-width', `${width}px`);
  scroll.style.setProperty('--archive-track', `${track}px`);
  list.style.marginLeft = '';
  list.style.width = '';
  main.style.minWidth = '';
}

/** The menu is opening or closing (header.js): the rows keep the bar's width as it moves. */
function followMenu() {
  if (document.body.dataset.page !== 'archive' || !headerEl) return;
  lighten();
  // Longer than the slowest menu motion, so the rows end where the bar ends.
  followUntil = performance.now() + 1200;
  if (followFrame) return;
  const tick = (now) => {
    followBar();
    const going = now < followUntil && document.body.dataset.page === 'archive';
    followFrame = going ? requestAnimationFrame(tick) : 0;
    if (going) return;
    commitFollow();
    settleLight();
  };
  followFrame = requestAnimationFrame(tick);
}

document.addEventListener('crystal:menu-motion', followMenu);

/* ---------- Light while the header moves ----------

   Every row, copies included, runs a scroll-driven animation (archive.css). While anything
   else animates, such as the menu, the browser brings all of them up to date every frame,
   and again on every getAnimations() call the header makes: about 7 ms each with 800 rows,
   so the menu dropped every other frame. Nothing scrolls while the header moves, so rows
   more than a screen away from the visible ones drop their animation until it has settled
   (data-archive-far). They are off screen, so nothing visible changes. The first scroll,
   or a resize, puts them back before anything is drawn. As on the Work list (work.js), this
   is done when a finger or the pointer goes down on the header, before anything moves. */

/** Rows set aside, or null. */
let light = null;
let lightTimer = 0;
// Set aside on a press that never became a click: put back after this long.
const LIGHT_IDLE_MS = 1500;

function menuOpen() {
  return Boolean(headerEl?.hasAttribute('data-open') && !headerEl.hasAttribute('data-closing'));
}

function lighten() {
  if (light || !scrollDriven || !scrollEl || rows.length < 100) return;
  const main = rows[0].offsetParent;
  if (!main) return;
  // Offsets ignore the rows' own moves, which change while they animate.
  const top = main.getBoundingClientRect().top;
  const view = scrollEl.clientHeight;
  light = rows.filter((row) => {
    const y = top + row.offsetTop;
    return y + row.offsetHeight < -view || y > view * 2;
  });
  light.forEach((row) => row.setAttribute('data-archive-far', ''));
  window.clearTimeout(lightTimer);
  lightTimer = window.setTimeout(settleLight, LIGHT_IDLE_MS);
}

function endLight() {
  window.clearTimeout(lightTimer);
  if (!light) return;
  light.forEach((row) => row.removeAttribute('data-archive-far'));
  light = null;
}

/** Puts the rows back unless the header is moving or the menu is open. */
function settleLight() {
  if (!light || followFrame || menuOpen()) return;
  endLight();
}

// A press on the header usually opens or closes something there: get light before it moves.
document.addEventListener(
  'pointerdown',
  (event) => {
    if (document.body.dataset.page !== 'archive' || !(event.target instanceof Element)) return;
    if (event.target.closest('.site-header')) lighten();
  },
  { passive: true },
);

let lastShift = '';

function onScroll() {
  if (!headerEl || !scrollEl) return;
  // Any scroll brings the rows set aside back before it is drawn.
  endLight();
  // Vertical scrolls fire scroll too; only the sideways offset moves the bar.
  const shift = `${scrollEl.scrollLeft}px`;
  if (shift === lastShift) return;
  lastShift = shift;
  headerEl.style.setProperty('--archive-shift', shift);
}

/* ---------- Rows passing the bar ---------- */

/**
 * The bar's bottom edge, measured from the top of the scroller. The bar sits in the
 * middle of the screen, so this follows the height alone.
 */
function barLine() {
  const bar = headerEl?.offsetHeight || 24;
  return scrollEl.clientHeight / 2 + bar / 2;
}

function skip() {
  return parseFloat(getComputedStyle(document.body).getPropertyValue('--archive-skip')) || 25;
}

// A region from far above the screen down to `line`: a row intersects it once its top
// is above the line. Far to the sides too, so a row scrolled sideways still counts.
function region(line) {
  const height = scrollEl.clientHeight;
  return `100000px 100000px ${-Math.max(0, Math.round(height - line))}px 100000px`;
}

function onBelow(entries) {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    below.unobserve(entry.target);
    entry.target.setAttribute('data-archive-before', '');
    above.observe(entry.target);
  }
}

function onAbove(entries) {
  for (const entry of entries) {
    if (entry.isIntersecting) continue;
    above.unobserve(entry.target);
    entry.target.removeAttribute('data-archive-before');
    below.observe(entry.target);
  }
}

/**
 * Two watchers, so a row never flips back and forth at the line. A row below the bar
 * moves up as soon as its top passes the bar. A moved row sits a bar's height higher,
 * so it is watched against a line a bar's height higher: it moves back only once its own
 * place is below the bar again.
 */
function watchRows() {
  below?.disconnect();
  above?.disconnect();
  below = null;
  above = null;
  if (!scrollEl || !rows.length || typeof IntersectionObserver === 'undefined') return;
  // The stylesheet ties the move to the scroll itself where the browser can (archive.css).
  if (scrollDriven) return;
  watchedHeight = scrollEl.clientHeight;
  const line = barLine();
  below = new IntersectionObserver(onBelow, { root: scrollEl, rootMargin: region(line), threshold: 0 });
  above = new IntersectionObserver(onAbove, { root: scrollEl, rootMargin: region(line - skip()), threshold: 0 });
  rows.forEach((row) => {
    if (row.hasAttribute('data-archive-before')) above.observe(row);
    else below.observe(row);
  });
}

/* ---------- Endless list ---------- */

/** Repeats the rows, and their snap points, above and below the real ones. Copies are
 *  skipped by screen readers. */
function fillLoop() {
  period = 0;
  home = 0;
  const list = scrollEl?.querySelector('.archive');
  const snaps = scrollEl?.querySelector('[data-archive-snaps]');
  if (!list) return [];
  list.querySelectorAll('[data-archive-copy]').forEach((copy) => copy.remove());
  snaps?.querySelectorAll('[data-archive-copy]').forEach((copy) => copy.remove());
  const items = [...list.querySelectorAll('.archive__item')];
  const snapItems = snaps ? [...snaps.children] : [];
  if (!items.length) return [];
  const makeSet = (source) => {
    const fragment = document.createDocumentFragment();
    source.forEach((item) => {
      const copy = item.cloneNode(true);
      copy.removeAttribute('data-archive-before');
      copy.setAttribute('data-archive-copy', '');
      copy.setAttribute('aria-hidden', 'true');
      fragment.append(copy);
    });
    return fragment;
  };
  // One copy below first, to measure a set. Offsets ignore the rows' own moves.
  list.append(makeSet(items));
  const firstCopy = list.querySelector('[data-archive-copy]');
  period = firstCopy.offsetTop - items[0].offsetTop;
  if (period <= 0) {
    period = 0;
    return items;
  }
  const screen = scrollEl.clientHeight || window.innerHeight;
  const sets = Math.min(100, Math.ceil((LOOP_REACH + screen) / period));
  for (let set = 1; set < sets; set += 1) list.append(makeSet(items));
  const above = document.createDocumentFragment();
  for (let set = 0; set < sets; set += 1) above.append(makeSet(items));
  list.prepend(above);
  if (snaps && snapItems.length) {
    const below = document.createDocumentFragment();
    for (let set = 0; set < sets * 2; set += 1) below.append(makeSet(snapItems));
    snaps.append(below);
  }
  // Scrolled to 0 the first row rests under the bar; the real first row is `sets` sets on.
  home = period * sets;
  scrollEl.scrollTop = home;
  return [...list.querySelectorAll('.archive__item')];
}

/** Back towards the real rows by whole sets, once the scroll has stopped. Nothing moves on screen. */
function recentre() {
  if (!scrollEl || period <= 0) return;
  endLight();
  const away = scrollEl.scrollTop - home;
  const sets = away > 0 ? Math.floor(away / period) : Math.ceil(away / period);
  if (!sets) return;
  scrollEl.scrollTop -= sets * period;
}

/* ---------- Keys ---------- */

function onKeyDown(event) {
  if (document.body.dataset.page !== 'archive' || !scrollEl || !rows.length) return;
  if (event.altKey || event.ctrlKey || event.metaKey || headerEl?.hasAttribute('data-about')) return;
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('input, textarea, select, button, a, [contenteditable]')) return;
  const pitch = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : skip();
  const page = Math.max(1, Math.floor(scrollEl.clientHeight / 2 / pitch) - 1) * pitch;
  const moves = { ArrowDown: pitch, ArrowUp: -pitch, PageDown: page, PageUp: -page, ' ': event.shiftKey ? -page : page };
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    // The first or the last row of the set on screen.
    const into = period > 0 ? (((scrollEl.scrollTop - home) % period) + period) % period : scrollEl.scrollTop;
    const first = scrollEl.scrollTop - into;
    const top = event.key === 'Home' ? first : first + Math.max(0, (period || scrollEl.scrollHeight) - pitch);
    scrollEl.scrollTo({ top, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    return;
  }
  if (!(event.key in moves)) return;
  event.preventDefault();
  scrollEl.scrollBy({ top: moves[event.key], behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

/* ---------- Layout ---------- */

function scheduleLayout() {
  if (layoutFrame) return;
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    if (document.body.dataset.page !== 'archive') return;
    align();
    // The bar's line moves with the height, so the watchers need it again.
    if (scrollEl && scrollEl.clientHeight !== watchedHeight) watchRows();
  });
}

function detach() {
  endLight();
  folding = false;
  stopScrollEnd?.();
  stopScrollEnd = null;
  period = 0;
  home = 0;
  scrollEl?.removeEventListener('scroll', onScroll);
  observer?.disconnect();
  observer = null;
  below?.disconnect();
  above?.disconnect();
  below = null;
  above = null;
  if (layoutFrame) cancelAnimationFrame(layoutFrame);
  layoutFrame = 0;
  if (followFrame) cancelAnimationFrame(followFrame);
  followFrame = 0;
  commitFollow();
  lastAlign = '';
  lastShift = '';
  scrollEl = null;
  rows = [];
}

/* ---------- The bar ---------- */

/**
 * The bar's width goes between max-content and a length, which CSS cannot animate.
 * Measure both ends with transitions off, put the old state back, then transition between the
 * two measured widths. The columns keep their own CSS transitions.
 */
let endTween = null;

/**
 * How wide the shut header looks: up to the end of its last piece before the bar. Safari
 * sizes the header's own box with the bar's labels too, so the box can be far wider than
 * what shows, and a tween from there jumped the bar half open. Offsets ignore transforms.
 */
function rowWidth(header) {
  let right = 0;
  [...header.children].forEach((child) => {
    if (child.matches('[data-archive-columns]') || !child.getClientRects().length) return;
    if (getComputedStyle(child).position === 'absolute') return;
    right = Math.max(right, child.offsetLeft + child.offsetWidth);
  });
  return right;
}

function tweenWidth(header, open) {
  const columns = header.querySelector('[data-archive-columns]');
  const still = [header, columns].filter(Boolean);
  const shut = !header.classList.contains('is-archive-open') && !header.style.width;
  const from = shut ? rowWidth(header) : header.getBoundingClientRect().width;
  endTween?.();

  still.forEach((element) => {
    element.style.transition = 'none';
  });
  header.style.width = '';
  header.classList.toggle('is-archive-open', open);
  const to = open ? header.getBoundingClientRect().width : rowWidth(header);
  header.classList.toggle('is-archive-open', !open);
  header.style.width = `${from}px`;
  header.offsetWidth;
  still.forEach((element) => {
    element.style.transition = '';
  });
  header.classList.toggle('is-archive-open', open);
  header.style.width = `${to}px`;

  const done = () => {
    header.removeEventListener('transitionend', onEnd);
    window.clearTimeout(timer);
    header.style.width = '';
    endTween = null;
    if (header.isConnected && document.body.dataset.page === 'archive') align();
  };
  endTween = done;
  const onEnd = (event) => {
    if (event.target === header && event.propertyName === 'width') done();
  };
  header.addEventListener('transitionend', onEnd);
  const timer = window.setTimeout(done, 1000);
}

function easeOpen(header) {
  if (reducedMotion.matches) {
    header.style.transition = 'none';
    header.classList.add('is-archive-open');
    header.offsetWidth;
    header.style.transition = '';
    return;
  }
  const open = () => {
    if (document.body.dataset.page !== 'archive' || header.classList.contains('is-archive-open')) return;
    tweenWidth(header, true);
  };
  // The header row may still be sliding into its archive places (News moves out of the row,
  // header.js). The bar opens once that has landed.
  const wait = Math.max(0, (header.rowSettleAt || 0) - performance.now());
  if (wait > 0) window.setTimeout(() => requestAnimationFrame(open), wait);
  else requestAnimationFrame(open);
}

export function setUpArchive() {
  detach();
  headerEl = document.querySelector('.site-header');
  if (!headerEl || document.body.dataset.page !== 'archive') {
    headerEl?.classList.remove('is-archive-open');
    headerEl?.style.removeProperty('--archive-shift');
    headerEl = null;
    return;
  }

  scrollEl = document.querySelector('[data-archive-scroll]');
  if (scrollEl) {
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    scrollEl.scrollTop = 0;
    scrollEl.querySelectorAll('.archive__item').forEach((row) => row.removeAttribute('data-archive-before'));
  }
  rows = scrollEl ? fillLoop() : [];
  if (scrollEl && period > 0) stopScrollEnd = watchScrollEnd(scrollEl, recentre);

  const columns = headerEl.querySelector('[data-archive-columns]');
  if (columns && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      // Skip while the menu is open: followMenu keeps the list with the shrinking columns.
      if (headerEl?.hasAttribute('data-open')) return;
      scheduleLayout();
    });
    observer.observe(columns);
    observer.observe(headerEl);
    if (scrollEl) observer.observe(scrollEl);
  }
  align();
  watchRows();
  rows[0]?.parentElement.setAttribute('data-archive-ready', '');
  easeOpen(headerEl);
}

/** After About closes on the archive: the bar eases open again, as on arrival. */
export function reopenArchiveBar() {
  if (document.body.dataset.page !== 'archive' || !headerEl?.isConnected) return;
  if (headerEl.classList.contains('is-archive-open')) return;
  easeOpen(headerEl);
}

/**
 * Leaving with the menu open: the menu is folding at the same time, so a tween towards a
 * width measured now would miss. Instead the columns are pinned at their width and shrink
 * to nothing on the closing curve; the header simply follows its contents.
 */
function foldColumns(header) {
  const columns = header.querySelector('[data-archive-columns]');
  if (!columns) {
    header.classList.remove('is-archive-open');
    return Promise.resolve();
  }
  endTween?.();
  const width = columns.getBoundingClientRect().width;
  const style = getComputedStyle(header);
  const fold = parseFloat(style.getPropertyValue('--fold-duration')) * 1000 || 350;
  const ease = style.getPropertyValue('--ease-fold').trim() || 'ease';
  // Pinned as they are, labels included, while the bar's closed styles take over.
  folding = true;
  columns.style.transition = 'none';
  columns.style.flex = `0 0 ${width}px`;
  columns.style.minWidth = '0px';
  columns.style.opacity = '1';
  header.classList.remove('is-archive-open');
  columns.offsetWidth;
  columns.style.transition = `flex-basis ${fold}ms ${ease}, padding-inline ${fold}ms ${ease}, opacity ${fold}ms ${ease}`;
  columns.style.flexBasis = '0px';
  columns.style.opacity = '0';
  return new Promise((resolve) => {
    window.setTimeout(() => {
      columns.style.transition = '';
      columns.style.flex = '';
      columns.style.minWidth = '';
      columns.style.opacity = '';
      folding = false;
      resolve();
    }, fold + 40);
  });
}

/** Shrinks the archive bar back to the small header before the next page. */
export function collapseArchive() {
  const header = document.querySelector('.site-header');
  if (!header || document.body.dataset.page !== 'archive') return Promise.resolve();

  const scroll = document.querySelector('[data-archive-scroll]');
  if (scroll) scroll.scrollLeft = 0;
  header.style.setProperty('--archive-shift', '0px');
  if (!header.classList.contains('is-archive-open')) return Promise.resolve();
  if (reducedMotion.matches) {
    header.classList.remove('is-archive-open');
    return Promise.resolve();
  }
  // The page change doesn't wait for this (it folds alongside the menu); About does.
  if (header.hasAttribute('data-open')) return foldColumns(header);
  tweenWidth(header, false);

  const ms = parseFloat(getComputedStyle(header).getPropertyValue('--transition-duration')) * 1000;
  return new Promise((resolve) => {
    window.setTimeout(resolve, Number.isFinite(ms) ? ms : 180);
  });
}

window.addEventListener('resize', () => {
  if (document.body.dataset.page !== 'archive') return;
  endLight();
  scheduleLayout();
});

window.addEventListener('keydown', onKeyDown);
