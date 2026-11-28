// First-load intro. The head script decides whether to play, before paint.
// This file runs it, as on the studio's own preview: the screen is red with the wordmark
// playing the tool's wave, silently. After HOLD_MS the red box shrinks into the header
// logo over MOVE_MS on a cubic ease-in-out, while the wave fades to nothing, so it lands
// on the still word the header logo draws underneath (no jump on the last frame). Then
// the rest of the header comes in, then the page. A click or a key lands it early.
//
// It all draws into one fixed full-screen canvas, so nothing on the page is resized or
// laid out again while it moves.

import { createMotion, paintWord } from './wordmark.js';

const HOLD_MS = 2600;
const MOVE_MS = 1700;
// How long the wave may take to settle after landing before the canvas goes.
const SETTLE_MS = 500;
const HEADER_MS = 240;
const PAGE_MS = 450;
const LAND_HOLD_MS = 90;
const HEADER_HOLD_MS = 80;
// The word fills half the screen's width at the start, and the share of the logo's bubble
// the header draws it at (lib/wordmark.js) at the end.
const INNER_START = 0.5;
const INNER_END = 81.37 / 95.37;
// Same query as the phone blocks in the stylesheets.
const phone = matchMedia('(max-width: 48rem), (max-height: 30rem) and (pointer: coarse)');

let started = false;
let resolveDone;
const done = new Promise((resolve) => {
  resolveDone = resolve;
});
let held = [];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

function finish() {
  const root = document.documentElement;
  window.__introRelease?.();
  root.classList.remove('intro-play', 'intro-landed', 'intro-collapse', 'intro-header', 'intro-page');
  root.dataset.introState = 'done';
  root.removeAttribute('aria-busy');
  document.querySelector('.intro')?.remove();
  document.querySelectorAll('[data-intro-inert]').forEach((element) => {
    element.inert = false;
    element.removeAttribute('data-intro-inert');
  });
  held.forEach((animation) => animation.cancel());
  held = [];
}

function holdStill() {
  document.querySelectorAll('.site-header, main, .site-footer').forEach((element) => {
    element.inert = true;
    element.setAttribute('data-intro-inert', '');
  });
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
}

/** The red box at e (0 full screen, 1 the logo), as the studio's preview shapes it. */
function pose(e, logo, W, H) {
  // Width shrinks evenly in log space; the box keeps the screen's shape until it is small.
  const w = W * (logo.width / W) ** e;
  const h180 = (180 * H) / W;
  const h = w >= 180 ? (w * H) / W : logo.height + (h180 - logo.height) * ((w - logo.width) / (180 - logo.width));
  // It reaches the logo's edges as soon as it leaves full screen.
  const k = Math.min(1, (W - w) / 40);
  const left = logo.left * k;
  const mid = logo.top + logo.height / 2;
  // As on the studio's preview: a logo docked at the bottom (a phone) keeps the box pinned
  // to that corner, one docked at the top to the top corner, and a logo in the middle row
  // (desktop) keeps the box centred on it. So the box never leaves the screen.
  let top;
  if (mid > (H * 2) / 3) top = H - (H - logo.top - logo.height) * k - h;
  else if (mid < H / 3) top = logo.top * k;
  else top = mid - h / 2;
  return { left, top, width: w, height: h };
}

async function flight(intro) {
  const canvas = intro.querySelector('[data-intro-canvas]');
  const logo = document.querySelector('.site-header__logo');
  if (!canvas || !logo) return;
  // Measured again when the box starts to shrink, in case the page moved during the hold.
  let target = logo.getBoundingClientRect();
  if (target.width < 2) return;

  const ctx = canvas.getContext('2d');
  const root = getComputedStyle(document.documentElement);
  const red = root.getPropertyValue('--foreground-color').trim() || '#ff0338';
  const white = root.getPropertyValue('--background-color').trim() || '#f7f7f7';
  const motion = createMotion();
  let W = 0;
  let H = 0;
  const size = () => {
    const dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  window.addEventListener('resize', size);

  let e = 0;
  let still = false;
  const paint = (now) => {
    const box = pose(e, target, W, H);
    // Landed: the wave is at zero, so the word only has to settle, and can say when it has.
    const frame = motion.step(now / 1000, e >= 1 ? { mode: 'rest' } : { mode: 'wave', wave: 1 - e });
    still = e >= 1 && frame.still;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = red;
    ctx.fillRect(box.left, box.top, box.width, box.height);
    paintWord(ctx, {
      x: box.left,
      y: box.top,
      W: box.width,
      H: box.height,
      flexes: frame.flexes,
      inner: INNER_START + (INNER_END * ((target.height * 4) / target.width) - INNER_START) * e,
      fill: white,
    });
  };

  // A background tab never runs animation frames: the timers below still move it on.
  let raf = 0;
  const loop = (now) => {
    paint(now);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  intro.setAttribute('data-intro-drawn', '');

  // Hold, unless a click or a key lands it early.
  await new Promise((resolve) => {
    const early = () => {
      clearTimeout(timer);
      intro.removeEventListener('pointerdown', early);
      window.removeEventListener('keydown', early, true);
      resolve();
    };
    const timer = setTimeout(early, HOLD_MS);
    intro.addEventListener('pointerdown', early);
    window.addEventListener('keydown', early, true);
  });

  const landing = logo.getBoundingClientRect();
  if (landing.width >= 2) target = landing;
  const t0 = performance.now();
  await new Promise((resolve) => {
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / MOVE_MS);
      e = easeInOut(p);
      if (p >= 1) resolve();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(resolve, MOVE_MS + 200);
  });
  e = 1;

  // The header logo draws the same still word underneath, so it can show at once.
  document.documentElement.classList.add('intro-landed');
  const settleBy = performance.now() + SETTLE_MS;
  while (!still && performance.now() < settleBy) await wait(16);
  cancelAnimationFrame(raf);
  window.removeEventListener('resize', size);
  intro.style.visibility = 'hidden';
}

function onProjectPage() {
  return document.body.dataset.page === 'project';
}

function fade(selector, duration, easing) {
  const animations = [...document.querySelectorAll(selector)].map((element) =>
    element.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing, fill: 'forwards' }),
  );
  held.push(...animations);
  return Promise.all(animations.map((animation) => animation.finished));
}

async function sequence() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const intro = document.querySelector('[data-intro]');
  if (!intro) return;

  holdStill();
  await flight(intro);
  await wait(LAND_HOLD_MS);

  // On a phone the box lands on the whole wordmark, which then folds to its c.
  if (phone.matches) {
    document.documentElement.classList.add('intro-collapse');
    // The collapse runs on --grow-duration (intro.css).
    const grow = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--grow-duration')) * 1000;
    await wait(Number.isFinite(grow) ? grow : 500);
  }

  // On a project the header is already the player, so the nav stays hidden.
  if (!onProjectPage()) {
    document.documentElement.classList.add('intro-header');
    await fade('.site-header__context, .site-header__toggle', HEADER_MS, 'linear');
    await wait(HEADER_HOLD_MS);
  }

  document.documentElement.classList.add('intro-page');
  await fade('main, .site-footer', PAGE_MS, 'cubic-bezier(0.2, 0.8, 0.2, 1)');
}

/** Resolves when the intro has finished, or immediately when it is not playing. */
export function whenIntroDone() {
  return done;
}

/** Starts the intro after the page has laid out the header it needs to land on. */
export function startIntro() {
  if (started) return done;
  started = true;

  if (!document.documentElement.classList.contains('intro-play')) {
    document.querySelector('.intro')?.remove();
    resolveDone();
    return done;
  }

  let failTimer;
  const failed = new Promise((_, reject) => {
    failTimer = setTimeout(() => reject(new Error('intro')), HOLD_MS + MOVE_MS + 4000);
  });

  Promise.race([sequence(), failed])
    .catch(() => {})
    .finally(() => {
      clearTimeout(failTimer);
      finish();
      resolveDone();
    });

  return done;
}
