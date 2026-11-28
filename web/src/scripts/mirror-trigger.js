// Three quick clicks on the header logo open the hidden mirror page, with a short
// transition (playEnter), straight from whatever page they are on.
//
// On the home page the logo does nothing on its own (it would only reload the page),
// so every click there just counts. On other pages a click waits a moment (DECIDE_MS)
// before going home, so a second and third click can still turn it into the mirror.
// A single click goes home as usual once the wait is over.
// The count lives in sessionStorage, so it survives full page loads in preview mode.

import { closeNav } from './header.js';
import { layout } from '../lib/wordmark.js';
import { REST_FLEXES, paintWord } from './wordmark.js';

// The mirror's wordmark canvas is this share of its width tall (mirror.css).
const WORD_BOX = 0.2;
const WINDOW_MS = 700;
// How long a click on another page waits for the next one before it goes home.
const DECIDE_MS = 320;
const COUNT_KEY = 'mirror-clicks';

let memory = { count: 0, at: 0 };

function read(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Storage can be blocked. Memory still works with page transitions.
  }
}

function countClick() {
  const now = Date.now();
  const stored = read(COUNT_KEY);
  const previous = stored ? { count: Number(stored.split(':')[0]), at: Number(stored.split(':')[1]) } : memory;
  const count = now - previous.at < WINDOW_MS ? previous.count + 1 : 1;
  memory = { count, at: now };
  write(COUNT_KEY, `${count}:${now}`);
  return count;
}

const onHome = () => location.pathname === '/';

const ENTER_MS = 700;
let opening = false;

/** A canvas showing the still wordmark filling `width` (as the mirror page draws it). */
function wordCanvas(width, colour) {
  const canvas = document.createElement('canvas');
  const height = width * WORD_BOX;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintWord(ctx, { W: width, H: height, flexes: REST_FLEXES, inner: 1, fill: colour });
  return canvas;
}

const EASING = 'cubic-bezier(0.7, 0, 0.2, 1)';

/**
 * Where the whole word sits, as a 5:1 box like the mirror's, when its letters are placed as
 * the header logo places them (lib/wordmark.js layout). On a phone the bubble shows only the
 * c: the box puts the c on it and the other letters run past it, to fade (`alphas`).
 */
function headerWordBox(mark) {
  const box = mark.getBoundingClientRect();
  const placed = layout({ W: box.width, H: box.height, flexes: REST_FLEXES });
  const width = placed.unit * placed.full;
  return {
    left: box.left + placed.letters[0].x,
    top: box.top + box.height / 2 - (width * WORD_BOX) / 2,
    width,
    height: width * WORD_BOX,
    alphas: placed.letters.map((letter) => letter.alpha),
  };
}

/** Where the mirror page draws its wordmark: 70vw wide, at most 1600px, centred. */
function mirrorWordBox() {
  const width = Math.min(innerWidth * 0.7, 1600);
  const height = width * WORD_BOX;
  return { left: (innerWidth - width) / 2, top: (innerHeight - height) / 2, width, height };
}

/** Hides or shows the word inside the header logo. Its red bubble stays. */
function holdWord(mark, hold) {
  mark?.querySelectorAll(':scope > :not(.sr-only)').forEach((part) => {
    if (hold) part.style.visibility = 'hidden';
    else part.style.removeProperty('visibility');
  });
}

const px = (rect) => ({
  left: `${rect.left}px`,
  top: `${rect.top}px`,
  width: `${rect.width}px`,
  height: `${rect.height}px`,
});

/**
 * The way in: the page fades to white while the header logo grows into the big red
 * logo in the middle of the screen. It lands exactly where the mirror page draws its
 * wordmark, so the two pages meet without a jump.
 * Resolves when it has finished, straight away with reduced motion.
 */
function playEnter() {
  const mark = document.querySelector('.site-header__logo');
  if (!mark || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();

  const from = headerWordBox(mark);
  const to = mirrorWordBox();
  const root = getComputedStyle(document.documentElement);
  const red = root.getPropertyValue('--foreground-color').trim();
  const white = root.getPropertyValue('--background-color').trim();

  const cover = document.createElement('div');
  cover.className = 'mirror-enter';
  cover.setAttribute('aria-hidden', 'true');
  Object.assign(cover.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    background: 'var(--background-color)',
    opacity: '0',
  });

  // Drawn at the size it lands at, then shown small: it stays sharp as it grows. The white
  // copy (the header's colour) fades into the red one on the way.
  const logos = [wordCanvas(to.width, red), wordCanvas(to.width, white)];
  logos.forEach((logo) => {
    logo.classList.add('mirror-enter');
    Object.assign(logo.style, { position: 'fixed', zIndex: '2147483647', margin: '0' }, px(from));
  });

  document.body.append(cover, ...logos);
  holdWord(mark, true);
  cover.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ENTER_MS * 0.6, easing: 'ease', fill: 'forwards' });
  logos[1].animate([{ opacity: 1 }, { opacity: 0 }], { duration: ENTER_MS * 0.5, easing: 'ease', fill: 'forwards' });
  const grows = logos.map((logo) =>
    logo.animate([px(from), px(to)], { duration: ENTER_MS, easing: EASING, fill: 'forwards' }),
  );
  return Promise.all(grows.map((grow) => grow.finished)).catch(() => {});
}

// Set by the mirror page as it closes: its logo, as SVG markup (mirror.js).
const RETURN_KEY = 'crystal-mirror-leave';

/** The white and the logo the way back starts from. Base.astro adds them before first paint. */
function returnLayers(markup) {
  let cover = document.querySelector('[data-mirror-return="cover"]');
  let logo = document.querySelector('[data-mirror-return="logo"]');
  if (cover && logo) return { cover, logo };
  // Back from the browser's memory, the inline script has not run: same layers, made here.
  cover = document.createElement('div');
  cover.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:var(--background-color)';
  logo = document.createElement('div');
  logo.innerHTML = markup;
  Object.assign(logo.style, { position: 'fixed', zIndex: '2147483647', color: 'var(--foreground-color)' }, px(mirrorWordBox()));
  [cover, logo].forEach((layer) => {
    layer.className = 'mirror-enter';
    layer.setAttribute('aria-hidden', 'true');
  });
  document.body.append(cover, logo);
  return { cover, logo };
}

/**
 * The way back, the way in reversed. On the white, the mirror's red logo shrinks into the
 * header logo's place; there a red bubble fades in behind it as it turns white. Only then
 * does the white fade, uncovering the page with its logo already in place: the word never
 * crosses the menu beside the logo.
 */
function playReturn() {
  const markup = read(RETURN_KEY);
  if (!markup) return;
  write(RETURN_KEY, null);
  // Left from the way in, when the browser keeps this page in memory.
  document.querySelectorAll('.mirror-enter:not([data-mirror-return])').forEach((element) => element.remove());
  const mark = document.querySelector('.site-header__logo');
  const finish = () => {
    document.querySelectorAll('.mirror-enter').forEach((element) => element.remove());
    holdWord(mark, false);
  };
  if (!mark || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
    return;
  }

  const { cover, logo } = returnLayers(markup);
  holdWord(mark, true);
  const root = getComputedStyle(document.documentElement);
  const red = root.getPropertyValue('--foreground-color').trim();
  const white = root.getPropertyValue('--background-color').trim();

  // The header logo's bubble, drawn on the white where the real one sits under it.
  const box = mark.getBoundingClientRect();
  const bubble = document.createElement('div');
  bubble.className = 'mirror-enter';
  bubble.setAttribute('aria-hidden', 'true');
  Object.assign(
    bubble.style,
    { position: 'fixed', zIndex: '2147483646', background: getComputedStyle(mark).backgroundColor, opacity: '0' },
    px(box),
  );
  cover.after(bubble);

  const target = headerWordBox(mark);
  logo.animate([px(mirrorWordBox()), px(target)], {
    duration: ENTER_MS,
    easing: EASING,
    fill: 'forwards',
  });
  // As it lands, red on the white turns white on the red bubble. Letters the bubble doesn't
  // show (a phone shows only the c) fade on the way.
  const landing = { duration: ENTER_MS, fill: 'forwards' };
  logo.querySelectorAll('path').forEach((letter, i) => {
    const alpha = target.alphas[i] ?? 1;
    if (alpha < 1) letter.animate([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: alpha }], landing);
  });
  logo.animate([{ color: red }, { color: red, offset: 0.8 }, { color: white }], landing);
  bubble.animate([{ opacity: 0 }, { opacity: 0, offset: 0.8 }, { opacity: 1 }], landing);
  const reveal = cover.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: ENTER_MS * 0.5,
    delay: ENTER_MS,
    easing: 'ease',
    fill: 'forwards',
  });
  // A background tab never runs the animation: a timer finishes it anyway, but never cuts
  // one that is playing.
  const timer = window.setTimeout(() => {
    if (!reveal.currentTime) finish();
  }, ENTER_MS * 1.5 + 400);
  reveal.finished.catch(() => {}).then(() => {
    window.clearTimeout(timer);
    finish();
  });
}

function openMirror() {
  if (opening) return;
  opening = true;
  memory = { count: 0, at: 0 };
  write(COUNT_KEY, null);
  playEnter().then(() => location.assign('/mirror'));
}

// Coming back with the browser's back button can restore this page from memory as it was
// left, still covered: the way back plays from there, or the cover just goes.
addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  opening = false;
  if (read(RETURN_KEY)) {
    playReturn();
    return;
  }
  document.querySelectorAll('.mirror-enter').forEach((element) => element.remove());
  holdWord(document.querySelector('.site-header__logo'), false);
});

playReturn();

let goHome = 0;
// Marks the click this script lets through to the page router once the wait is over. It is
// on the element, not in this module, so it holds even when the dev server has run this
// script twice: a let-through click must never count as a second or third click, or one
// click would open the mirror.
const PASS = 'data-logo-pass';

document.addEventListener(
  'click',
  (event) => {
    const logo = event.target.closest?.('.site-header__logo');
    if (!logo || logo.hasAttribute(PASS)) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    // Capture phase, so this runs before the page router sees the click.
    event.preventDefault();
    event.stopImmediatePropagation();
    const count = countClick();
    window.clearTimeout(goHome);

    if (count >= 3) {
      openMirror();
      return;
    }
    // Home: there is nowhere to go, but the click still closes an open menu, as it does
    // when it leads home from another page.
    if (onHome()) {
      if (count === 1) closeNav();
      return;
    }

    // Wait for a next click. If none comes, go home the usual way.
    goHome = window.setTimeout(() => {
      if (opening || !logo.isConnected) return;
      logo.setAttribute(PASS, '');
      try {
        logo.click();
      } finally {
        logo.removeAttribute(PASS);
      }
    }, DECIDE_MS);
  },
  true,
);
