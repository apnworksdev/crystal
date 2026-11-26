// Merch pile. Every product stays in the stack. The front one is sharp; the ones behind
// sit higher, blurred and fainter, and keep that depth as they come forward. Same stack as
// the Work page (lib/card-stack.js). The front product's name shows in the header,
// after Merch (header.js setHeaderProject), and changes as the next one comes forward.

import { cardStackStyle, depthOf } from '../lib/card-stack.js';
import { closeNav, setHeaderProject } from './header.js';
import { watchScrollEnd } from './scroll-end.js';

// Settling onto a product: the shared expo-out (--ease-out, --grow-duration).
const SETTLE_MS = 500;
// The pile glides after the scroll instead of jumping with it: each frame it closes most of
// the gap, so wheel steps and the settle blend into one movement. Milliseconds to close
// about two thirds of the gap.
const FOLLOW_MS = 70;
// Where the pile is drawn, in products (1.5 is halfway from the second to the third).
let shown = null;
let lastPaint = 0;
const easeOut = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

let root;
let stopScrollEnd = () => {};
let frame = 0;
let wrapping = false;
let settling = false;
let settleFrame = 0;
let dragged = false;
let step = 1;
let cycle = 1;
// The run is this many laps of the pile, and the pile starts in the middle one. It only
// goes back to the middle while the scroll is still (scrollend, or after a settle): moving
// scrollTop during a phone's momentum stops or stutters the fling, so a flick must never
// reach the end. 21 laps is far more than any flick covers.
const LAPS = 21;
const MIDDLE = Math.floor(LAPS / 2);
const EDGE = 3;
// The size the pile was measured at. A phone's address bar showing or hiding changes the
// height a little mid-swipe; re-measuring then would move the pile under the finger.
let measured = { width: 0, height: 0 };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
// The product whose name the header shows, so it is only set when the front one changes.
let named = null;
let nameTimer = 0;

/** Puts the front product's name in the header. The open menu or About has the row then. */
function showName(card) {
  const header = document.querySelector('.site-header');
  if (!card || !header || header.matches('[data-open], [data-about]')) return;
  if (card === named) return;
  named = card;
  const title = card.querySelector('[data-merch-title]')?.textContent.trim();
  setHeaderProject(title ? { title, href: card.getAttribute('href') } : null);
}

// Opening the menu clears the name (header.js). Once it has folded closed (it keeps
// data-open until the fold ends), bring it back. Checked every 100ms, for up to 3s.
document.addEventListener('crystal:menu-motion', () => {
  named = null;
  window.clearTimeout(nameTimer);
  let tries = 30;
  const retry = () => {
    if (!root?.isConnected) return;
    const header = document.querySelector('.site-header');
    if (header?.matches('[data-open], [data-about]')) {
      if (tries-- > 0) nameTimer = window.setTimeout(retry, 100);
      return;
    }
    showName(cards().find((card) => card.dataset.front === 'true'));
  };
  nameTimer = window.setTimeout(retry, 100);
});

function cards() {
  return [...root.querySelectorAll('[data-merch-card]')];
}

function layout() {
  const count = cards().length;
  const run = root.querySelector('.merch-reel__run');
  // Whole pixels: browsers round scrollTop, and a rounded-down position would read as
  // the end of the previous lap, wrap, and settle a whole lap forward, over and over.
  step = Math.round(root.clientHeight * 0.7) || 1;
  cycle = Math.max(count, 1) * step;
  if (run) run.style.height = `${cycle * LAPS}px`;
  measured = { width: root.clientWidth, height: root.clientHeight };
  return count;
}

/** The top of the lap the scroll is in. */
function lapStart() {
  return Math.floor((root.scrollTop + 1) / cycle) * cycle;
}

/** Back to the middle lap, by whole laps so nothing on screen moves. Only while still. */
function wrap() {
  if (!cycle) return;
  const top = root.scrollTop;
  if (top >= cycle * EDGE && top < cycle * (LAPS - EDGE)) return;
  const mod = ((top % cycle) + cycle) % cycle;
  wrapping = true;
  root.scrollTop = cycle * MIDDLE + mod;
  wrapping = false;
}

function place(card, { opacity, blur, y, scale = 1, z, active }) {
  card.style.visibility = opacity < 0.01 ? 'hidden' : 'visible';
  card.style.opacity = opacity.toFixed(3);
  card.style.filter = blur > 0.4 ? `blur(${blur.toFixed(2)}px)` : 'none';
  card.style.transform = `translate(-50%, -50%) translateY(${y.toFixed(2)}px) scale(${scale.toFixed(4)})`;
  card.style.zIndex = String(z);
  // Runs every frame while scrolling: attributes change only when the front card does,
  // since rewriting them restyles the card even with the same value.
  if (card.dataset.front === String(active)) return;
  card.dataset.front = String(active);
  card.style.pointerEvents = active ? '' : 'none';
  card.tabIndex = active ? 0 : -1;
  if (active) card.removeAttribute('aria-hidden');
  else card.setAttribute('aria-hidden', 'true');
}

function paint(now = performance.now()) {
  if (!root?.isConnected) return;
  const list = cards();
  const count = list.length;
  if (!count || !step) return;

  const { index, local } = progress();
  const target = index + local;
  const elapsed = Math.min(64, Math.max(0, now - lastPaint));
  lastPaint = now;
  if (shown === null || reducedMotion.matches || count <= 1) shown = target;
  else {
    // The shorter way round the loop, so the last product runs straight into the first.
    let gap = target - shown;
    gap -= Math.round(gap / count) * count;
    shown += gap * (1 - Math.exp(-elapsed / FOLLOW_MS));
    shown = ((shown % count) + count) % count;
    if (Math.abs(gap) < 0.001) shown = target;
  }

  const activeIndex = Math.round(shown) % count;
  list.forEach((card, i) => {
    const style = cardStackStyle(depthOf(i, shown, count), reducedMotion.matches, count);
    place(card, { ...style, active: i === activeIndex && style.opacity > 0.4 });
  });
  showName(list[activeIndex]);

  cancelAnimationFrame(frame);
  if (shown !== target) frame = requestAnimationFrame(paint);
}

function progress() {
  const count = cards().length;
  const mod = ((root.scrollTop % cycle) + cycle) % cycle;
  const scaled = step ? mod / step : 0;
  let index = Math.floor(scaled);
  let local = scaled - index;
  // A sub-pixel short of a product counts as on it.
  if (local > 0.995) {
    index += 1;
    local = 0;
  }
  if (index >= count) {
    index = 0;
    local = 0;
  }
  return { count, index, local };
}

function nearestTop() {
  const { count, index, local } = progress();
  if (!count) return root.scrollTop;
  const base = lapStart();
  const dest = local < 0.5 ? index : (index + 1) % count;
  if (local >= 0.5 && dest === 0) return base + cycle;
  return base + dest * step;
}

function cancelSettle() {
  settling = false;
  cancelAnimationFrame(settleFrame);
}

function animateTo(target) {
  const start = root.scrollTop;
  const delta = target - start;
  if (Math.abs(delta) < 1) {
    if (root.scrollTop !== target) {
      wrapping = true;
      root.scrollTop = target;
      wrapping = false;
    }
    wrap();
    paint();
    return;
  }
  cancelSettle();
  if (reducedMotion.matches) {
    root.scrollTop = target;
    wrap();
    paint();
    return;
  }
  settling = true;
  const started = performance.now();
  const tick = (now) => {
    if (!settling) return;
    const t = Math.min(1, (now - started) / SETTLE_MS);
    const eased = easeOut(t);
    root.scrollTop = start + delta * eased;
    if (t < 1) settleFrame = requestAnimationFrame(tick);
    else {
      settling = false;
      wrapping = true;
      root.scrollTop = target;
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
  if (!settling) dragged = true;
  closeNav();
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(paint);
}

function onScrollEnd() {
  if (settling || wrapping) return;
  wrap();
  settle();
}

function onResize() {
  if (!root?.isConnected || root.clientHeight === 0 || !cycle) return;
  // Height alone, by less than a fifth: the address bar. Keep the measured spacing.
  const sameWidth = root.clientWidth === measured.width;
  if (sameWidth && Math.abs(root.clientHeight - measured.height) < measured.height * 0.2) return;
  const mod = ((root.scrollTop % cycle) + cycle) % cycle;
  const fraction = mod / cycle;
  layout();
  wrapping = true;
  root.scrollTop = cycle * (MIDDLE + fraction);
  wrapping = false;
  paint();
}

function onWheel() {
  cancelSettle();
}

function onPointerDown() {
  cancelSettle();
  dragged = false;
  closeNav();
}

function onPointerUp() {
  if (!root?.isConnected || root.hidden || dragged || settling) return;
  settle();
}

function onKeyDown(event) {
  if (!root?.isConnected || root.hidden) return;
  if (document.querySelector('dialog[open]')) return;
  if (event.altKey || event.metaKey || event.ctrlKey) return;
  if (event.target instanceof HTMLElement) {
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;
  }

  const down = event.key === 'ArrowDown' || event.key === 'ArrowRight';
  const up = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
  if (!down && !up) return;
  event.preventDefault();
  closeNav();
  const { count, index, local } = progress();
  if (count <= 1) return;
  let dest;
  if (down) dest = (index + 1) % count;
  else dest = local > 0.001 ? index : (index - 1 + count) % count;
  const base = lapStart();
  let target = base + dest * step;
  if (down && dest === 0) target = base + cycle;
  if (!down && dest > index) target = base - step;
  animateTo(target);
}

function unbind(reel) {
  reel.removeEventListener('scroll', onScroll);
  stopScrollEnd();
  stopScrollEnd = () => {};
  reel.removeEventListener('wheel', onWheel);
  reel.removeEventListener('pointerdown', onPointerDown);
}

export function setUpMerchReel() {
  if (root) unbind(root);
  cancelAnimationFrame(frame);
  cancelSettle();

  root = document.querySelector('[data-merch-reel]');
  named = null;
  if (!root) return;
  shown = null;

  layout();
  if (cards().length <= 1) {
    root.style.overflowY = 'hidden';
    wrapping = true;
    root.scrollTop = 0;
    wrapping = false;
    paint();
    return;
  }
  root.style.overflowY = '';
  wrapping = true;
  root.scrollTop = cycle * MIDDLE;
  wrapping = false;
  root.addEventListener('scroll', onScroll, { passive: true });
  stopScrollEnd = watchScrollEnd(root, onScrollEnd);
  root.addEventListener('wheel', onWheel, { passive: true });
  root.addEventListener('pointerdown', onPointerDown);
  paint();
}

document.addEventListener('keydown', onKeyDown);
document.addEventListener('pointerup', onPointerUp);
window.addEventListener('resize', onResize);
