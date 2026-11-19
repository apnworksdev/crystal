// First-load intro. The head script decides whether to play, before paint.
// This file only runs the flight: plate, then the rest of the header, then the page.

const FLIGHT_MS = 1300;
const HEADER_MS = 240;
const PAGE_MS = 450;
const LAND_HOLD_MS = 90;
const HEADER_HOLD_MS = 80;
// Same query as the phone blocks in the stylesheets.
const phone = matchMedia('(max-width: 48rem), (max-height: 30rem) and (pointer: coarse)');

let started = false;
let resolveDone;
const done = new Promise((resolve) => {
  resolveDone = resolve;
});
let held = [];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const px = (value) => `${value.toFixed(2)}px`;

function box(element) {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

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

async function flight() {
  const plate = document.querySelector('[data-intro-plate]');
  const logo = document.querySelector('.site-header__logo');
  const plateMark = plate?.querySelector('svg');
  const logoMark = logo?.querySelector('svg');
  if (!plate || !logo || !plateMark || !logoMark) return;

  const fromPlate = box(plate);
  const toPlate = box(logo);
  const fromMark = box(plateMark);
  const toMark = box(logoMark);
  if (fromPlate.width < 2 || toPlate.width < 2 || fromMark.width < 2 || toMark.width < 2) return;

  const timing = { duration: FLIGHT_MS, fill: 'forwards' };
  const plateAnim = plate.animate(
    [
      {
        left: px(fromPlate.left),
        top: px(fromPlate.top),
        width: px(fromPlate.width),
        height: px(fromPlate.height),
        easing: 'linear',
        offset: 0,
      },
      {
        left: px(fromPlate.left),
        top: px(fromPlate.top),
        width: px(fromPlate.width),
        height: px(fromPlate.height),
        easing: 'cubic-bezier(0.7, 0, 0.15, 1)',
        offset: 0.16,
      },
      {
        left: px(toPlate.left),
        top: px(toPlate.top),
        width: px(toPlate.width),
        height: px(toPlate.height),
        offset: 1,
      },
    ],
    timing,
  );
  const markAnim = plateMark.animate(
    [
      { width: px(fromMark.width), height: px(fromMark.height), easing: 'linear', offset: 0 },
      {
        width: px(fromMark.width),
        height: px(fromMark.height),
        easing: 'cubic-bezier(0.7, 0, 0.15, 1)',
        offset: 0.16,
      },
      { width: px(toMark.width), height: px(toMark.height), offset: 1 },
    ],
    timing,
  );

  await Promise.all([plateAnim.finished, markAnim.finished]);

  document.documentElement.classList.add('intro-landed');
  const intro = document.querySelector('.intro');
  if (intro) intro.style.visibility = 'hidden';
  plateAnim.cancel();
  markAnim.cancel();
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

  holdStill();
  await flight();
  await wait(LAND_HOLD_MS);

  // On a phone the plate lands on the whole wordmark, which then shrinks to its c.
  if (phone.matches) {
    document.documentElement.classList.add('intro-collapse');
    await wait(HEADER_MS);
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
    failTimer = setTimeout(() => reject(new Error('intro')), 5000);
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
