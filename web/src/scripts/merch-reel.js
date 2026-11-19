// Merch pile. Every product stays in the stack. The front one is sharp.
// Each one behind is 4px more blurred and 10% bigger; four show at once.
// Scrolling matches the work reel.

import { merchStackStyle } from '../lib/merch-stack.js';
import { closeNav } from './header.js';

let root;
let frame = 0;
let wrapping = false;
let settling = false;
let settleFrame = 0;
let dragged = false;
let step = 1;
let cycle = 1;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

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
  if (run) run.style.height = `${cycle * 3}px`;
  return count;
}

function wrap() {
  if (!cycle) return;
  const top = root.scrollTop;
  if (top >= cycle - 1 && top < cycle * 2 - 1) return;
  const mod = ((top % cycle) + cycle) % cycle;
  wrapping = true;
  root.scrollTop = cycle + mod;
  wrapping = false;
}

function place(card, { opacity, blur, shift, scale = 1, z, active }) {
  card.style.visibility = opacity < 0.01 ? 'hidden' : 'visible';
  card.style.opacity = opacity.toFixed(3);
  card.style.filter = blur > 0.4 ? `blur(${blur.toFixed(2)}px)` : 'none';
  const lift = reducedMotion.matches ? 0 : shift;
  card.style.transform = `translate(-50%, -50%) translateY(${lift.toFixed(2)}%) scale(${scale.toFixed(4)})`;
  card.style.zIndex = String(z);
  card.style.pointerEvents = active ? '' : 'none';
  card.tabIndex = active ? 0 : -1;
  if (active) card.removeAttribute('aria-hidden');
  else card.setAttribute('aria-hidden', 'true');
}

function paint() {
  if (!root?.isConnected) return;
  const list = cards();
  const count = list.length;
  if (!count || !step) return;

  const mod = ((root.scrollTop % cycle) + cycle) % cycle;
  const scaled = mod / step;
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

  const activeIndex = local >= 0.5 ? (index + 1) % count : index;
  const used = new Set();

  for (let slot = 0; slot < count; slot += 1) {
    const i = (index + slot) % count;
    if (used.has(i)) continue;
    used.add(i);
    const style = merchStackStyle(slot, local);
    place(list[i], {
      ...style,
      z: count - slot,
      active: i === activeIndex && style.opacity > 0.4,
    });
  }

  list.forEach((card, i) => {
    if (!used.has(i)) place(card, { opacity: 0, blur: 0, shift: 0, z: 0, active: false });
  });
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
  const dest = local < 0.5 ? index : (index + 1) % count;
  if (local >= 0.5 && dest === 0) return cycle * 2;
  return cycle + dest * step;
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
    const t = Math.min(1, (now - started) / 320);
    const eased = 1 - (1 - t) ** 3;
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
  if (!settling) {
    dragged = true;
    wrap();
  }
  closeNav();
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(paint);
}

function onScrollEnd() {
  if (settling || wrapping) return;
  settle();
}

function onResize() {
  if (!root?.isConnected || root.clientHeight === 0 || !cycle) return;
  const mod = ((root.scrollTop % cycle) + cycle) % cycle;
  const fraction = mod / cycle;
  layout();
  wrapping = true;
  root.scrollTop = cycle * (1 + fraction);
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
}

export function setUpMerchReel() {
  if (root) unbind(root);
  cancelAnimationFrame(frame);
  cancelSettle();

  root = document.querySelector('[data-merch-reel]');
  if (!root) return;

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
  root.scrollTop = cycle;
  wrapping = false;
  root.addEventListener('scroll', onScroll, { passive: true });
  root.addEventListener('scrollend', onScrollEnd);
  root.addEventListener('wheel', onWheel, { passive: true });
  root.addEventListener('pointerdown', onPointerDown);
  paint();
}

document.addEventListener('keydown', onKeyDown);
document.addEventListener('pointerup', onPointerUp);
window.addEventListener('resize', onResize);
