// When the header row runs past the right edge of the screen (a long project or product
// title, a narrow window, the menu open beside About), it can be moved sideways to reach
// the rest: a sideways swipe or Shift+wheel on a computer, a finger drag on a phone, and
// keyboard focus brings a hidden link into view. When nothing overflows it does nothing.
//
// The Archive has its own sideways scroll (archive.js), so it is left alone there.
// The offset is --header-shift on the header (header.css).

import { clampShift } from '../lib/header-scroll.js';

const DRAG_START = 6;

let shift = 0;
let drag = null;
let swallowClick = false;

const header = () => document.querySelector('.site-header');
const ownScroll = () => document.body.dataset.page === 'archive';

/** The header's left edge at rest: the page margin. Its right limit mirrors it. */
const restLeft = (el) => el.getBoundingClientRect().left + shift;

/** How far the header's furthest piece runs past the right margin, at rest. */
function overflow(el) {
  const limit = window.innerWidth - restLeft(el);
  let right = 0;
  for (const node of el.querySelectorAll('*')) {
    if (!(node instanceof HTMLElement) || node.closest('[hidden]')) continue;
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    const style = getComputedStyle(node);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    right = Math.max(right, box.right + shift);
  }
  return Math.max(0, right - limit);
}

function apply(el, next) {
  const value = clampShift(next, overflow(el));
  if (value === shift) return;
  shift = value;
  if (shift) el.style.setProperty('--header-shift', `${shift}px`);
  else el.style.removeProperty('--header-shift');
  el.toggleAttribute('data-header-shifted', shift > 0);
}

/** Puts the header back. Called when the page changes and when the window resizes. */
function reset() {
  const el = header();
  if (!el) return;
  shift = 0;
  el.style.removeProperty('--header-shift');
  el.removeAttribute('data-header-shifted');
}

function onWheel(event) {
  const el = header();
  if (!el || ownScroll() || !el.contains(event.target)) return;
  const dx = event.deltaX || (event.shiftKey ? event.deltaY : 0);
  if (!dx || Math.abs(dx) < Math.abs(event.shiftKey ? 0 : event.deltaY)) return;
  const before = shift;
  apply(el, shift + dx);
  if (shift !== before) event.preventDefault();
}

function onPointerDown(event) {
  const el = header();
  if (event.pointerType !== 'touch' || !el || ownScroll() || !el.contains(event.target)) return;
  if (!overflow(el)) return;
  drag = { x: event.clientX, y: event.clientY, from: shift, moving: false, id: event.pointerId };
}

function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  if (!drag.moving) {
    if (Math.abs(dx) < DRAG_START || Math.abs(dx) < Math.abs(event.clientY - drag.y)) return;
    drag.moving = true;
  }
  const el = header();
  if (el) apply(el, drag.from - dx);
}

function onPointerEnd(event) {
  if (!drag || event.pointerId !== drag.id) return;
  // A drag is not a tap: the link under the finger stays put.
  swallowClick = drag.moving;
  drag = null;
}

function onClick(event) {
  if (!swallowClick) return;
  swallowClick = false;
  event.preventDefault();
  event.stopImmediatePropagation();
}

/** Tabbing to a link past the edge brings it into view. */
function onFocusIn(event) {
  const el = header();
  if (!el || ownScroll() || !(event.target instanceof Element) || !el.contains(event.target)) return;
  const box = event.target.getBoundingClientRect();
  const margin = restLeft(el);
  const edge = window.innerWidth - margin;
  if (box.right > edge) apply(el, shift + box.right - edge);
  else if (box.left < margin) apply(el, shift - (margin - box.left));
}

const bound = new WeakSet();

/**
 * The wheel listener sits on the header itself, not the document: a listener that can
 * cancel the wheel makes every scroll under it wait for JavaScript. The header persists
 * across page transitions, so this binds once; called on load and after each swap.
 */
export function setUpHeaderScroll() {
  const el = header();
  if (!el || bound.has(el)) return;
  bound.add(el);
  el.addEventListener('wheel', onWheel, { passive: false });
}

document.addEventListener('pointerdown', onPointerDown, { passive: true });
document.addEventListener('pointermove', onPointerMove, { passive: true });
document.addEventListener('pointerup', onPointerEnd, { passive: true });
document.addEventListener('pointercancel', onPointerEnd, { passive: true });
document.addEventListener('click', onClick, true);
document.addEventListener('focusin', onFocusIn);
document.addEventListener('astro:before-preparation', reset);
// The menu folding or About closing can take the overflow away: come back as far as needed.
document.addEventListener('crystal:menu-motion', () => {
  const el = header();
  if (el && shift) window.setTimeout(() => apply(el, shift), 600);
});
addEventListener('resize', reset);
