// Awards page: a freely scrollable list with a slow upward drift. Hover, focus
// or tap on an award's text shows its image and pauses the drift; leaving
// resumes from the same spot. User scroll pauses too, then resumes after a
// short idle. Reduced motion: no drift, one list, free scroll, text still
// shows the image.

const PX_PER_SECOND = 24;
const SCROLL_IDLE_MS = 500;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const touchUi = matchMedia('(hover: none)');

let scroller = null;
let track = null;
let loopHeight = 0;
let looping = false;
let frame = 0;
let lastTime = 0;
let idleTimer = 0;
let drifting = false;
let wrapping = false;
/** @type {Set<string>} */
const pauses = new Set();
/** @type {AbortController | null} */
let ac = null;

function pause(reason) {
  pauses.add(reason);
}

function resume(reason) {
  pauses.delete(reason);
}

function measureLoop() {
  if (!track || !looping) {
    loopHeight = 0;
    return;
  }
  const first = track.querySelector('.awards:not([aria-hidden="true"])');
  loopHeight = first?.offsetHeight ?? 0;
}

function normalize() {
  if (!scroller || !looping || loopHeight < 1) return;
  if (scroller.scrollTop >= loopHeight) {
    wrapping = true;
    scroller.scrollTop -= loopHeight;
    wrapping = false;
  }
}

function onScroll() {
  if (!scroller || drifting || wrapping) return;
  normalize();
  pause('scroll');
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => resume('scroll'), SCROLL_IDLE_MS);
}

function tick(now) {
  if (!scroller?.isConnected) {
    tearDown();
    return;
  }
  const dt = Math.min(now - lastTime, 64);
  lastTime = now;
  if (pauses.size === 0 && looping) {
    drifting = true;
    scroller.scrollTop += (PX_PER_SECOND * dt) / 1000;
    normalize();
    drifting = false;
  }
  frame = requestAnimationFrame(tick);
}

function clearActive() {
  scroller?.querySelectorAll('.award[data-active]').forEach((award) => {
    award.removeAttribute('data-active');
  });
  resume('hold');
}

function holdFromText(text) {
  if (!text || text.closest('[aria-hidden="true"]')) return;
  pause('hold');
}

function holdingText() {
  return Boolean(
    scroller?.querySelector('.award[data-active], .award__text:focus') ||
      scroller?.querySelector('.award__text:hover'),
  );
}

function releaseHold() {
  if (holdingText()) return;
  resume('hold');
}

function onMouseOver(event) {
  if (!(event.target instanceof Element) || !scroller) return;
  const text = event.target.closest('.award__text');
  if (!text || !scroller.contains(text)) return;
  const from = event.relatedTarget instanceof Element ? event.relatedTarget : null;
  if (from && text.contains(from)) return;
  holdFromText(text);
}

function onMouseOut(event) {
  if (!(event.target instanceof Element) || !scroller) return;
  const text = event.target.closest('.award__text');
  if (!text || !scroller.contains(text)) return;
  const to = event.relatedTarget instanceof Element ? event.relatedTarget : null;
  if (to && text.contains(to)) return;
  if (text.closest('.award')?.hasAttribute('data-active')) return;
  releaseHold();
}

function onFocusIn(event) {
  if (!(event.target instanceof Element) || !scroller) return;
  const text = event.target.closest('.award__text');
  if (!text || !scroller.contains(text)) return;
  holdFromText(text);
}

function onFocusOut() {
  window.setTimeout(releaseHold, 0);
}

function onClick(event) {
  if (!(event.target instanceof Element) || !scroller) return;

  // Desktop uses hover; sticky active is only for touch.
  if (!touchUi.matches) {
    if (!event.target.closest('.award__text')) clearActive();
    return;
  }

  const text = event.target.closest('.award__text');
  if (text && scroller.contains(text) && !text.closest('[aria-hidden="true"]')) {
    const award = text.closest('.award');
    if (!award) return;
    const on = award.hasAttribute('data-active');
    clearActive();
    if (!on) {
      award.setAttribute('data-active', '');
      pause('hold');
    }
    return;
  }

  clearActive();
}

function tearDown() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  window.clearTimeout(idleTimer);
  idleTimer = 0;
  ac?.abort();
  ac = null;
  pauses.clear();
  scroller = null;
  track = null;
  loopHeight = 0;
  looping = false;
}

/** Runs after each page setup. */
export function setUpAwards() {
  const found = document.querySelector('[data-awards-scroller]');
  if (!found) {
    tearDown();
    return;
  }
  if (found === scroller) return;

  tearDown();
  scroller = found;
  track = scroller.querySelector('.awards-scroller__track');
  if (!track) return;

  looping = !reducedMotion.matches;
  scroller.toggleAttribute('data-awards-loop', looping);
  // Layout must settle before measuring one copy's height.
  measureLoop();

  ac = new AbortController();
  const { signal } = ac;
  scroller.addEventListener('scroll', onScroll, { signal, passive: true });
  scroller.addEventListener('mouseover', onMouseOver, { signal, passive: true });
  scroller.addEventListener('mouseout', onMouseOut, { signal, passive: true });
  scroller.addEventListener('focusin', onFocusIn, { signal });
  scroller.addEventListener('focusout', onFocusOut, { signal });
  document.addEventListener('click', onClick, { signal });
  window.addEventListener('resize', measureLoop, { signal, passive: true });

  if (looping) {
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  }
}
