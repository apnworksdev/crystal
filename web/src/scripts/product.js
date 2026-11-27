// Product page header. The title, price and Buy live in the persisted header,
// so each product page writes them in after the swap.
//
// The Merch link and the product title share one bubble (one grid cell). Arriving on a product
// grows that bubble from "Merch" to the title, and leaving shrinks it back before the page changes.

import { showHeaderProjectAtOnce } from './header.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
// The shared expo-out (--ease-out).
const EASING = 'cubic-bezier(0.19, 1, 0.22, 1)';
// Phone fades: an even curve (--ease-fold). On the expo-out they were nearly done in the
// first frame, so the title, price and Buy seemed to vanish and pop back.
const FADE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const FADE_OUT_MS = 300;
const FADE_IN_MS = 400;
// Same query as the phone blocks in the stylesheets.
const phone = matchMedia('(max-width: 48rem), (max-height: 30rem) and (pointer: coarse)');

let leaving = null;
let morph = null;
// Merch shows the front product's name beside its tab. Where it sat just before the page
// changed, so the product title can slide on from there instead of growing from nothing.
let merchName = null;
// Animations holding the title where the Merch page will show the name, until it does.
let handBack = null;

document.addEventListener('astro:before-swap', () => {
  const link = document.querySelector('[data-header-project]');
  merchName =
    document.querySelector('[data-merch-reel]') && link && !link.hidden && link.getClientRects().length
      ? { text: link.textContent, left: link.getBoundingClientRect().left }
      : null;
});

function parts() {
  return {
    source: document.querySelector('[data-product-source]'),
    title: document.querySelector('[data-product-title]'),
    buy: document.querySelector('[data-product-buy]'),
    price: document.querySelector('[data-product-price]'),
    link: document.querySelector('[data-product-link]'),
    label: document.querySelector('[data-product-buy-label]'),
  };
}

/** --grow-duration, in milliseconds. */
function motionMs() {
  const header = document.querySelector('.site-header');
  const ms = header ? parseFloat(getComputedStyle(header).getPropertyValue('--grow-duration')) * 1000 : NaN;
  return Number.isFinite(ms) ? ms : 500;
}

/** The width of the Merch link that shares the bubble with the title. */
function merchWidth(title) {
  const merch = title.parentElement?.querySelector(':scope > .site-header__link');
  return merch ? merch.getBoundingClientRect().width : 0;
}

function shown(element) {
  return !element.hidden && getComputedStyle(element).display !== 'none';
}

function clear({ title, buy, price, link, label }) {
  title.textContent = '';
  title.hidden = true;
  price.textContent = '';
  link.removeAttribute('href');
  if (label) label.textContent = '';
  buy.hidden = true;
}

/** Grows the bubble from the Merch link to the title, and fades in the price row. */
function growIn(title, buy) {
  if (reducedMotion.matches || !shown(title)) return;
  const from = merchWidth(title);
  const to = title.getBoundingClientRect().width;
  const ms = motionMs();
  if (from > 1 && Math.abs(to - from) > 1) {
    title.animate([{ width: `${from}px` }, { width: `${to}px` }], { duration: ms, easing: EASING });
  }
  title.animate([{ color: 'transparent' }, { color: 'transparent', offset: 0.36 }, {}], { duration: ms });
  if (shown(buy)) {
    buy.animate([{ opacity: 0 }, { opacity: 0, offset: 0.36 }, { opacity: 1 }], { duration: ms, easing: EASING });
  }
}

/** From Merch: the name beside the Merch tab slides over the tab and becomes the title. */
function slideIn(title, buy, fromLeft) {
  const ms = motionMs();
  const dx = fromLeft - title.getBoundingClientRect().left;
  const merch = title.parentElement?.querySelector(':scope > .site-header__link');
  title.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: ms, easing: EASING });
  // The tab stays under the sliding title and fades, instead of vanishing at once.
  merch?.animate([{ visibility: 'visible', opacity: 1 }, { visibility: 'visible', opacity: 0 }], {
    duration: ms * 0.6,
    easing: EASING,
  });
  if (shown(buy)) {
    buy.animate([{ opacity: 0 }, { opacity: 0, offset: 0.36 }, { opacity: 1 }], { duration: ms, easing: EASING });
  }
}

/** Phone: after the menu has opened, puts the fading title and price row back where they were. */
export function pinProductMorph() {
  morph?.pins?.forEach(({ element, box }) => {
    const now = element.getBoundingClientRect();
    element.style.translate = `${box.left - now.left}px ${box.top - now.top}px`;
  });
}

function endMorph() {
  if (!morph) return;
  morph.pins?.forEach(({ element }) => {
    element.style.translate = '';
  });
  morph.animations.forEach((animation) => animation.cancel());
  window.clearTimeout(morph.timer);
  morph.header.removeAttribute('data-product-morph');
  morph = null;
}

/**
 * The menu is opening on a product page: the title shrinks back into "Merch" and the price
 * row fades, instead of both vanishing. The header keeps them shown (data-product-morph)
 * until they have gone.
 */
export function productMenuOpening(header) {
  endMorph();
  const { title, buy } = parts();
  if (!header || !title || title.hidden || reducedMotion.matches) return;
  if (document.body.dataset.page !== 'product') return;
  const from = title.getBoundingClientRect().width;
  if (from < 1) return;
  header.setAttribute('data-product-morph', '');
  // Phone: the menu column takes the title's place, so the title and the price row fade
  // where they are. pinProductMorph holds them there once the open menu has moved them.
  if (phone.matches) {
    const ms = FADE_OUT_MS;
    const options = { duration: ms, easing: FADE_EASING, fill: 'forwards' };
    const animations = [title.animate([{ opacity: 1 }, { opacity: 0 }], options)];
    if (!buy.hidden) animations.push(buy.animate([{ opacity: 1 }, { opacity: 0 }], options));
    const pins = [title, buy].map((element) => ({ element, box: element.getBoundingClientRect() }));
    morph = { header, animations, pins, timer: window.setTimeout(endMorph, ms + 20) };
    return;
  }
  const merch = title.parentElement?.querySelector(':scope > .site-header__link');
  const to = parseFloat(merch?.style.getPropertyValue('--full')) || merchWidth(title);
  const ms = motionMs();
  const options = { duration: ms, easing: EASING, fill: 'forwards' };
  const animations = [
    title.animate([{ color: 'transparent' }, { color: 'transparent' }], options),
    title.animate([{ width: `${from}px` }, { width: `${to}px` }], options),
  ];
  if (!buy.hidden) animations.push(buy.animate([{ opacity: 1 }, { opacity: 0 }], { ...options, duration: ms * 0.6 }));
  morph = { header, animations, timer: window.setTimeout(endMorph, ms + 20) };
}

/** The menu has folded away on a product page: the title grows out of "Merch" again. */
export function productMenuClosed() {
  endMorph();
  const { title, buy } = parts();
  if (!title || title.hidden || document.body.dataset.page !== 'product') return;
  // Two paths finish closing the menu. The title grows out once.
  if (title.getAnimations().length) return;
  if (phone.matches && !reducedMotion.matches) {
    const options = { duration: FADE_IN_MS, easing: FADE_EASING };
    title.animate([{ opacity: 0 }, { opacity: 1 }], options);
    if (!buy.hidden) buy.animate([{ opacity: 0 }, { opacity: 1 }], options);
    return;
  }
  growIn(title, buy);
}

/**
 * Shrinks the title back to the Merch link and fades out the price row. Runs on the leaving
 * page. Going to Merch, the title slides back to where Merch shows the name, the tab fades
 * in behind it, and Merch shows that name at once.
 */
export function leaveProduct(destination = '') {
  if (leaving) return leaving;
  const all = parts();
  const { title, buy } = all;
  if (!title || !buy || title.hidden) return Promise.resolve();

  if (reducedMotion.matches || !shown(title)) {
    clear(all);
    return Promise.resolve();
  }

  const merch = title.parentElement?.querySelector(':scope > .site-header__link');
  if (destination.replace(/\/+$/, '') === '/merch' && merch) {
    const ms = motionMs();
    const dx = merch.getBoundingClientRect().right + 1 - title.getBoundingClientRect().left;
    const options = { duration: ms, easing: EASING, fill: 'forwards' };
    const animations = [
      title.animate([{ transform: 'none' }, { transform: `translateX(${dx}px)` }], options),
      merch.animate([{ visibility: 'visible', opacity: 0 }, { visibility: 'visible', opacity: 1 }], options),
    ];
    if (shown(buy)) animations.push(buy.animate([{ opacity: 1 }, { opacity: 0 }], { ...options, duration: ms * 0.6 }));
    showHeaderProjectAtOnce(title.textContent);
    // Held there until Merch shows the name (setUpProduct), so the row never empties.
    handBack = animations;
    const finished = Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
    const timeout = new Promise((resolve) => window.setTimeout(resolve, ms * 0.56 + 80));
    leaving = Promise.race([finished, timeout]).then(() => {
      leaving = null;
    });
    return leaving;
  }

  const from = title.getBoundingClientRect().width;
  const to = merchWidth(title);
  // The page may change once the shrink has visually landed on the expo-out curve.
  const ms = motionMs() * 0.56;
  const options = { duration: motionMs(), easing: EASING, fill: 'forwards' };
  const animations = [title.animate([{ color: 'transparent' }, { color: 'transparent' }], options)];
  if (to > 1) animations.push(title.animate([{ width: `${from}px` }, { width: `${to}px` }], options));
  if (shown(buy)) animations.push(buy.animate([{ opacity: 1 }, { opacity: 0 }], options));

  // A background tab may never start the animations. The page change must not wait for them.
  const finished = Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
  const timeout = new Promise((resolve) => window.setTimeout(resolve, ms + 80));
  leaving = Promise.race([finished, timeout]).then(() => {
    clear(all);
    animations.forEach((animation) => animation.cancel());
    leaving = null;
  });
  return leaving;
}

export function setUpProduct() {
  // The new page is in place (Merch already shows the name): let go of the held title.
  handBack?.forEach((animation) => animation.cancel());
  handBack = null;
  const all = parts();
  const { source, title, buy, price, link, label } = all;

  if (!title || !buy || !price || !link) return;

  if (!source) {
    clear(all);
    return;
  }

  const arriving = title.hidden;
  const name = source.dataset.title || '';
  title.textContent = name;
  title.hidden = false;
  price.textContent = source.dataset.price || '';
  link.href = source.dataset.url || '#';
  if (label) label.textContent = ` ${name} (opens in a new tab)`;
  buy.hidden = false;
  const from = merchName;
  merchName = null;
  if (!arriving) return;
  if (from && from.text === name && !reducedMotion.matches) slideIn(title, buy, from.left);
  else growIn(title, buy);
}
