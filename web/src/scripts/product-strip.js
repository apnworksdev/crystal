// Product page pictures. The current picture sits in the middle, the size of its product in
// the merch pile; its neighbours' centres sit just past the screen edges (38px, as in the
// reference). Desktop: a row. Phone: a column. They loop: the strip holds three copies of
// the pictures and runs round them. The merch pile stays behind, blurred and nearly gone.
//
// The page does not scroll. Input only moves a target: the wheel or a trackpad, a drag
// (finger or mouse), the arrow keys, a click on a neighbour. One frame loop eases the
// pictures toward it, and a moment after the input stops the target rounds to a picture.
//
// Opened from the merch pile (handoff.js), the middle picture is already where the front
// product was. The others slide in from beyond the edges while the pile melts away behind.
// Going back to Merch plays it in reverse, and the pile is in place for the merch page.

import { follow, loopOffset, openPileStyle } from '../lib/card-stack.js';
import { checkHandoff, handOff, handoffLeave, takeHandoff } from './handoff.js';
import { closeNav } from './header.js';

// Neighbours' centres sit this far past the screen edges.
const PAST_EDGE = 38;
// Wheel distance that moves one picture on desktop (the reference's). On a phone, and for a
// drag, one picture is the distance between two centres, so the pictures follow the finger.
const WHEEL_STEP = 400;
// The target rounds to a picture this long after the last input.
const SNAP_MS = 160;
// A press only counts as a drag past this distance; shorter, it stays a click.
const TAP_SLOP = 8;
// After a drag the strip keeps going and slows down: the speed left after each 60th of a second.
const FLING_DECAY = 0.92;
const FRAME_MS = 1000 / 60;
// The target never runs further ahead than this, in pictures: a burst of fast scrolling
// keeps the movement going at a pace the eye can follow, instead of spinning through.
const MAX_LEAD = 2;
// Same query as the phone blocks in the stylesheets (header.js `phone`).
const phone = matchMedia('(max-width: 48rem), (max-height: 30rem) and (pointer: coarse)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let root = null;
let cards = [];
let ghosts = [];
// Pictures per copy, and all the cards in the loop (three copies).
let count = 0;
let total = 0;
// Where the strip is drawn and where it is going, in pictures. They keep counting round the
// loop; loopOffset wraps them.
let shown = 0;
let target = 0;
// 0 is the merch pile, 1 the product open over it.
let open = 1;
let openFrom = 1;
let openTo = 1;
let openStart = 0;
// The same, evenly in time: the pile fades on it (openPileStyle), so it is seen to go.
let openEven = 1;
let evenFrom = 1;
let frame = 0;
let lastFrame = 0;
let snapTimer = 0;
let drag = null;
let fling = null;
let suppressClick = false;
let leaving = false;
// Leaving for Merch: called once the pictures have landed where the pile takes over.
let landed = null;
let duration = 500;
const easeOut = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** --grow-duration in milliseconds: the shared expo-out. */
function motionMs() {
  const ms = root ? parseFloat(getComputedStyle(root).getPropertyValue('--grow-duration')) * 1000 : NaN;
  return Number.isFinite(ms) && ms > 0 ? ms : 500;
}

function vertical() {
  return phone.matches;
}

/** The distance between two pictures' centres. */
function pitch() {
  return vertical() ? Math.round(root.clientHeight / 2 + PAST_EDGE) : Math.round(root.clientWidth / 2 + PAST_EDGE);
}

function draw() {
  if (!total) return;
  const column = vertical();
  const gap = pitch() * (2 - open);
  const screen = column ? root.clientHeight : root.clientWidth;
  // With one picture there are only three cards, and the far ones come round behind the
  // screen: hide them before they swap sides (the reference's 1.45).
  const reach = total <= 3 ? 1.45 : total / 2 - 0.05;
  cards.forEach((card, k) => {
    const s = loopOffset(k, shown, total);
    const middle = Math.abs(s) < 0.5;
    const offset = Math.round(s * gap);
    const size = column ? card.offsetHeight : card.offsetWidth;
    const onScreen = Math.abs(offset) - size / 2 < screen / 2;
    const visible = open > 0.001 && Math.abs(s) < reach && onScreen;
    card.style.visibility = visible || middle ? 'visible' : 'hidden';
    // The middle picture is where the front product was: it stays. The others fade in as they come.
    card.style.opacity = middle ? '1' : (open * open).toFixed(3);
    card.style.transform = column
      ? `translate(-50%, -50%) translateY(${offset}px)`
      : `translate(-50%, -50%) translateX(${offset}px)`;
    if (card.dataset.middle !== String(middle)) {
      card.dataset.middle = String(middle);
      card.style.cursor = middle ? '' : 'pointer';
    }
  });
  ghosts.forEach(({ element, style }) => {
    const { blur, opacity } = openPileStyle(style, openEven);
    element.style.filter = blur > 0.05 ? `blur(${blur.toFixed(1)}px)` : 'none';
    element.style.opacity = opacity.toFixed(3);
  });
}

function tick(now) {
  frame = 0;
  if (!root?.isConnected) return;
  const elapsed = Math.min(64, Math.max(0, now - lastFrame));
  lastFrame = now;

  if (fling) {
    target += (fling.speed * elapsed) / pitch();
    fling.speed *= FLING_DECAY ** (elapsed / FRAME_MS);
    if (Math.abs(fling.speed) * FRAME_MS < 0.5) {
      fling = null;
      snapSoon();
    }
  }

  shown = reducedMotion.matches ? target : follow(shown, target, elapsed, duration);
  if (Math.abs(target - shown) < 0.001) shown = target;

  if (open !== openTo) {
    const t = reducedMotion.matches ? 1 : (now - openStart) / duration;
    open = t >= 1 ? openTo : openFrom + (openTo - openFrom) * easeOut(Math.max(0, t));
    openEven = t >= 1 ? openTo : evenFrom + (openTo - evenFrom) * Math.max(0, t);
  }

  draw();
  if (landed && open === 0 && Math.abs(target - shown) * pitch() < 0.5) {
    landed();
    landed = null;
  }
  if (shown !== target || fling || open !== openTo) frame = requestAnimationFrame(tick);
}

function wake() {
  if (frame) return;
  lastFrame = performance.now();
  frame = requestAnimationFrame(tick);
}

function snapSoon() {
  window.clearTimeout(snapTimer);
  snapTimer = window.setTimeout(() => {
    if (drag || fling) return;
    target = Math.round(target);
    wake();
  }, SNAP_MS);
}

/** Opens (1) or closes (0) the product over the pile, on the shared expo-out. */
function animateOpen(value) {
  openFrom = open;
  evenFrom = openEven;
  openTo = value;
  openStart = performance.now();
  wake();
}

/** Moves the target by `pictures` (forward is positive). */
function nudge(pictures) {
  if (leaving || total <= 1) return;
  closeNav();
  target = Math.max(shown - MAX_LEAD, Math.min(shown + MAX_LEAD, target + pictures));
  wake();
}

function onWheel(event) {
  // The strip takes every wheel: the page does not scroll, and a sideways swipe does not
  // go back a page. Whichever axis the gesture mostly goes along leads.
  event.preventDefault();
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.clientHeight : 1;
  fling = null;
  nudge((delta * unit) / (vertical() ? pitch() : WHEEL_STEP));
  snapSoon();
}

// A drag, by finger or mouse: the pictures follow it, up or sideways, whichever way it
// mostly goes. Letting go keeps them going until they slow down and settle.
function onPointerDown(event) {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
  fling = null;
  suppressClick = false;
  if (event.pointerType === 'mouse') event.preventDefault();
  drag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    lastT: event.timeStamp,
    speed: 0,
    moved: false,
  };
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.id) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < TAP_SLOP) return;
  if (!drag.moved) {
    // A mouse drag keeps going past the strip's edge.
    try {
      root.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone.
    }
  }
  drag.moved = true;
  const dx = drag.lastX - event.clientX;
  const dy = drag.lastY - event.clientY;
  const travel = Math.abs(dx) > Math.abs(dy) ? dx : dy;
  const dt = Math.max(8, event.timeStamp - drag.lastT);
  drag.speed = travel / dt;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  drag.lastT = event.timeStamp;
  nudge(travel / pitch());
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const { moved, speed, lastT } = drag;
  drag = null;
  if (!moved) return;
  suppressClick = true;
  window.setTimeout(() => (suppressClick = false), 50);
  const stale = event.timeStamp - lastT > 100;
  if (!stale && event.type !== 'pointercancel' && !reducedMotion.matches) {
    fling = { speed };
    wake();
  } else snapSoon();
}

/** A click on a neighbour brings it to the middle. */
function onClick(event) {
  if (suppressClick) {
    suppressClick = false;
    event.preventDefault();
    return;
  }
  const card = event.target instanceof Element ? event.target.closest('[data-product-card]') : null;
  if (!card || leaving) return;
  const s = Math.round(loopOffset(cards.indexOf(card), Math.round(target), total));
  if (!s) return;
  fling = null;
  window.clearTimeout(snapTimer);
  nudge(Math.round(target) + s - target);
}

function onKeyDown(event) {
  if (!root?.isConnected || root.hidden) return;
  if (document.querySelector('dialog[open]')) return;
  if (event.altKey || event.metaKey || event.ctrlKey) return;
  if (event.target instanceof HTMLElement) {
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;
  }
  const down = event.key === 'ArrowRight' || event.key === 'ArrowDown';
  const up = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
  if (!down && !up) return;
  event.preventDefault();
  fling = null;
  window.clearTimeout(snapTimer);
  nudge(Math.round(target) + (down ? 1 : -1) - target);
}

// Back to Merch ----------------------------------------------------------------------

const routed = () => Boolean(document.querySelector('[name="astro-view-transitions-enabled"]'));
const trim = (pathname) => pathname.replace(/\/+$/, '');

/**
 * Leaving for the merch page: the pictures run back to the first one (the one the pile
 * shows), the others slide out past the edges and the pile comes back into focus. The
 * merch page then opens with this product in front (merch-reel.js).
 */
function leaveTo(pathname) {
  if (!root?.isConnected || leaving || reducedMotion.matches || !routed()) return;
  if (trim(pathname) !== '/merch' || !total) return;
  leaving = true;
  drag = null;
  fling = null;
  window.clearTimeout(snapTimer);
  // The nearest first picture.
  const rest = Math.round(target);
  const back = loopOffset(0, rest, count);
  target = rest + back;
  animateOpen(0);
  // The page changes once the pictures are where the pile takes over. A background tab
  // never runs the frames, so a timer stands in.
  const done = new Promise((resolve) => {
    landed = resolve;
    window.setTimeout(resolve, duration + 100);
  });
  // The merch page's code is fetched meanwhile, so it is placed the moment it arrives.
  handOff(pathname, { from: 'product', slug: location.pathname }, Promise.all([done, import('./merch-reel.js')]));
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

function unbind(strip) {
  strip.removeEventListener('wheel', onWheel);
  strip.removeEventListener('pointerdown', onPointerDown);
  strip.removeEventListener('pointermove', onPointerMove);
  strip.removeEventListener('pointerup', onPointerUp);
  strip.removeEventListener('pointercancel', onPointerUp);
  strip.removeEventListener('click', onClick);
}

export function setUpProductStrip() {
  if (root) unbind(root);
  cancelAnimationFrame(frame);
  frame = 0;
  window.clearTimeout(snapTimer);
  drag = null;
  fling = null;
  leaving = false;
  landed = null;

  root = document.querySelector('[data-product-strip]');
  // page.js runs this on every page once the code is loaded: only a product takes the hand-off.
  if (!root) return;
  const arrival = takeHandoff();
  duration = motionMs();
  cards = [...root.querySelectorAll('[data-product-card]')];
  count = root.querySelectorAll('[data-product-card][data-copy="1"]').length;
  total = cards.length;
  ghosts = [...root.querySelectorAll('[data-ghost]')].map((element) => ({
    element,
    style: { blur: Number(element.dataset.blur) || 0, opacity: Number(element.dataset.opacity) || 0 },
  }));
  if (!total) return;

  // The first picture of the middle copy.
  shown = target = count;
  const opening = arrival?.from === 'merch' && !reducedMotion.matches;
  open = opening ? 0 : 1;
  openEven = open;
  openFrom = open;
  openTo = open;

  // Not passive: the strip takes the wheel. Only bound while a product is open.
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove, { passive: true });
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);
  root.addEventListener('click', onClick);
  draw();
  root.dataset.ready = '';
  if (opening) animateOpen(1);

  // Sizes come from the stylesheet; once a picture without a known shape arrives, place again.
  root.querySelectorAll('img').forEach((image) => {
    if (image.complete) return;
    image.addEventListener('load', () => root?.isConnected && draw(), { once: true });
  });
}

document.addEventListener('keydown', onKeyDown);
window.addEventListener('resize', () => {
  if (root?.isConnected) draw();
});
