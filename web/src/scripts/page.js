// Runs on the first load and again after each page transition.

import { setUpArchive } from './archive.js';
import { dismissAbout, leaveAbout, prepareSectionLeave, rememberHeaderRow, setUpHeader } from './header.js';
import { startIntro, whenIntroDone } from './intro.js';
import { setUpNews } from './news.js';
import { setUpHeaderScroll } from './header-scroll.js';
import { navigate } from 'astro:transitions/client';
import {
  coverBusy,
  enterPending,
  enterSource,
  leavePending,
  playLeaveCover,
  projectSlug,
  startEnterCover,
} from './cover.js';
import {
  clearPlayerFade,
  fadePlayerOut,
  rememberHeaderBox,
  rememberHeaderHome,
  rememberSiteClick,
  setUpProject,
  slideHeaderDown,
} from './project.js';
import { leaveProduct, setUpProduct } from './product.js';
import { handoffLeave } from './handoff.js';
import { primeLogoAudio } from './logo-motion.js';
import './mirror-trigger.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let observer;

/** Looping videos only download and play while they're on screen. */
function setUpVideos() {
  observer?.disconnect();
  if (reducedMotion.matches) return;

  observer = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) target.play().catch(() => {});
        else target.pause();
      }
    },
    { rootMargin: '200px' },
  );
  document.querySelectorAll('video[data-autoplay]').forEach((video) => observer.observe(video));
}

/** Code for one page: downloaded when its element is on the page, then reused. */
function pageModule(selector, load, setUp) {
  let module = null;
  let loading = null;
  const get = () =>
    (loading ??= load().then(
      (loaded) => (module = loaded),
      (error) => {
        loading = null;
        throw error;
      },
    ));
  return {
    run() {
      if (module) {
        setUp(module);
        return null;
      }
      return document.querySelector(selector) ? get().then(setUp) : null;
    },
    warm() {
      get().catch(() => {});
    },
  };
}

const pageModules = [
  pageModule('[data-roulette]', () => import('./roulette.js'), (module) => module.setUpRoulette()),
  pageModule(
    '[data-reel], [data-work-list]',
    () => Promise.all([import('./reel.js'), import('./work.js')]),
    ([reel, work]) => {
      // Work sets the view and the header inset first so the reel can measure its height.
      work.setUpWork();
      reel.setUpReel();
    },
  ),
  pageModule('[data-merch-reel]', () => import('./merch-reel.js'), (module) => module.setUpMerchReel()),
  pageModule('[data-product-strip]', () => import('./product-strip.js'), (module) => module.setUpProductStrip()),
  pageModule('[data-awards-scroller]', () => import('./awards.js'), (module) => module.setUpAwards()),
];

/** Fetches the other pages' code once the browser is idle, so they open without waiting. */
function warmPageModules() {
  const warm = () => pageModules.forEach((module) => module.warm());
  if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 4000 });
  else window.setTimeout(warm, 2000);
}

// The content fades out before a section change and back in after it.
const FADE_OUT = 160;
// The new page settles on the shared expo-out (--ease-out), a little longer than a box grows.
const FADE_IN = 600;
const SETTLE_EASING = 'cubic-bezier(0.19, 1, 0.22, 1)';
let contentOut = null;
let fadeIn = false;
let headerLeft = false;

function content() {
  return document.querySelector('.site-scroll');
}

function fadeContentOut() {
  if (contentOut) return contentOut;
  // Merch and a product hand over to each other with their own motion (handoff.js).
  const own = handoffLeave();
  if (own) return (contentOut = own);
  const element = content();
  if (!element || reducedMotion.matches) return Promise.resolve();
  const animation = element.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: FADE_OUT,
    easing: 'ease-in',
    fill: 'forwards',
  });
  contentOut = Promise.race([
    animation.finished.catch(() => {}),
    new Promise((resolve) => window.setTimeout(resolve, 240)),
  ]);
  return contentOut;
}

function holdContent() {
  const element = content();
  if (element) element.style.opacity = '0';
}

function revealContent() {
  const element = content();
  if (!element) return;
  element.style.opacity = '';
  if (!reducedMotion.matches) {
    element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_IN, easing: SETTLE_EASING });
  }
}

let introBooted = false;
let pageGeneration = 0;

function finishPage() {
  setUpProduct();
  setUpProject();
  setUpArchive();
  playLeaveCover();
  if (fadeIn) {
    fadeIn = false;
    revealContent();
  }
  // The home title has to be in the header before the intro reveals it.
  if (!introBooted) {
    introBooted = true;
    startIntro();
    whenIntroDone().then(warmPageModules);
  }
  whenIntroDone().then(() => setUpNews());
}

function setUpPage() {
  const generation = ++pageGeneration;
  if (!document.documentElement.classList.contains('intro-play')) {
    document.querySelector('.intro')?.remove();
  }
  setUpVideos();
  setUpHeader();
  setUpHeaderScroll();
  if (fadeIn) holdContent();
  const pending = pageModules.map((module) => module.run()).filter(Boolean);
  if (!pending.length) {
    finishPage();
    return;
  }
  // Rare: only before this page's code has downloaded. The rest waits so the order stays the same.
  Promise.all(pending)
    .catch(() => {})
    .then(() => {
      if (generation === pageGeneration) finishPage();
    });
}

/** Loads Vimeo's player only when someone clicks play, to keep pages light. */
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-vimeo-player]');
  if (!button) return;

  const frame = document.createElement('iframe');
  frame.className = 'media__player';
  frame.src = button.dataset.vimeoPlayer;
  frame.title = 'Video player';
  frame.allow = 'autoplay; fullscreen; picture-in-picture';
  frame.allowFullscreen = true;
  button.replaceWith(frame);
  frame.focus();
});

function plainClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest('a[href]');
  if (!link) return;
  let url;
  try {
    url = new URL(link.href, location.href);
  } catch {
    return;
  }
  if (url.origin !== location.origin) return;
  rememberSiteClick(location.pathname);

  if (!plainClick(event) || (link.target && link.target !== '_self')) return;
  if (url.pathname === location.pathname && url.search === location.search) {
    // Same page, such as the logo on Home: About still folds away.
    leaveAbout();
    return;
  }

  const href = `${url.pathname}${url.search}${url.hash}`;
  const routed = Boolean(document.querySelector('[name="astro-view-transitions-enabled"]'));
  const slug = projectSlug(url.pathname);

  if (slug) {
    // In the click, so a file video opened from here can be measured as well as heard.
    primeLogoAudio();
    dismissAbout();
    if (reducedMotion.matches) return;
    if (coverBusy()) {
      event.preventDefault();
      return;
    }
    const source = enterSource(link);
    if (!source) return;

    event.preventDefault();
    const motion = [startEnterCover(source)];
    if (routed) rememberHeaderBox();
    else {
      rememberHeaderHome();
      motion.push(slideHeaderDown());
    }
    Promise.all(motion).then(() => {
      if (routed) navigate(href);
      else location.assign(href);
    });
    return;
  }

  if (reducedMotion.matches) {
    dismissAbout();
    return;
  }
  event.preventDefault();
  // About folds away first, then the header changes section as usual.
  const header = leaveAbout()
    .then(() => leaveProduct(url.pathname))
    .then(() => prepareSectionLeave(url.pathname));
  Promise.all([header, fadeContentOut(), fadePlayerOut()]).then(([go]) => {
    if (!go) return;
    headerLeft = true;
    if (routed) navigate(href);
    else location.assign(href);
  });
}, true);

// Covers every routed page change, including the browser's back and forward buttons.
document.addEventListener('astro:before-preparation', (event) => {
  const cover = enterPending() || leavePending() || coverBusy();
  const clicked = headerLeft;
  headerLeft = false;
  fadeIn = !cover && !reducedMotion.matches && !handoffLeave();
  if (cover) return;
  const load = event.loader;
  // Back and forward skip the click handler, so the header plays its leave motion here.
  const header = clicked ? Promise.resolve() : leaveProduct(event.to.pathname).then(() =>
        prepareSectionLeave(event.to.pathname, event.from.pathname),
      );
  event.loader = async () => {
    await Promise.all([load(), header, fadeContentOut(), fadePlayerOut()]);
  };
});

document.addEventListener('astro:before-swap', () => {
  contentOut = null;
  clearPlayerFade();
  rememberHeaderBox();
  rememberHeaderRow();
  // The header is persisted, so is-arriving has to be on it before the project styles land.
  try {
    if (sessionStorage.getItem('crystal-cover-enter') === '1') {
      document.querySelector('.site-header')?.classList.add('is-arriving');
    }
  } catch {
    // The player may flash once. The page still opens.
  }
});

setUpPage();
document.addEventListener('astro:after-swap', setUpPage);

// A page restored from the back/forward cache (Safari keeps one for every page) comes back
// exactly as it was left: under a full-screen cover, faded out, or with the header mid-move.
// Clear all of that so it never reopens blank.
addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  document.querySelectorAll('.project-cover').forEach((layer) => layer.remove());
  const element = content();
  element?.getAnimations().forEach((animation) => animation.cancel());
  if (element) element.style.opacity = '';
  contentOut = null;
  fadeIn = false;
  const header = document.querySelector('.site-header');
  header?.classList.remove('is-leaving', 'is-arriving');
  header?.getAnimations().forEach((animation) => animation.cancel());
  clearPlayerFade();
  try {
    ['crystal-cover-enter', 'crystal-cover-leave', 'crystal-cover-origin'].forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Nothing held over, then.
  }
});
