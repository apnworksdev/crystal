// Work stack. The picture in front is sharp; the ones behind sit higher, blurred and
// fainter (lib/work-stack.js). One frame loop eases the stack's position towards a target:
// the wheel, a drag, the arrow keys or a click on a card behind move the target, and the
// stack glides after it, then settles on a whole picture. The words follow the picture in
// front. The stack is endless both ways.

import {
  cardSize,
  RISE,
  stackDepth,
  stackStyle,
  stackTop,
  wrapIndex,
} from '../lib/work-stack.js';
import { leaveSlug } from './cover.js';
import { closeNav } from './header.js';

const phoneQuery = matchMedia('(max-width: 48rem), (max-height: 30rem) and (pointer: coarse)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
// Pixels of wheel, or of finger travel, per picture.
const WHEEL_STEP = 120;
const DRAG_STEP = 120;
// The wheel settles on a whole picture once it has been still this long.
const SNAP_MS = 160;
// How fast the stack catches up with its target, per second.
const GLIDE = 10;
// Each card leans back a little, its top edge wider than its bottom.
const TILT_DEG = -8;
// The perspective distance, in card widths, so a big desktop card leans as much as a phone one.
const TILT_PERSPECTIVE = 3;
// A finger moving less than this is still a tap.
const TAP_SLOP = 8;
// A flick carries on as if each frame kept this share of its speed.
const FLING_KEEP = 0.92;

let root = null;
let cards = [];
let sizes = [];
let geometry = null;
let position = 0;
let target = 0;
let current = -1;
let frame = 0;
let lastTime = 0;
let snapTimer = 0;
let drag = null;
let suppressClick = false;
let resizeObserver = null;

function measure() {
  const stack = root?.querySelector('.project-reel__stack');
  if (!stack || root.hidden || root.clientHeight === 0) {
    geometry = null;
    return false;
  }
  const box = stack.getBoundingClientRect();
  const phone = phoneQuery.matches;
  const width = window.innerWidth;
  const height = window.innerHeight;
  // Desktop: clear of the big words. Phone: the room between them, less the cards behind.
  const room = phone ? box.height - 4 * RISE : height * 0.6;
  sizes = cards.map((card) => cardSize(Number(card.dataset.ratio), { phone, width, height, room }));
  cards.forEach((card, i) => {
    card.style.top = '0';
    card.style.left = '0';
    card.style.maxWidth = 'none';
    card.style.width = `${sizes[i].w}px`;
    card.style.height = `${sizes[i].h}px`;
  });
  geometry = { phone, box, top: stackTop(width, height) - box.top };
  return true;
}

function showWords(index) {
  const card = cards[index];
  if (!card) return;
  const brand = root.querySelector('[data-reel-brand]');
  const title = root.querySelector('[data-reel-title]');
  if (brand) brand.textContent = card.dataset.brand || '';
  if (title) title.textContent = card.dataset.title || '';
  if (root.dataset.reelWords !== 'shown') root.dataset.reelWords = 'shown';
}

function select(index) {
  if (index === current) return;
  current = index;
  cards.forEach((card, i) => {
    const front = i === index;
    card.tabIndex = front ? 0 : -1;
    if (front) card.removeAttribute('aria-hidden');
    else card.setAttribute('aria-hidden', 'true');
    card.toggleAttribute('data-front', front);
  });
  showWords(index);
}

function paint() {
  if (!root?.isConnected || !geometry) return;
  const count = cards.length;
  if (!count) return;
  const { phone, box } = geometry;
  // Phone, as the reference: every card is centred on the same line by its own height, so a
  // taller or shorter card coming forward never moves the rest of the pile.
  const centre = box.height / 2;

  cards.forEach((card, i) => {
    const style = stackStyle(stackDepth(i, position, count), count);
    const x = Math.round((box.width - sizes[i].w) / 2);
    const top = phone ? centre - sizes[i].h / 2 : geometry.top;
    const y = Math.round(top + style.y);
    // Tilted back a little in perspective, so its top edge is wider than its bottom.
    const tilt = ` perspective(${Math.round(sizes[i].w * TILT_PERSPECTIVE)}px) rotateX(${TILT_DEG}deg)`;
    card.style.transform = `translate(${x}px, ${y}px)${tilt}`;
    card.style.filter = style.blur > 0.05 ? `blur(${style.blur.toFixed(1)}px)` : 'none';
    card.style.opacity = style.opacity.toFixed(3);
    card.style.zIndex = String(style.z);
    card.style.visibility = style.opacity < 0.01 ? 'hidden' : 'visible';
    // Cards behind can be clicked to bring them forward. Faint ones never catch a click.
    card.style.pointerEvents = style.opacity > 0.2 && !style.passed ? '' : 'none';
  });
  select(wrapIndex(Math.round(position), count));
}

function tick(now) {
  frame = 0;
  if (!root?.isConnected) return;
  const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  const share = reducedMotion.matches ? 1 : Math.min(1, dt * GLIDE);
  position += (target - position) * share;
  if (Math.abs(target - position) < 0.001) position = target;
  // Keep the numbers small once settled. A whole lap looks the same.
  if (position === target && Math.abs(target) > cards.length * 100) {
    const laps = Math.trunc(target / cards.length) * cards.length;
    position -= laps;
    target -= laps;
  }
  paint();
  if (position !== target || drag) frame = requestAnimationFrame(tick);
}

function run() {
  if (frame || !root) return;
  lastTime = performance.now();
  frame = requestAnimationFrame(tick);
}

function moveTo(value) {
  target = value;
  run();
}

function snapSoon() {
  window.clearTimeout(snapTimer);
  snapTimer = window.setTimeout(() => moveTo(Math.round(target)), SNAP_MS);
}

function onWheel(event) {
  if (!root || root.hidden) return;
  event.preventDefault();
  closeNav();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
  moveTo(target + (event.deltaY * unit) / WHEEL_STEP);
  snapSoon();
}

// Touch: the stack is pulled. The cards behind sit above the front one, so dragging down
// brings the next one forward. Letting go keeps the movement going and it settles.
function onPointerDown(event) {
  if (event.pointerType !== 'touch' || !event.isPrimary) return;
  window.clearTimeout(snapTimer);
  drag = { id: event.pointerId, y: event.clientY, from: target, lastY: event.clientY, lastT: event.timeStamp, speed: 0, moved: false };
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const travel = event.clientY - drag.y;
  if (!drag.moved && Math.abs(travel) < TAP_SLOP) return;
  if (!drag.moved) {
    drag.moved = true;
    closeNav();
  }
  const dt = Math.max(8, event.timeStamp - drag.lastT);
  drag.speed = (event.clientY - drag.lastY) / dt;
  drag.lastY = event.clientY;
  drag.lastT = event.timeStamp;
  moveTo(drag.from + travel / DRAG_STEP);
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const { moved, speed, lastT } = drag;
  drag = null;
  if (!moved) return;
  suppressClick = true;
  window.setTimeout(() => (suppressClick = false), 50);
  // A finger that stopped before lifting does not fling.
  const fling = event.type === 'pointercancel' || event.timeStamp - lastT > 100 ? 0 : speed;
  // Per frame (16ms) it keeps FLING_KEEP of its speed: in all, 1 / (1 - FLING_KEEP) frames' worth.
  const carry = (fling * 16) / (1 - FLING_KEEP) / DRAG_STEP;
  const most = Math.max(1, Math.min(6, cards.length - 1));
  moveTo(Math.round(target + Math.max(-most, Math.min(most, carry))));
}

// Window capture runs before page.js's link handling, so a drag never opens a project, and
// a click on a card behind brings it forward instead of opening it.
function onClickCapture(event) {
  if (!root?.isConnected || root.hidden || !(event.target instanceof Element)) return;
  const card = event.target.closest('[data-reel-card]');
  if (!card || !root.contains(card)) return;
  const index = cards.indexOf(card);
  if (suppressClick || (index !== current && index >= 0)) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  if (index === current || index < 0) return;
  const at = Math.round(position);
  moveTo(at + stackDepth(index, at, cards.length));
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
  moveTo(Math.round(target) + (down ? 1 : -1));
  // Keyboard focus follows the front card once it has moved.
  window.setTimeout(() => {
    if (root?.contains(document.activeElement)) cards[current]?.focus({ preventScroll: true });
  }, 0);
}

function refresh() {
  if (measure()) paint();
}

function teardown() {
  if (root) {
    root.removeEventListener('wheel', onWheel);
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerUp);
  }
  resizeObserver?.disconnect();
  resizeObserver = null;
  cancelAnimationFrame(frame);
  frame = 0;
  window.clearTimeout(snapTimer);
  drag = null;
  suppressClick = false;
}

export function setUpReel() {
  teardown();
  current = -1;
  root = document.querySelector('[data-reel]');
  const views = document.querySelector('[data-work-views]');
  if (!root) {
    cards = [];
    if (views) views.hidden = true;
    return;
  }
  if (views) views.hidden = false;
  cards = [...root.querySelectorAll('[data-reel-card]')];

  // Back from a project: its card is in front, so the black can shrink onto it.
  const back = leaveSlug();
  const from = back ? cards.findIndex((card) => card.dataset.slug === back) : -1;
  position = target = Math.max(0, from);

  // Only while the stack is open: a non-passive wheel listener makes every scroll wait.
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove, { passive: true });
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);
  // Also catches the stack being shown again after the list view.
  resizeObserver = new ResizeObserver(refresh);
  resizeObserver.observe(root);
  // In place before the page fades in.
  refresh();
}

document.addEventListener('keydown', onKeyDown);
window.addEventListener('click', onClickCapture, true);
window.addEventListener('resize', refresh);
