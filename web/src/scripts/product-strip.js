// Product page pictures. The current picture sits in the middle, the size of its product in
// the merch pile; its neighbours' centres sit just past the screen edges (38px, as in the
// reference). Desktop: a row. Phone: a column. They loop: the strip holds three copies of
// the pictures and runs round them. The merch pile stays behind, blurred and nearly gone.
//
// The page does not scroll. Input only moves a target: the wheel or a trackpad, a drag
// (finger or mouse), the arrow keys, a click on a neighbour. One frame loop eases the
// pictures toward it, and a moment after the input stops the target rounds to a picture.
// A drag is the exception: the pictures stay under the finger, and letting go hands the
// finger's speed to a spring that carries on and settles on a picture (throwTo).
//
// Opened from the merch pile (handoff.js), the middle picture is already where the front
// product was. The others slide in from beyond the edges while the pile melts away behind.
// Going back to Merch plays it in reverse, and the pile is in place for the merch page.

import { follow, loopOffset, openPileStyle, spring, throwTo } from '../lib/card-stack.js';
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
// After a drag the strip keeps going as if it slowed down by this much each 60th of a second
// (the reference's), then lands on the nearest picture to where that would stop.
const FLING_DECAY = 0.92;
const FRAME_MS = 1000 / 60;
const COAST_MS = FRAME_MS / (1 - FLING_DECAY);
// The finger's speed is measured over its last this many milliseconds.
const SPEED_WINDOW = 100;
// The target never runs further ahead than this, in pictures: a burst of fast scrolling
// keeps the movement going at a pace the eye can follow, instead of spinning through.
const MAX_LEAD = 2;
// Fewest cards in the loop, so one only swaps sides well off screen.
const MIN_CARDS = 8;
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
// After a throw: the spring's stiffness (0 when not thrown) and the speed, in pictures per ms.
let thrown = 0;
let velocity = 0;
let suppressClick = false;
let leaving = false;
// Leaving for Merch: called once the pictures have landed where the pile takes over.
let landed = null;
let duration = 500;
const easeOut = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** The spring that settles a throw: about as long as the shared expo-out to come to rest. */
const springOmega = () => 9.2 / duration;

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
  // A card swaps sides at the far end of the loop: hidden just before. There are always
  // enough (MIN_CARDS) for that to happen well off screen.
  const reach = total / 2 - 0.05;
  // Sizes first, then styles: reading a size after a style change forces the page to restyle,
  // once per card.
  const sizes = cards.map((card) => (column ? card.offsetHeight : card.offsetWidth));
  cards.forEach((card, k) => {
    const s = loopOffset(k, shown, total);
    const middle = Math.abs(s) < 0.5;
    const offset = Math.round(s * gap);
    const size = sizes[k];
    // Drawn until a whole picture past the edge: the stage's height can differ from what a
    // phone shows (Safari's bars), and a picture must never vanish while still in view.
    const onScreen = Math.abs(offset) - size / 2 < screen / 2 + size;
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

  if (thrown) {
    const step = spring(shown - target, velocity, thrown, elapsed);
    shown = target + step.offset;
    velocity = step.velocity;
    const size = pitch();
    if (Math.abs(step.offset) * size < 0.25 && Math.abs(step.velocity) * size * FRAME_MS < 0.25) {
      shown = target;
      velocity = 0;
      thrown = 0;
    }
  } else if (!drag?.moved) {
    shown = reducedMotion.matches ? target : follow(shown, target, elapsed, duration);
    if (Math.abs(target - shown) < 0.001) shown = target;
  }

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
  if (shown !== target || thrown || open !== openTo) frame = requestAnimationFrame(tick);
}

function wake() {
  if (frame) return;
  lastFrame = performance.now();
  frame = requestAnimationFrame(tick);
}

function snapSoon() {
  window.clearTimeout(snapTimer);
  snapTimer = window.setTimeout(() => {
    if (drag || thrown) return;
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
  thrown = 0;
  velocity = 0;
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
  nudge((delta * unit) / (vertical() ? pitch() : WHEEL_STEP));
  snapSoon();
}

// A drag, by finger or mouse: the pictures follow it, up or sideways, whichever way it
// mostly goes, staying exactly under it. Letting go keeps them going at the same speed until
// they slow down and settle on a picture.
function onPointerDown(event) {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
  suppressClick = false;
  if (event.pointerType === 'mouse') event.preventDefault();
  drag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    moved: false,
    // Recent positions and times, for the speed when the finger lifts.
    samples: [],
  };
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.id || leaving) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < TAP_SLOP) return;
  if (!drag.moved) {
    // A mouse drag keeps going past the strip's edge.
    try {
      root.setPointerCapture(event.pointerId);
    } catch {
      // The pointer is already gone.
    }
    // Caught: whatever was moving stops where it is, under the finger.
    closeNav();
    window.clearTimeout(snapTimer);
    thrown = 0;
    velocity = 0;
  }
  drag.moved = true;
  const dx = drag.lastX - event.clientX;
  const dy = drag.lastY - event.clientY;
  const travel = Math.abs(dx) > Math.abs(dy) ? dx : dy;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  // One to one: the pictures move exactly as far as the finger.
  shown += travel / pitch();
  target = shown;
  const { samples } = drag;
  samples.push({ t: event.timeStamp, p: shown });
  while (samples.length > 2 && event.timeStamp - samples[0].t > SPEED_WINDOW) samples.shift();
  wake();
}

/** The drag's speed over its last moments, in pictures per millisecond. */
function releaseSpeed(samples, now) {
  const last = samples[samples.length - 1];
  if (!last || now - last.t > SPEED_WINDOW) return 0;
  const first = samples.find((sample) => last.t - sample.t <= SPEED_WINDOW) ?? last;
  const dt = last.t - first.t;
  return dt > 0 ? (last.p - first.p) / dt : 0;
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const { moved, samples } = drag;
  drag = null;
  if (!moved) return;
  suppressClick = true;
  window.setTimeout(() => (suppressClick = false), 50);
  window.clearTimeout(snapTimer);
  if (leaving) return;
  if (reducedMotion.matches) {
    target = Math.round(shown);
    wake();
    return;
  }
  // The spring leaves at the finger's speed and lands on the picture the throw would coast
  // to, so the movement carries on from the drag without a jump and ends centred.
  const speed = event.type === 'pointercancel' ? 0 : releaseSpeed(samples, event.timeStamp);
  const landing = throwTo(shown, speed, COAST_MS, springOmega(), MAX_LEAD);
  target = landing.target;
  velocity = speed;
  thrown = landing.omega;
  wake();
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
  window.clearTimeout(snapTimer);
  nudge(Math.round(target) + (down ? 1 : -1) - target);
}

// Back to Merch ----------------------------------------------------------------------

const routed = () => Boolean(document.querySelector('[name="astro-view-transitions-enabled"]'));
const trim = (pathname) => pathname.replace(/\/+$/, '');

/**
 * Leaving for the merch page: the picture on screen stays, the others slide out past the
 * edges and the pile comes back into focus. The merch page then opens with this product in
 * front, showing that same picture (merch-reel.js). (Running back to the first picture
 * spun through the others on the way out.)
 */
// `from`: the product being left. With Back, the address has already changed to /merch.
function leaveTo(pathname, from = location.pathname) {
  if (!root?.isConnected || leaving || reducedMotion.matches || !routed()) return;
  if (trim(pathname) !== '/merch' || !total) return;
  leaving = true;
  drag = null;
  thrown = 0;
  velocity = 0;
  window.clearTimeout(snapTimer);
  // The nearest whole picture: where it already is, or just about.
  target = Math.round(target);
  const middle = cards[((target % total) + total) % total]?.querySelector('img');
  const picture = middle ? { src: middle.currentSrc || middle.src, ratio: middle.naturalWidth / middle.naturalHeight || 0 } : null;
  animateOpen(0);
  // The page changes once the pictures are where the pile takes over. A background tab
  // never runs the frames, so a timer stands in.
  const done = new Promise((resolve) => {
    landed = resolve;
    window.setTimeout(resolve, duration + 100);
  });
  // The merch page's code is fetched meanwhile, so it is placed the moment it arrives.
  handOff(pathname, { from: 'product', slug: from, picture }, Promise.all([done, import('./merch-reel.js')]));
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
    if (!handoffLeave()) leaveTo(event.to.pathname, event.from.pathname);
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
  thrown = 0;
  velocity = 0;
  leaving = false;
  landed = null;

  root = document.querySelector('[data-product-strip]');
  // page.js runs this on every page once the code is loaded: only a product takes the hand-off.
  if (!root) return;
  const arrival = takeHandoff();
  duration = motionMs();
  cards = [...root.querySelectorAll('[data-product-card]')];
  count = root.querySelectorAll('[data-product-card][data-copy="1"]').length;
  // A product with one or two pictures has only three to six cards: the far ones swapped
  // sides close to the screen, so they were hidden early. Repeat whole sets until enough.
  const track = root.querySelector('[data-product-track]');
  const set = cards.filter((card) => card.dataset.copy === '0');
  while (track && set.length && cards.length < MIN_CARDS) {
    set.forEach((card) => {
      const copy = card.cloneNode(true);
      copy.dataset.copy = 'extra';
      copy.querySelector('img')?.removeAttribute('fetchpriority');
      track.append(copy);
      cards.push(copy);
    });
  }
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
