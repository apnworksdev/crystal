// Work reel. The picture in front is sharp. The next one sits behind it,
// a little blurred. Scrolling fades the front one, blurs it and lifts it,
// and the next one comes forward. The words leave as soon as scrolling
// starts and return when a picture has settled. The sequence loops.

import { closeNav } from './header.js';

const NEXT_BLUR = 8;
const NEXT_SCALE = 1.07;

let root;
let wordsFor = -1;
let wordsFrame = 0;
let frame = 0;
let wrapping = false;
let settling = false;
let settleFrame = 0;
let dragged = false;
let step = 1;
let cycle = 1;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function cards() {
  return [...root.querySelectorAll('[data-reel-card]')];
}

function layout() {
  const count = cards().length;
  const run = root.querySelector('.project-reel__run');
  step = root.clientHeight * 0.7 || 1;
  cycle = Math.max(count, 1) * step;
  if (run) run.style.height = `${cycle * 3}px`;
  return count;
}

// The scroll track is three copies of the sequence. Staying in the middle
// copy means a jump back by one copy looks identical.
function wrap() {
  if (!cycle) return;
  const top = root.scrollTop;
  if (top >= cycle && top < cycle * 2) return;
  const mod = ((top % cycle) + cycle) % cycle;
  wrapping = true;
  root.scrollTop = cycle + mod;
  wrapping = false;
}

function place(card, { opacity, blur, scale, shift, z, active }) {
  card.style.visibility = opacity < 0.01 ? 'hidden' : 'visible';
  card.style.opacity = opacity.toFixed(3);
  card.style.filter = blur > 0.4 ? `blur(${blur.toFixed(2)}px)` : 'none';
  card.style.transform = `translate(-50%, -50%) translateY(${shift.toFixed(2)}%) scale(${scale.toFixed(4)})`;
  card.style.zIndex = String(z);
  card.style.pointerEvents = active ? '' : 'none';
  card.tabIndex = active ? 0 : -1;
  if (active) card.removeAttribute('aria-hidden');
  else card.setAttribute('aria-hidden', 'true');
}

function slotStyle(slot, local) {
  if (slot === 0) {
    // Fade and blur lag behind the lift, so the picture is still readable once it has risen.
    const leave = local * local;
    return {
      opacity: 1 - leave,
      blur: leave * 10,
      scale: 1,
      shift: reducedMotion.matches ? 0 : -local * 44,
      z: 3,
    };
  }
  if (slot === 1) {
    return {
      opacity: 1,
      blur: NEXT_BLUR * (1 - local),
      scale: NEXT_SCALE + (1 - NEXT_SCALE) * local,
      shift: 0,
      z: 2,
    };
  }
  return { opacity: Math.max(0, (local - 0.35) / 0.65), blur: NEXT_BLUR, scale: NEXT_SCALE, shift: 0, z: 1 };
}

function hideWords() {
  if (root) root.dataset.reelWords = 'hidden';
}

function showWords(index) {
  const card = cards()[index];
  const brand = root.querySelector('[data-reel-brand]');
  const title = root.querySelector('[data-reel-title]');
  if (!card) return;
  if (wordsFor !== index) {
    wordsFor = index;
    if (brand) brand.textContent = card.dataset.brand || '';
    if (title) title.textContent = card.dataset.title || '';
    if (root.dataset.reelWords === 'hidden') {
      cancelAnimationFrame(wordsFrame);
      wordsFrame = requestAnimationFrame(() => {
        if (wordsFor === index && root?.isConnected) root.dataset.reelWords = 'shown';
      });
      return;
    }
  }
  root.dataset.reelWords = 'shown';
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
  if (index >= count) {
    index = 0;
    local = 0;
  }

  const activeIndex = local >= 0.5 ? (index + 1) % count : index;
  const used = new Set();

  for (let slot = 0; slot < 3; slot += 1) {
    const i = (index + slot) % count;
    if (used.has(i)) continue;
    used.add(i);
    const style = slotStyle(slot, local);
    place(list[i], { ...style, active: i === activeIndex && style.opacity > 0.4 });
  }

  list.forEach((card, i) => {
    if (!used.has(i)) place(card, { opacity: 0, blur: 0, scale: 1, shift: 0, z: 0, active: false });
  });

  // A fraction of a pixel can leave the scroll just short of the next picture.
  const distance = local < 0.5 ? local : 1 - local;
  const resting = local < 0.5 ? index : (index + 1) % count;
  if (!settling && distance < 0.02) showWords(resting);
  else hideWords();
}

function progress() {
  const count = cards().length;
  const mod = ((root.scrollTop % cycle) + cycle) % cycle;
  const scaled = step ? mod / step : 0;
  let index = Math.floor(scaled);
  let local = scaled - index;
  if (index >= count) {
    index = 0;
    local = 0;
  }
  return { count, index, local };
}

// The resting place is a whole picture. Mid-blend, that is whichever side is closer.
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
  hideWords();
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
  if (!count) return;
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

export function setUpReel() {
  if (root) unbind(root);
  cancelAnimationFrame(frame);
  cancelAnimationFrame(wordsFrame);
  cancelSettle();
  wordsFor = -1;

  root = document.querySelector('[data-reel]');
  const views = document.querySelector('[data-work-views]');

  if (!root) {
    if (views) views.hidden = true;
    return;
  }

  if (views) views.hidden = false;
  layout();
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
