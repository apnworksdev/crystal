// Work stack. The picture in front is sharp; the ones behind sit higher, blurred and
// fainter (lib/card-stack.js). Scrolling moves through the pile: the next picture comes
// forward while the front one leaves. The words leave as soon as scrolling starts and
// return when a picture has settled. The sequence loops.

import { cardStackStyle, depthOf } from '../lib/card-stack.js';
import { closeNav } from './header.js';

// Settling onto a picture: the shared expo-out (--ease-out, --grow-duration).
const SETTLE_MS = 500;
const easeOut = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

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
// A swipe moves one picture at most. Past this share of a step, or this fast (px per ms),
// it goes on to the next one; otherwise it springs back.
const SWIPE_SHARE = 0.12;
const SWIPE_SPEED = 0.3;
let touch = null;

function cards() {
  return [...root.querySelectorAll('[data-reel-card]')];
}

function layout() {
  const count = cards().length;
  const run = root.querySelector('.project-reel__run');
  // Whole pixels: browsers round scrollTop, and a fractional lap can make the settle and
  // the wrap undo each other every frame.
  step = Math.round(root.clientHeight * 0.7) || 1;
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

function place(card, { opacity, blur, scale, y, z, active }) {
  card.style.visibility = opacity < 0.01 ? 'hidden' : 'visible';
  card.style.opacity = opacity.toFixed(3);
  card.style.filter = blur > 0.4 ? `blur(${blur.toFixed(2)}px)` : 'none';
  card.style.transform = `translate(-50%, -50%) translateY(${y.toFixed(2)}px) scale(${scale.toFixed(4)})`;
  card.style.zIndex = String(z);
  card.style.pointerEvents = active ? '' : 'none';
  card.tabIndex = active ? 0 : -1;
  if (active) card.removeAttribute('aria-hidden');
  else card.setAttribute('aria-hidden', 'true');
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
  const position = index + local;

  list.forEach((card, i) => {
    const style = cardStackStyle(depthOf(i, position, count), reducedMotion.matches, count);
    place(card, { ...style, active: i === activeIndex && style.opacity > 0.4 });
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
  if (!settling) {
    dragged = true;
    wrap();
  }
  closeNav();
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(paint);
}

function onScrollEnd() {
  if (settling || wrapping || touch) return;
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

// Touch screens: the reel has touch-action: none, so the finger moves it here instead of
// native momentum scrolling, which ran through several pictures per flick.
function onTouchDown(event) {
  if (event.pointerType !== 'touch' || !event.isPrimary) return;
  cancelSettle();
  touch = { id: event.pointerId, y: event.clientY, top: root.scrollTop, offset: 0, lastY: event.clientY, lastT: event.timeStamp, speed: 0 };
}

function onTouchMove(event) {
  if (!touch || event.pointerId !== touch.id) return;
  const offset = Math.max(-step, Math.min(step, touch.y - event.clientY));
  const dt = event.timeStamp - touch.lastT;
  if (dt > 0) touch.speed = (touch.lastY - event.clientY) / dt;
  touch.lastY = event.clientY;
  touch.lastT = event.timeStamp;
  // scrollTop can be wrapped by a whole copy between moves, so move by the change only.
  root.scrollTop += offset - touch.offset;
  touch.offset = offset;
}

function onTouchUp(event) {
  if (!touch || event.pointerId !== touch.id) return;
  const { offset, speed } = touch;
  const stale = event.timeStamp - touch.lastT > 120;
  touch = null;
  if (event.type === 'pointercancel') {
    settle();
    return;
  }
  const fling = stale ? 0 : speed;
  let goal = 0;
  if (offset > step * SWIPE_SHARE || fling > SWIPE_SPEED) goal = step;
  else if (offset < -step * SWIPE_SHARE || fling < -SWIPE_SPEED) goal = -step;
  // A tap leaves the reel where it is, so the card's own click opens the project.
  if (Math.abs(offset) < 1 && !goal) return;
  animateTo(root.scrollTop - offset + goal);
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
  reel.removeEventListener('pointerdown', onTouchDown);
  reel.removeEventListener('pointermove', onTouchMove);
  reel.removeEventListener('pointerup', onTouchUp);
  reel.removeEventListener('pointercancel', onTouchUp);
  touch = null;
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
  root.addEventListener('scroll', onScroll, { passive: true });
  root.addEventListener('scrollend', onScrollEnd);
  root.addEventListener('wheel', onWheel, { passive: true });
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointerdown', onTouchDown);
  root.addEventListener('pointermove', onTouchMove, { passive: true });
  root.addEventListener('pointerup', onTouchUp);
  root.addEventListener('pointercancel', onTouchUp);

  // Wait until the reel has a real height (page fade / inset can leave 0 for a frame),
  // then park on the middle copy so arrival from another page lands cleanly.
  const place = () => {
    if (!root?.isConnected) return;
    if (root.clientHeight === 0) {
      requestAnimationFrame(place);
      return;
    }
    layout();
    wrapping = true;
    root.scrollTop = cycle;
    wrapping = false;
    paint();
  };
  place();
  requestAnimationFrame(() => requestAnimationFrame(place));
}

document.addEventListener('keydown', onKeyDown);
document.addEventListener('pointerup', onPointerUp);
window.addEventListener('resize', onResize);
