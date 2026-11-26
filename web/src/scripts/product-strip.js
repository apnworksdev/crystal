// Product page strip. A sideways scroll (trackpad, shift + wheel, touch) or a
// mouse drag moves the pictures. A vertical scroll moves the page, so the footer
// can be reached. Same snap, loop and timing as the work reel.

import { closeNav } from './header.js';

let root;
let track;
let frame = 0;
let wrapping = false;
let settling = false;
let settleFrame = 0;
let dragged = false;
let step = 1;
let cycle = 1;
let count = 0;
let dragX = null;
let dragMoved = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
// Settling onto a picture: the shared expo-out (--ease-out, --grow-duration).
const SETTLE_MS = 500;
// Touch: a swipe moves one picture at most. Past this share of a step, or this fast
// (px per ms), it goes on; otherwise it springs back. Same as the work reel.
const SWIPE_SHARE = 0.12;
const SWIPE_SPEED = 0.3;
let touch = null;

function layout() {
  const cards = [...root.querySelectorAll('[data-product-card][data-copy="1"]')];
  count = cards.length;
  const run = root.querySelector('.product-strip__run');
  // Whole pixels: browsers round scrollLeft, and a fractional lap made the settle and the
  // wrap undo each other every frame (which also kept closing the menu).
  step = Math.round(root.clientWidth * 0.6) || 1;
  cycle = Math.max(count, 1) * step;
  if (run) run.style.width = `${cycle * 3}px`;
  return count;
}

function cardCenter(copy, index) {
  const card = root.querySelector(`[data-product-card][data-copy="${copy}"][data-index="${index}"]`);
  if (!card) return 0;
  return card.offsetLeft + card.offsetWidth / 2;
}

function wrap() {
  if (!cycle) return;
  const top = root.scrollLeft;
  if (top >= cycle && top < cycle * 2) return;
  const mod = ((top % cycle) + cycle) % cycle;
  wrapping = true;
  root.scrollLeft = cycle + mod;
  wrapping = false;
}

function paint() {
  if (!root?.isConnected || !track) return;
  if (!count || !step) return;

  const mod = ((root.scrollLeft % cycle) + cycle) % cycle;
  const scaled = mod / step;
  let index = Math.floor(scaled);
  let local = scaled - index;
  if (index >= count) {
    index = 0;
    local = 0;
  }

  // The middle copy is the resting set. Crossing the last picture uses the next copy.
  const nextIndex = (index + 1) % count;
  const nextCopy = index + 1 >= count ? 2 : 1;
  const from = cardCenter(1, index);
  const to = cardCenter(nextCopy, nextIndex);
  const center = from + (to - from) * local;
  track.style.transform = `translateX(${root.clientWidth / 2 - center}px)`;
}

function progress() {
  const mod = ((root.scrollLeft % cycle) + cycle) % cycle;
  const scaled = step ? mod / step : 0;
  let index = Math.floor(scaled);
  let local = scaled - index;
  if (index >= count) {
    index = 0;
    local = 0;
  }
  return { count, index, local };
}

function nearestTop() {
  const { count: n, index, local } = progress();
  if (!n) return root.scrollLeft;
  const dest = local < 0.5 ? index : (index + 1) % n;
  if (local >= 0.5 && dest === 0) return cycle * 2;
  return cycle + dest * step;
}

function cancelSettle() {
  settling = false;
  cancelAnimationFrame(settleFrame);
}

function animateTo(target) {
  const start = root.scrollLeft;
  const delta = target - start;
  if (Math.abs(delta) < 1) {
    if (root.scrollLeft !== target) {
      wrapping = true;
      root.scrollLeft = target;
      wrapping = false;
    }
    wrap();
    paint();
    return;
  }
  cancelSettle();
  if (reducedMotion.matches) {
    root.scrollLeft = target;
    wrap();
    paint();
    return;
  }
  settling = true;
  const started = performance.now();
  const tick = (now) => {
    if (!settling) return;
    const t = Math.min(1, (now - started) / SETTLE_MS);
    const eased = t >= 1 ? 1 : 1 - 2 ** (-10 * t);
    root.scrollLeft = start + delta * eased;
    if (t < 1) settleFrame = requestAnimationFrame(tick);
    else {
      settling = false;
      wrapping = true;
      root.scrollLeft = target;
      wrapping = false;
      wrap();
      paint();
    }
  };
  settleFrame = requestAnimationFrame(tick);
}

function settle() {
  if (!root?.isConnected || root.hidden || settling) return;
  animateTo(nearestTop());
}

function onScroll() {
  if (wrapping) return;
  if (!settling) {
    dragged = true;
    wrap();
  }
  closeNav();
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(paint);
}

function onScrollEnd() {
  // A mouse drag ends a scroll on every move. It settles on release instead.
  if (settling || wrapping || dragX !== null || touch) return;
  settle();
}

function onResize() {
  if (!root?.isConnected || root.clientWidth === 0 || !cycle) return;
  const mod = ((root.scrollLeft % cycle) + cycle) % cycle;
  const fraction = mod / cycle;
  layout();
  wrapping = true;
  root.scrollLeft = cycle * (1 + fraction);
  wrapping = false;
  paint();
}

function onWheel() {
  cancelSettle();
}

function onPointerDown(event) {
  cancelSettle();
  dragged = false;
  closeNav();
  // Touch scrolls sideways natively. A mouse or pen drags the strip by hand.
  if (event.pointerType === 'touch' || event.button !== 0) return;
  event.preventDefault();
  dragX = event.clientX;
  dragMoved = false;
  root.setPointerCapture?.(event.pointerId);
}

function onPointerMove(event) {
  if (dragX === null) return;
  const dx = event.clientX - dragX;
  if (!dx) return;
  dragX = event.clientX;
  dragMoved = true;
  cancelSettle();
  root.scrollLeft -= dx;
}

function onPointerUp() {
  const wasDragging = dragX !== null && dragMoved;
  dragX = null;
  if (!root?.isConnected || root.hidden || settling) return;
  if (wasDragging || !dragged) settle();
}

// Touch screens: the strip has touch-action: pan-y, so vertical swipes still scroll the
// page to the footer and sideways swipes come here. Native sideways scrolling on phones
// fought the loop and the settle, so the finger moves the strip directly.
function onTouchDown(event) {
  if (event.pointerType !== 'touch' || !event.isPrimary) return;
  cancelSettle();
  touch = { id: event.pointerId, x: event.clientX, offset: 0, lastX: event.clientX, lastT: event.timeStamp, speed: 0 };
}

function onTouchMove(event) {
  if (!touch || event.pointerId !== touch.id) return;
  const offset = Math.max(-step, Math.min(step, touch.x - event.clientX));
  const dt = event.timeStamp - touch.lastT;
  if (dt > 0) touch.speed = (touch.lastX - event.clientX) / dt;
  touch.lastX = event.clientX;
  touch.lastT = event.timeStamp;
  // scrollLeft can be wrapped by a whole copy between moves, so move by the change only.
  root.scrollLeft += offset - touch.offset;
  touch.offset = offset;
}

function onTouchUp(event) {
  if (!touch || event.pointerId !== touch.id) return;
  const { offset, speed } = touch;
  const stale = event.timeStamp - touch.lastT > 120;
  touch = null;
  // pointercancel: the page took the gesture to scroll vertically.
  if (event.type === 'pointercancel') {
    settle();
    return;
  }
  const fling = stale ? 0 : speed;
  let goal = 0;
  if (offset > step * SWIPE_SHARE || fling > SWIPE_SPEED) goal = step;
  else if (offset < -step * SWIPE_SHARE || fling < -SWIPE_SPEED) goal = -step;
  if (Math.abs(offset) < 1 && !goal) return;
  animateTo(root.scrollLeft - offset + goal);
}

function onKeyDown(event) {
  if (!root?.isConnected || root.hidden) return;
  if (document.querySelector('dialog[open]')) return;
  if (event.altKey || event.metaKey || event.ctrlKey) return;
  if (event.target instanceof HTMLElement) {
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;
  }

  // Up and down are left to the page, so it scrolls to the footer.
  const down = event.key === 'ArrowRight';
  const up = event.key === 'ArrowLeft';
  if (!down && !up) return;
  event.preventDefault();
  closeNav();
  const { count: n, index, local } = progress();
  if (n <= 1) return;
  let dest;
  if (down) dest = (index + 1) % n;
  else dest = local > 0.001 ? index : (index - 1 + n) % n;
  let target = cycle + dest * step;
  if (down && dest === 0) target = cycle * 2;
  if (!down && dest > index) target = cycle - step;
  animateTo(target);
}

function unbind(reel) {
  reel.removeEventListener('scroll', onScroll);
  reel.removeEventListener('scrollend', onScrollEnd);
  reel.removeEventListener('wheel', onWheel);
  reel.removeEventListener('pointerdown', onPointerDown);
  reel.removeEventListener('pointermove', onPointerMove);
  reel.removeEventListener('pointerdown', onTouchDown);
  reel.removeEventListener('pointermove', onTouchMove);
  reel.removeEventListener('pointerup', onTouchUp);
  reel.removeEventListener('pointercancel', onTouchUp);
  touch = null;
}

export function setUpProductStrip() {
  if (root) unbind(root);
  cancelAnimationFrame(frame);
  cancelSettle();

  root = document.querySelector('[data-product-strip]');
  track = root?.querySelector('[data-product-track]') ?? null;
  if (!root || !track) return;

  layout();
  if (count <= 1) {
    root.style.overflowX = 'hidden';
    wrapping = true;
    root.scrollLeft = 0;
    wrapping = false;
    paint();
    root.dataset.ready = '';
    return;
  }
  root.style.overflowX = '';
  dragX = null;
  wrapping = true;
  root.scrollLeft = cycle;
  wrapping = false;
  root.addEventListener('scroll', onScroll, { passive: true });
  root.addEventListener('scrollend', onScrollEnd);
  root.addEventListener('wheel', onWheel, { passive: true });
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerdown', onTouchDown);
  root.addEventListener('pointermove', onTouchMove, { passive: true });
  root.addEventListener('pointerup', onTouchUp);
  root.addEventListener('pointercancel', onTouchUp);
  paint();
  root.dataset.ready = '';

  root.querySelectorAll('img').forEach((image) => {
    if (image.complete) return;
    image.addEventListener(
      'load',
      () => {
        if (!root?.isConnected) return;
        layout();
        paint();
      },
      { once: true },
    );
  });
}

document.addEventListener('keydown', onKeyDown);
document.addEventListener('pointerup', onPointerUp);
window.addEventListener('resize', onResize);
