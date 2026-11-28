// Awards page: a freely scrollable list that rolls slowly upward, like credits, and loops
// both ways. The track is a copy, the list, then enough copies to fill the screen; the
// scroll position is kept inside the list, so there is always a copy to scroll into above
// and below (lib/awards-loop.js). The visitor's own scroll is the browser's, with its
// momentum. While they scroll or touch it the roll lets go, and once the list has stopped
// it eases back up to speed. The roll carries on under the pointer, like the reference;
// only keyboard focus on an entry eases it to a stop. Hover or focus on an award's text
// shows its image; on phone the entry at the centre of the screen shows it instead
// (data-centred, see awards.css). Reduced motion: no roll, one list, free scroll.

import { centredIndex, copiesAfter, wrapIntoList } from '../lib/awards-loop.js';
import { setUpScramble, splitAwardText } from './award-scramble.js';
import { watchScrollEnd } from './scroll-end.js';

// The reference's credits speed (its app.js, `SPEED = 24`).
const PX_PER_SECOND = 24;
// How quickly the roll gets up to speed, or comes to rest, in ms.
const EASE_MS = 450;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let scroller = null;
let track = null;
/** @type {HTMLElement | null} The list itself, the one with images and focusable text. */
let list = null;
let loopHeight = 0;
let looping = false;
let frame = 0;
let lastTime = 0;
// The exact position. Browsers round scrollTop, and the roll moves under half a pixel a
// frame, so adding to scrollTop itself stalled or stepped unevenly.
let position = 0;
let speed = 0;
// What the roll last wrote. A scroll event at this value is the roll's own, not the
// visitor's. Reading every scroll event as the visitor's paused the roll after each step.
let written = -1;
// The visitor is scrolling (until the scroll stops) or has a finger on the list.
let userScrolling = false;
let touching = false;
// When the visitor last used the wheel or a scroll key. A smooth wheel scroll has not sent
// its first scroll event yet when the next frame runs, and a write then would cut it short.
let lastInput = -Infinity;
const INPUT_HOLD_MS = 250;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
let stopWatchingEnd = null;
/** @type {{ top: number, height: number }[]} Every entry of every copy, from the track's top. */
let rows = [];
let centred = -1;
/** @type {ResizeObserver | null} */
let resizeObserver = null;
/** @type {Set<string>} */
const pauses = new Set();
/** @type {AbortController | null} */
let ac = null;

/** Adds copies of the hidden list: one above the list, and enough below to fill the screen. */
function fillCopies() {
  if (!track || !list) return;
  const template = track.querySelector('.awards[aria-hidden="true"]');
  if (!template) return;
  if (list.previousElementSibling == null) track.prepend(template.cloneNode(true));
  const after = () => {
    let count = 0;
    for (let next = list.nextElementSibling; next; next = next.nextElementSibling) count++;
    return count;
  };
  const needed = copiesAfter(list.offsetHeight, scroller.clientHeight);
  while (after() < needed) track.append(template.cloneNode(true));
}

function measure() {
  if (!track || !list) return;
  if (looping) fillCopies();
  const oldHeight = loopHeight;
  loopHeight = looping ? list.offsetHeight : 0;
  const trackTop = track.getBoundingClientRect().top;
  rows = [...track.querySelectorAll('.award')].map((award) => {
    const rect = award.getBoundingClientRect();
    return { top: rect.top - trackTop, height: rect.height };
  });
  if (looping && loopHeight >= 1) {
    // Keep the same spot within the list when its height changes.
    const offset = oldHeight >= 1 ? position - oldHeight : 0;
    position = wrapIntoList(loopHeight + offset, loopHeight);
    write(position);
  }
  updateCentred();
}

// The mouse, while it is over the list. The list rolls under a still pointer, and browsers
// only update :hover when the pointer itself moves, so the hovered entry got stuck and the
// one now under the pointer showed nothing. The entry under it is marked on every move.
let pointer = null;
let hovered = null;

function setHovered(award) {
  if (award === hovered) return;
  hovered?.removeAttribute('data-hovered');
  award?.setAttribute('data-hovered', '');
  hovered = award;
}

function updateHovered() {
  if (!pointer || !scroller) {
    setHovered(null);
    return;
  }
  const text = document.elementFromPoint(pointer.x, pointer.y)?.closest('.award__text');
  setHovered(text && scroller.contains(text) ? text.closest('.award') : null);
}

function onPointerMove(event) {
  if (event.pointerType !== 'mouse') return;
  pointer = { x: event.clientX, y: event.clientY };
  updateHovered();
}

function onPointerLeave() {
  pointer = null;
  setHovered(null);
}

function write(top) {
  written = top;
  scroller.scrollTop = top;
}

function updateCentred() {
  if (!scroller || !list) return;
  const index = centredIndex(rows, scroller.scrollTop + scroller.clientHeight / 2, list.children.length);
  if (index === centred) return;
  list.children[centred]?.removeAttribute('data-centred');
  list.children[index]?.setAttribute('data-centred', '');
  centred = index;
}

/** Back into the list when the visitor scrolls into a copy. It looks exactly the same. */
function normalize() {
  if (!scroller || !looping || loopHeight < 1) return;
  const top = scroller.scrollTop;
  const wrapped = wrapIntoList(top, loopHeight);
  if (wrapped !== top) {
    position = wrapped;
    write(wrapped);
  }
}

function onScroll() {
  if (!scroller) return;
  if (Math.abs(scroller.scrollTop - written) >= 1) {
    userScrolling = true;
    speed = 0;
    position = scroller.scrollTop;
    normalize();
  }
  updateCentred();
  updateHovered();
  markUnderHeader();
}

/** @type {Set<Element>} Ceremonies hidden because the header row sits on them. */
let underHeader = new Set();

/**
 * The header row stays in the middle of the screen while the list rolls under it, and a
 * ceremony passing under the logo read through and around it. Hide the ones it covers
 * (awards.css fades them) and bring them back once they have passed.
 */
function markUnderHeader() {
  const header = document.querySelector('.site-header');
  const parts = header
    ? [...header.querySelectorAll('.site-header__logo, .site-header__context, .site-header__nav, .site-header__toggle')]
        .map((part) => part.getBoundingClientRect())
        .filter((box) => box.width > 0 && box.height > 0)
    : [];
  const next = new Set();
  if (scroller && parts.length && !header.hasAttribute('data-about')) {
    const left = Math.min(...parts.map((box) => box.left));
    const right = Math.max(...parts.map((box) => box.right));
    const top = Math.min(...parts.map((box) => box.top));
    const bottom = Math.max(...parts.map((box) => box.bottom));
    // A few points across the row and just past its edges, so a line touching it counts.
    for (let x = left + 2; x <= right; x += 24) {
      for (const y of [top - 4, (top + bottom) / 2, bottom + 4]) {
        for (const element of document.elementsFromPoint(x, y)) {
          const ceremony = element.closest('.award__ceremony');
          if (ceremony && scroller.contains(ceremony)) next.add(ceremony);
        }
      }
    }
  }
  underHeader.forEach((ceremony) => {
    if (!next.has(ceremony)) ceremony.removeAttribute('data-under-header');
  });
  next.forEach((ceremony) => ceremony.setAttribute('data-under-header', ''));
  underHeader = next;
}

function onScrollEnd() {
  // The roll's own writes end with scrollend too. Taking the rounded scrollTop then would
  // nudge the exact position forward every frame.
  if (!userScrolling) return;
  userScrolling = false;
  if (scroller) position = scroller.scrollTop;
}

function onInput() {
  lastInput = performance.now();
}

function onKeyDown(event) {
  if (SCROLL_KEYS.has(event.key)) onInput();
}

function onTouchStart() {
  touching = true;
}

function onTouchEnd() {
  touching = false;
}

function tick(now) {
  if (!scroller?.isConnected) {
    tearDown();
    return;
  }
  const dt = Math.min(now - lastTime, 64);
  lastTime = now;
  if (!userScrolling && !touching && now - lastInput > INPUT_HOLD_MS) {
    const target = pauses.size === 0 ? PX_PER_SECOND : 0;
    speed += (target - speed) * (1 - Math.exp(-dt / EASE_MS));
    if (Math.abs(target - speed) < 0.05) speed = target;
    position = wrapIntoList(position + (speed * dt) / 1000, loopHeight);
    // Whole device pixels: the finest step the screen can show, and one the browser keeps.
    const ratio = window.devicePixelRatio || 1;
    const top = Math.round(position * ratio) / ratio;
    if (top !== written) write(top);
  }
  frame = requestAnimationFrame(tick);
}

/** Keyboard focus on an entry stops the roll, so it can be read. A tap's focus does not. */
function onFocusIn(event) {
  if (!(event.target instanceof Element)) return;
  const text = event.target.closest('.award__text');
  if (text?.matches(':focus-visible')) pauses.add('focus');
}

function onFocusOut() {
  window.setTimeout(() => {
    if (!scroller?.querySelector('.award__text:focus-visible')) pauses.delete('focus');
  }, 0);
}

function tearDown() {
  underHeader.forEach((ceremony) => ceremony.removeAttribute('data-under-header'));
  underHeader = new Set();
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  stopWatchingEnd?.();
  stopWatchingEnd = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  userScrolling = false;
  touching = false;
  lastInput = -Infinity;
  speed = 0;
  written = -1;
  ac?.abort();
  ac = null;
  pauses.clear();
  pointer = null;
  setHovered(null);
  scroller = null;
  track = null;
  list = null;
  rows = [];
  centred = -1;
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
  list = track?.querySelector('.awards:not([aria-hidden="true"])') ?? null;
  if (!track || !list) return;

  // Each character in its own span for the pointer's scramble, before the copies are made.
  splitAwardText(track);
  looping = !reducedMotion.matches;
  scroller.toggleAttribute('data-awards-loop', looping);
  // Copies, heights and the start position are all set here, before the page fades in.
  measure();

  ac = new AbortController();
  const { signal } = ac;
  scroller.addEventListener('scroll', onScroll, { signal, passive: true });
  scroller.addEventListener('focusin', onFocusIn, { signal });
  scroller.addEventListener('focusout', onFocusOut, { signal });
  scroller.addEventListener('wheel', onInput, { signal, passive: true });
  scroller.addEventListener('pointermove', onPointerMove, { signal, passive: true });
  scroller.addEventListener('pointerleave', onPointerLeave, { signal, passive: true });
  document.addEventListener('keydown', onKeyDown, { signal });
  scroller.addEventListener('touchstart', onTouchStart, { signal, passive: true });
  scroller.addEventListener('touchend', onTouchEnd, { signal, passive: true });
  scroller.addEventListener('touchcancel', onTouchEnd, { signal, passive: true });
  setUpScramble(scroller, signal);
  stopWatchingEnd = watchScrollEnd(scroller, onScrollEnd);
  // Fonts loading, a resize or a phone rotating all change the heights.
  resizeObserver = new ResizeObserver(() => measure());
  resizeObserver.observe(list);
  resizeObserver.observe(scroller);

  if (looping) {
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  }
}
