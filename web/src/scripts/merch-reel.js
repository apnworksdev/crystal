// Merch pile. Every product stays in the stack. The front one is sharp; the ones behind
// sit higher, blurred and fainter, and keep that depth as they come forward. Same stack as
// the Work page (lib/card-stack.js). The front product's name shows in the header,
// after Merch (header.js setHeaderProject), and changes as the next one comes forward.
//
// The page does not scroll. Input only moves a target: the wheel, a drag on a touch
// screen, the arrow keys. One frame loop eases the pile toward it, so however fast the
// input comes, the pile glides. A moment after the input stops, the target rounds to the
// nearest product. As in the reference, the pile loops.
//
// Opening the front product hands the page over to the product (handoff.js): the pile
// stays where it is, and the product page takes it from there (product-strip.js).

import { cardStackStyle, depthOf, follow } from '../lib/card-stack.js';
import { checkHandoff, handOff, handoffLeave, takeHandoff } from './handoff.js';
import { closeNav, setHeaderProject } from './header.js';

// Wheel or drag distance that moves one product, in pixels (the reference's).
const WHEEL_STEP = 120;
const DRAG_STEP = 120;
// The target rounds to a product this long after the last input.
const SNAP_MS = 160;
// A touch only counts as a drag past this distance; shorter, it stays a tap.
const TAP_SLOP = 8;
// After a drag the pile keeps going and slows down: the speed left after each 60th of a second.
const FLING_DECAY = 0.92;
const FRAME_MS = 1000 / 60;
// The target never runs further ahead than this, in products: a burst of fast scrolling
// keeps the movement going at a pace the eye can follow, instead of spinning through.
const MAX_LEAD = 2;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let root = null;
// Where the pile is drawn and where it is going, in products (1.5 is halfway from the
// second to the third). Both keep counting past the last product; depthOf wraps them.
let shown = 0;
let target = 0;
let frame = 0;
let lastFrame = 0;
let snapTimer = 0;
let touch = null;
let fling = null;
let suppressClick = false;
let leaving = false;
// The product whose name the header shows, so it is only set when the front one changes.
let named = null;
let nameTimer = 0;

function cards() {
  return root ? [...root.querySelectorAll('[data-merch-card]')] : [];
}

/** --grow-duration in milliseconds: the pile eases on the shared expo-out. */
function motionMs() {
  const ms = root ? parseFloat(getComputedStyle(root).getPropertyValue('--grow-duration')) * 1000 : NaN;
  return Number.isFinite(ms) && ms > 0 ? ms : 500;
}
let duration = 500;

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

function place(card, { opacity, blur, y, scale = 1, z, active }) {
  card.style.visibility = opacity < 0.01 ? 'hidden' : 'visible';
  card.style.opacity = opacity.toFixed(3);
  card.style.filter = blur > 0.4 ? `blur(${blur.toFixed(2)}px)` : 'none';
  card.style.transform = `translate(-50%, -50%) translateY(${y.toFixed(2)}px) scale(${scale.toFixed(4)})`;
  card.style.zIndex = String(z);
  // Runs every frame while moving: attributes change only when the front card does,
  // since rewriting them restyles the card even with the same value.
  if (card.dataset.front === String(active)) return;
  card.dataset.front = String(active);
  card.style.pointerEvents = active ? '' : 'none';
  card.tabIndex = active ? 0 : -1;
  if (active) card.removeAttribute('aria-hidden');
  else card.setAttribute('aria-hidden', 'true');
}

function frontIndex(count) {
  return ((Math.round(shown) % count) + count) % count;
}

function draw() {
  const list = cards();
  const count = list.length;
  if (!count) return;
  const active = frontIndex(count);
  list.forEach((card, i) => {
    const style = cardStackStyle(depthOf(i, shown, count), reducedMotion.matches, count);
    place(card, { ...style, active: i === active && style.opacity > 0.4 });
  });
  showName(list[active]);
}

function tick(now) {
  frame = 0;
  if (!root?.isConnected) return;
  const elapsed = Math.min(64, Math.max(0, now - lastFrame));
  lastFrame = now;

  if (fling) {
    const frames = elapsed / FRAME_MS;
    target += (fling.speed * elapsed) / DRAG_STEP;
    fling.speed *= FLING_DECAY ** frames;
    if (Math.abs(fling.speed) * FRAME_MS < 0.5) {
      fling = null;
      snapSoon();
    }
  }

  shown = reducedMotion.matches ? target : follow(shown, target, elapsed, duration);
  if (Math.abs(target - shown) < 0.001) shown = target;
  draw();
  if (shown !== target || fling) frame = requestAnimationFrame(tick);
}

function wake() {
  if (frame) return;
  lastFrame = performance.now();
  frame = requestAnimationFrame(tick);
}

function snapSoon() {
  window.clearTimeout(snapTimer);
  snapTimer = window.setTimeout(() => {
    if (touch || fling) return;
    target = Math.round(target);
    wake();
  }, SNAP_MS);
}

/** Moves the target by `products` (forward is positive). */
function nudge(products) {
  if (leaving || cards().length <= 1) return;
  closeNav();
  target = Math.max(shown - MAX_LEAD, Math.min(shown + MAX_LEAD, target + products));
  wake();
}

function onWheel(event) {
  // The pile takes every wheel: the page does not scroll, and a sideways swipe does not go
  // back a page. Whichever axis the gesture mostly goes along leads.
  event.preventDefault();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.clientHeight : 1;
  fling = null;
  nudge((delta * unit) / WHEEL_STEP);
  snapSoon();
}

// Touch: the finger pulls the pile. The cards behind sit above the front one, so dragging
// down brings the next one forward (as in the reference). Letting go keeps it going.
function onPointerDown(event) {
  if (event.pointerType !== 'touch' || !event.isPrimary) return;
  fling = null;
  suppressClick = false;
  touch = { id: event.pointerId, x: event.clientX, y: event.clientY, lastY: event.clientY, lastT: event.timeStamp, speed: 0, moved: false };
}

function onPointerMove(event) {
  if (!touch || event.pointerId !== touch.id) return;
  if (!touch.moved && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < TAP_SLOP) return;
  touch.moved = true;
  const dy = event.clientY - touch.lastY;
  const dt = Math.max(8, event.timeStamp - touch.lastT);
  touch.speed = dy / dt;
  touch.lastY = event.clientY;
  touch.lastT = event.timeStamp;
  nudge(dy / DRAG_STEP);
}

function onPointerUp(event) {
  if (!touch || event.pointerId !== touch.id) return;
  const { moved, speed, lastT } = touch;
  touch = null;
  if (!moved) return;
  // The drag must not also count as a tap on the front product.
  suppressClick = true;
  window.setTimeout(() => (suppressClick = false), 50);
  const stale = event.timeStamp - lastT > 100;
  if (!stale && event.type !== 'pointercancel' && !reducedMotion.matches) {
    fling = { speed };
    wake();
  } else snapSoon();
}

function onClickCapture(event) {
  if (!suppressClick) return;
  suppressClick = false;
  event.preventDefault();
  event.stopPropagation();
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
  fling = null;
  window.clearTimeout(snapTimer);
  const rest = Math.round(target);
  nudge(rest + (down ? 1 : -1) - target);
}

// Opening a product ------------------------------------------------------------------

const routed = () => Boolean(document.querySelector('[name="astro-view-transitions-enabled"]'));
const trim = (pathname) => pathname.replace(/\/+$/, '');

/**
 * Leaving for `pathname`: when it is the front product, the pile stops where it is and the
 * product page carries on from it (product-strip.js). Its code is fetched first, so the
 * new page is placed the moment it arrives.
 */
function leaveTo(pathname) {
  if (!root?.isConnected || leaving || reducedMotion.matches || !routed()) return;
  const list = cards();
  if (!list.length) return;
  const index = frontIndex(list.length);
  const card = list[index];
  if (trim(new URL(card.href, location.href).pathname) !== trim(pathname)) return;
  leaving = true;
  fling = null;
  touch = null;
  window.clearTimeout(snapTimer);
  cancelAnimationFrame(frame);
  frame = 0;
  shown = target = Math.round(shown);
  draw();
  handOff(pathname, { from: 'merch' }, import('./product-strip.js'));
}

// Before page.js's own click handler (window runs before document in the capture phase),
// so it skips the content fade.
window.addEventListener(
  'click',
  (event) => {
    if (!root?.isConnected || event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || (link.target && link.target !== '_self')) return;
    if (suppressClick && root.contains(link)) return;
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin) leaveTo(url.pathname);
  },
  true,
);

// Back and forward, and any change that did not start with a click: before page.js reads it.
window.addEventListener(
  'astro:before-preparation',
  (event) => {
    checkHandoff(event.to.pathname);
    if (!handoffLeave()) leaveTo(event.to.pathname);
  },
  true,
);

// ------------------------------------------------------------------------------------

function unbind(reel) {
  reel.removeEventListener('wheel', onWheel);
  reel.removeEventListener('pointerdown', onPointerDown);
  reel.removeEventListener('pointermove', onPointerMove);
  reel.removeEventListener('pointerup', onPointerUp);
  reel.removeEventListener('pointercancel', onPointerUp);
  reel.removeEventListener('click', onClickCapture, true);
}

export function setUpMerchReel() {
  if (root) unbind(root);
  cancelAnimationFrame(frame);
  frame = 0;
  window.clearTimeout(snapTimer);
  fling = null;
  touch = null;
  leaving = false;
  named = null;

  root = document.querySelector('[data-merch-reel]');
  // page.js runs this on every page once the code is loaded: only Merch takes the hand-off.
  if (!root) return;
  const arrival = takeHandoff();
  duration = motionMs();

  // Back from a product: that product is in front, as it was on its page.
  const list = cards();
  const from = arrival?.slug ? list.findIndex((card) => trim(new URL(card.href, location.href).pathname) === trim(arrival.slug)) : -1;
  shown = target = Math.max(0, from);

  if (list.length > 1) {
    // Not passive: the pile takes the wheel. Only bound while Merch is open.
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove, { passive: true });
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);
    root.addEventListener('click', onClickCapture, true);
  }
  draw();
}

document.addEventListener('keydown', onKeyDown);
