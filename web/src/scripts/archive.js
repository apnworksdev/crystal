// The archive bar and the rows share one horizontal scroll. The bar eases
// open on arrival and shut before a section change.
//
// Vertically the list steps instead of scrolling: one row per step, and the
// row that passes the bar jumps to sit right above it. Wheel, touch and keys
// move a row index; nothing scrolls natively on the vertical axis.

let scrollEl = null;
let headerEl = null;
let observer = null;
let rows = [];
let current = 0;
let offset = 0;
let wheelRest = 0;
let touchY = null;
// Touch momentum: the finger's speed when it lifts keeps stepping rows, slowing down
// until it stops. Speed is in px per ms; FRICTION is how much is kept per 16 ms.
let lastY = 0;
let lastT = 0;
let speed = 0;
let coastFrame = 0;
const FRICTION = 0.95;
const MIN_SPEED = 0.05;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

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
  still.forEach((element) => {
    element.style.transition = 'none';
  });
  header.style.width = '';
  header.classList.add('is-archive-open');
  const layout = measure();
  header.classList.toggle('is-archive-open', wasOpen);
  header.style.width = width;
  header.offsetWidth;
  still.forEach((element) => {
    element.style.transition = '';
  });
  return layout;
}

function align() {
  const header = headerEl;
  const scroll = scrollEl;
  const columns = header?.querySelector('[data-archive-columns]');
  if (!header || !scroll || !columns) return;

  const { inset, width, track } = openLayout(header, columns);
  scroll.style.setProperty('--archive-inset', `${inset}px`);
  scroll.style.setProperty('--archive-columns-width', `${width}px`);
  scroll.style.setProperty('--archive-track', `${track}px`);
}

function onScroll() {
  if (!headerEl || !scrollEl) return;
  headerEl.style.setProperty('--archive-shift', `${scrollEl.scrollLeft}px`);
  // Focus can still nudge the hidden vertical axis. Keep it at the top.
  if (scrollEl.scrollTop) scrollEl.scrollTop = 0;
}

/** Distance from one row to the next. */
function pitch() {
  if (rows.length > 1) return rows[1].offsetTop - rows[0].offsetTop;
  return rows[0]?.offsetHeight || 1;
}

/** Puts the current row right under the bar and earlier rows right above it. */
function place() {
  if (!scrollEl || !headerEl || !rows.length) return;
  const list = rows[0].parentElement;
  const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
  const barHeight = headerEl.offsetHeight;
  const barBottom = window.innerHeight / 2 + barHeight / 2;
  const naturalTop = list.getBoundingClientRect().top - offset;
  // Past the last row every row sits above the bar, so the slot under it is one row further on.
  const slot = current < rows.length ? rows[current].offsetTop : rows.at(-1).offsetTop + pitch();
  const rowTop = naturalTop + slot - rows[0].offsetTop;

  offset = barBottom + gap - rowTop;
  scrollEl.style.setProperty('--archive-offset', `${offset}px`);
  scrollEl.style.setProperty('--archive-skip', `${barHeight + gap}px`);
  rows.forEach((row, index) => row.toggleAttribute('data-archive-before', index < current));
}

function go(index) {
  // rows.length is the end: every row above the bar, none below.
  const next = Math.max(0, Math.min(rows.length, index));
  if (next === current) return false;
  current = next;
  place();
  return true;
}

/** True when the stepped list should take vertical input. */
function stepping() {
  return (
    document.body.dataset.page === 'archive' &&
    Boolean(scrollEl && rows.length) &&
    !headerEl?.hasAttribute('data-about') &&
    !document.querySelector('dialog[open]')
  );
}

function onWheel(event) {
  if (!stepping() || event.ctrlKey) return;
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  event.preventDefault();

  // A mouse wheel notch moves exactly one row. Browsers report notches in lines,
  // or as multiples of 120 in the legacy wheelDeltaY. Trackpads report small pixel
  // deltas, which add up to a row per row height of travel.
  const legacy = event.wheelDeltaY;
  if (event.deltaMode !== 0 || (legacy && legacy % 120 === 0)) {
    wheelRest = 0;
    go(current + Math.sign(event.deltaY));
    return;
  }

  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
  wheelRest += event.deltaY * unit;
  const size = pitch();
  const steps = Math.trunc(wheelRest / size);
  if (!steps) return;
  wheelRest -= steps * size;
  if (!go(current + steps)) wheelRest = 0;
}

function stopCoast() {
  cancelAnimationFrame(coastFrame);
  coastFrame = 0;
}

function onTouchStart(event) {
  stopCoast();
  touchY = stepping() && event.touches.length === 1 ? event.touches[0].clientY : null;
  lastY = touchY ?? 0;
  lastT = event.timeStamp;
  speed = 0;
}

function onTouchMove(event) {
  if (touchY === null || !stepping()) return;
  const y = event.touches[0].clientY;
  const dt = event.timeStamp - lastT;
  if (dt > 0) {
    // Smoothed, so one jittery event does not decide the throw.
    speed = speed * 0.4 + ((lastY - y) / dt) * 0.6;
    lastY = y;
    lastT = event.timeStamp;
  }
  const size = pitch();
  const steps = Math.trunc((touchY - y) / size);
  if (!steps) return;
  touchY -= steps * size;
  if (!go(current + steps)) touchY = y;
}

/** Keeps stepping after the finger lifts, slower and slower. */
function onTouchEnd(event) {
  if (touchY === null) return;
  touchY = null;
  // A finger that stopped before lifting throws nothing.
  if (event.timeStamp - lastT > 100 || Math.abs(speed) < MIN_SPEED || reducedMotion.matches) return;
  let velocity = speed;
  let travel = 0;
  let previous = performance.now();
  const coast = (now) => {
    if (!stepping()) return stopCoast();
    const dt = Math.min(now - previous, 50);
    previous = now;
    travel += velocity * dt;
    velocity *= FRICTION ** (dt / 16);
    const size = pitch();
    const steps = Math.trunc(travel / size);
    if (steps) {
      travel -= steps * size;
      if (!go(current + steps)) return stopCoast();
    }
    if (Math.abs(velocity) < MIN_SPEED) return stopCoast();
    coastFrame = requestAnimationFrame(coast);
  };
  coastFrame = requestAnimationFrame(coast);
}

function onKeyDown(event) {
  if (!stepping() || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('input, textarea, select, button, [contenteditable]')) return;

  const page = Math.max(1, Math.floor(window.innerHeight / 2 / pitch()) - 1);
  const moves = {
    ArrowDown: 1,
    ArrowUp: -1,
    PageDown: page,
    PageUp: -page,
    ' ': event.shiftKey ? -page : page,
    Home: -rows.length,
    End: rows.length,
  };
  if (!(event.key in moves)) return;
  event.preventDefault();
  go(current + moves[event.key]);
}

function detach() {
  scrollEl?.removeEventListener('scroll', onScroll);
  observer?.disconnect();
  observer = null;
  window.removeEventListener('wheel', onWheel);
  scrollEl = null;
  rows = [];
  touchY = null;
  stopCoast();
}

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
  scrollEl?.addEventListener('scroll', onScroll, { passive: true });
  // Not passive, so it can step rows. Only added here, so other pages keep smooth native scrolling.
  window.addEventListener('wheel', onWheel, { passive: false });
  rows = scrollEl ? [...scrollEl.querySelectorAll('.archive__item')] : [];
  current = 0;
  offset = 0;
  wheelRest = 0;
  if (rows.length) scrollEl.setAttribute('data-archive-stepped', '');

  const columns = headerEl.querySelector('[data-archive-columns]');
  if (columns && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      align();
      place();
    });
    observer.observe(columns);
    observer.observe(headerEl);
    if (rows.length) observer.observe(rows[0].parentElement);
  }
  align();
  place();
  rows[0]?.parentElement.setAttribute('data-archive-ready', '');
  easeOpen(headerEl);
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
  tweenWidth(header, false);

  const ms = parseFloat(getComputedStyle(header).getPropertyValue('--transition-duration')) * 1000;
  return new Promise((resolve) => {
    window.setTimeout(resolve, Number.isFinite(ms) ? ms : 180);
  });
}

window.addEventListener('resize', () => {
  if (document.body.dataset.page !== 'archive') return;
  align();
  place();
});

// Registered once. Each handler checks that the archive is the current page.
// The wheel handler is the exception: setUpArchive adds it and detach removes it.
window.addEventListener('touchstart', onTouchStart, { passive: true });
window.addEventListener('touchmove', onTouchMove, { passive: true });
window.addEventListener('touchend', onTouchEnd, { passive: true });
window.addEventListener('touchcancel', onTouchEnd, { passive: true });
window.addEventListener('keydown', onKeyDown);
