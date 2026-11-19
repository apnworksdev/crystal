// Product page header. The title, price and Buy live in the persisted header,
// so each product page writes them in after the swap.
//
// The Merch link and the product title share one bubble (one grid cell). Arriving on a product
// grows that bubble from "Merch" to the title, and leaving shrinks it back before the page changes.

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

let leaving = null;

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

function motionMs() {
  const header = document.querySelector('.site-header');
  const ms = header ? parseFloat(getComputedStyle(header).getPropertyValue('--transition-duration')) * 1000 : NaN;
  return Number.isFinite(ms) ? ms : 180;
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
  title.animate([{ color: 'transparent' }, { color: 'transparent', offset: 0.4 }, {}], { duration: ms * 1.6 });
  if (shown(buy)) {
    buy.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: ms * 2, easing: 'ease-out' });
  }
}

/** Shrinks the title back to the Merch link and fades out the price row. Runs on the leaving page. */
export function leaveProduct() {
  if (leaving) return leaving;
  const all = parts();
  const { title, buy } = all;
  if (!title || !buy || title.hidden) return Promise.resolve();

  if (reducedMotion.matches || !shown(title)) {
    clear(all);
    return Promise.resolve();
  }

  const from = title.getBoundingClientRect().width;
  const to = merchWidth(title);
  const ms = motionMs();
  const options = { duration: ms, easing: EASING, fill: 'forwards' };
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
  if (arriving) growIn(title, buy);
}
