// The archive. The list is a native scroll behind the header bar, which sits in the
// middle of the screen (archive.css). The scroll snaps so a row always rests just under
// the bar. Rows that pass the bar sit just above it instead of under it. Where the browser
// supports scroll-driven animations, the stylesheet does that in step with the scroll.
// Elsewhere two IntersectionObservers move each row up by the bar's height as it crosses,
// and back down when it returns.
//
// The bar and the rows share one horizontal scroll. The bar eases open on arrival and
// shut before a section change. Opening the menu runs the list to its end, where the
// footer rests under the header; closing runs it back to the row it was on. While the
// menu grows or folds, the list follows the bar frame by frame (followMenu). It reads the
// bar's live size once a frame and never re-measures the open layout then, which switched
// the bar's transition off and was the lag.

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
/** Where the menu found the list, while the menu has run it to its end. */
let menuReturn = null;
let glide = null;
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
  scroll.style.setProperty('--archive-inset', `${Math.round(inset)}px`);
  scroll.style.setProperty('--archive-columns-width', `${Math.round(width)}px`);
  scroll.style.setProperty('--archive-track', `${Math.round(track)}px`);
}

/* ---------- Following the menu ---------- */

let followFrame = 0;
let followUntil = 0;

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
  scroll.style.setProperty('--archive-inset', `${inset}px`);
  scroll.style.setProperty('--archive-columns-width', `${width}px`);
  scroll.style.setProperty('--archive-track', `${track}px`);
}

/** The menu is opening or closing (header.js): the rows keep the bar's width as it moves. */
function followMenu() {
  if (document.body.dataset.page !== 'archive' || !headerEl) return;
  // Longer than the slowest menu motion, so the rows end where the bar ends.
  followUntil = performance.now() + 1200;
  if (followFrame) return;
  const tick = (now) => {
    followBar();
    followFrame = now < followUntil && document.body.dataset.page === 'archive' ? requestAnimationFrame(tick) : 0;
  };
  followFrame = requestAnimationFrame(tick);
}

document.addEventListener('crystal:menu-motion', followMenu);

let lastShift = '';

function onScroll() {
  if (!headerEl || !scrollEl) return;
  // Vertical glides fire scroll too; only the sideways offset moves the bar.
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

/* ---------- The menu runs the list to the footer ---------- */

const easeOut = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

function stopGlide() {
  if (!glide) return;
  cancelAnimationFrame(glide.frame);
  window.clearTimeout(glide.timer);
  const el = glide.el;
  glide = null;
  // The rows that crossed the bar are updated a frame later. Snap again after that, so
  // the snap sees them where they belong.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (!glide) el.removeAttribute('data-archive-gliding');
    }),
  );
}

/** Scrolls to `to` on the shared curve. The snap waits until it lands. */
function glideTo(to) {
  stopGlide();
  const el = scrollEl;
  const from = el.scrollTop;
  if (reducedMotion.matches || Math.abs(to - from) < 1) {
    el.scrollTop = to;
    return;
  }
  const duration = parseFloat(getComputedStyle(el).getPropertyValue('--grow-duration')) * 1000 || 500;
  el.setAttribute('data-archive-gliding', '');
  const start = performance.now();
  const state = { el, frame: 0, timer: 0 };
  const land = () => {
    el.scrollTop = to;
    if (glide === state) stopGlide();
  };
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.scrollTop = from + (to - from) * easeOut(t);
    if (t < 1) state.frame = requestAnimationFrame(tick);
    else land();
  };
  state.frame = requestAnimationFrame(tick);
  // A background tab never runs frames. Land there anyway.
  state.timer = window.setTimeout(land, duration + 200);
  glide = state;
}

/** Where the footer rests under the header. */
function footerStop() {
  const footer = scrollEl.querySelector('.site-footer');
  if (!footer) return scrollEl.scrollHeight - scrollEl.clientHeight;
  const top = footer.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
  const pad = parseFloat(getComputedStyle(scrollEl).scrollPaddingTop) || 0;
  return Math.min(scrollEl.scrollHeight - scrollEl.clientHeight, Math.max(0, top - pad));
}

/**
 * Opening the menu runs the list to its end, every row passing the bar, so the footer
 * comes up under the header like the bottom of any page. Closing runs it back to the
 * row the menu found. Returns false when there is no archive list to move.
 */
export function showArchiveFooter(show) {
  if (document.body.dataset.page !== 'archive' || !scrollEl || !rows.length) return false;
  if (show) {
    if (menuReturn === null) menuReturn = scrollEl.scrollTop;
    glideTo(footerStop());
    return true;
  }
  if (menuReturn === null) return true;
  const back = menuReturn;
  menuReturn = null;
  glideTo(back);
  return true;
}

// Scrolling by hand while the menu has the footer up: closing leaves the list there.
function onUserScroll() {
  if (glide) stopGlide();
  menuReturn = null;
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
    scrollEl.scrollTo({ top: event.key === 'Home' ? 0 : footerStop(), behavior: reducedMotion.matches ? 'auto' : 'smooth' });
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
  stopGlide();
  folding = false;
  menuReturn = null;
  scrollEl?.removeEventListener('scroll', onScroll);
  scrollEl?.removeEventListener('wheel', onUserScroll);
  scrollEl?.removeEventListener('touchstart', onUserScroll);
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

function tweenWidth(header, open) {
  const columns = header.querySelector('[data-archive-columns]');
  const still = [header, columns].filter(Boolean);
  const from = header.getBoundingClientRect().width;
  endTween?.();

  still.forEach((element) => {
    element.style.transition = 'none';
  });
  header.style.width = '';
  header.classList.toggle('is-archive-open', open);
  const to = header.getBoundingClientRect().width;
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
  requestAnimationFrame(() => {
    if (document.body.dataset.page !== 'archive' || header.classList.contains('is-archive-open')) return;
    tweenWidth(header, true);
  });
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
    scrollEl.addEventListener('wheel', onUserScroll, { passive: true });
    scrollEl.addEventListener('touchstart', onUserScroll, { passive: true });
    scrollEl.scrollTop = 0;
  }
  rows = scrollEl ? [...scrollEl.querySelectorAll('.archive__item')] : [];
  rows.forEach((row) => row.removeAttribute('data-archive-before'));

  const columns = headerEl.querySelector('[data-archive-columns]');
  if (columns && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      // Skip while the menu is open: followMenu keeps the list with the shrinking columns.
      if (headerEl?.hasAttribute('data-open') || glide) return;
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
  scheduleLayout();
});

window.addEventListener('keydown', onKeyDown);
