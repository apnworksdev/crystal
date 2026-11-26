// News panel in the header. Opens a few seconds after the intro, once per tab:
// closing it is remembered in sessionStorage, so only a new tab shows it again.
// The header persists across page transitions, so the panel is wired up once.
// Arrows change item; wheel / touch on the pictures scrolls within the item. The
// window size follows the first picture of the current item only.
//
// The same panel sits beside About. If it is already open when About opens, it
// stays put with no motion. If it was closed, it opens and closes with About
// until the visitor closes it on their own.
//
// It never shows on a project page, where the header is the player: it waits, and
// opens once the visitor is back on another page. Its width moves the header, so it
// announces its motion (crystal:menu-motion) for pages that follow the header, such
// as the Work list, which is pushed aside like it is by the menu.

const DELAY = 3000;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let panel = null;
let index = 0;
let timer = 0;
// True when news was opened because About opened while news was closed.
let openedWithAbout = false;
// True when news was due, or showing, while a project page was open.
let waiting = false;

function onProject() {
  return document.body.dataset.page === 'project';
}

/** Lets pages that follow the header (the Work list) move with it. */
function announceMotion() {
  document.dispatchEvent(new CustomEvent('crystal:menu-motion'));
}

const storageKey = () => `news:${panel?.dataset.newsKey ?? ''}`;

function wasClosed() {
  try {
    return Boolean(sessionStorage.getItem(storageKey()));
  } catch {
    return false;
  }
}

function rememberClosed() {
  try {
    sessionStorage.setItem(storageKey(), '1');
  } catch {
    // Storage can be blocked. The panel then comes back on the next full load.
  }
}

/** Sizes the window to the first picture of the shown item. */
function applyRatio(target, itemIndex) {
  const frame = target.querySelector(`.news-panel__image[data-news-item="${itemIndex}"]`);
  const ratio = parseFloat(frame?.dataset.newsRatio || '');
  if (Number.isFinite(ratio) && ratio > 0) {
    target.style.setProperty('--news-ratio', String(ratio));
  }
}

/** Shows item `next` in the news panel. */
function show(target, next) {
  const items = target.querySelectorAll('.news-panel__item-title');
  const count = items.length;
  if (!count) return;
  const current = ((next % count) + count) % count;
  target.dataset.newsIndex = String(current);
  if (target === panel) index = current;
  target.querySelectorAll('[data-news-item]').forEach((element) => {
    element.hidden = Number(element.dataset.newsItem) !== current;
  });
  applyRatio(target, current);
  // Pictures of the new item start at the top; scrolling inside does not resize.
  const photos = target.querySelector(`.news-panel__image[data-news-item="${current}"] [data-news-photos]`);
  if (photos) photos.scrollTop = 0;
  // Phone: the whole pictures area scrolls instead (news.css), so it starts at the top too.
  const area = target.querySelector('.news-panel__images');
  if (area) area.scrollTop = 0;
  // The next item's first picture starts loading before it's asked for.
  const upcoming = target.querySelector(
    `.news-panel__image[data-news-item="${(current + 1) % count}"] img`,
  );
  if (upcoming) upcoming.loading = 'eager';
}

function reveal(animate) {
  const header = panel?.closest('.site-header');
  if (!header || !panel.isConnected) return;
  panel.hidden = false;
  panel.inert = false;
  show(panel, index);
  header.setAttribute('data-news', '');
  if (animate && !reducedMotion.matches) {
    // Starts folded into the header row, then opens.
    header.setAttribute('data-news-closing', '');
    panel.offsetWidth;
    header.removeAttribute('data-news-closing');
  } else {
    header.removeAttribute('data-news-closing');
  }
  announceMotion();
}

function open() {
  if (!panel || wasClosed()) return;
  if (onProject()) {
    waiting = true;
    return;
  }
  openedWithAbout = false;
  reveal(true);
}

function finishClose() {
  const header = panel?.closest('.site-header');
  header?.removeAttribute('data-news');
  header?.removeAttribute('data-news-closing');
  if (panel) {
    panel.hidden = true;
    panel.inert = true;
  }
  openedWithAbout = false;
}

function close() {
  const header = panel?.closest('.site-header');
  if (!header || !panel || panel.hidden) return;
  window.clearTimeout(timer);
  rememberClosed();
  openedWithAbout = false;
  if (reducedMotion.matches) {
    finishClose();
    return;
  }
  header.setAttribute('data-news-closing', '');
  announceMotion();
  // It folds down, then narrows back into the header row. The narrowing ends it.
  let done = false;
  const end = (event) => {
    if (done || (event && (event.target !== panel || event.propertyName !== '--news-open'))) return;
    done = true;
    panel.removeEventListener('transitionend', end);
    // Opened again while it was closing: leave it open.
    if (header.hasAttribute('data-news-closing')) finishClose();
  };
  panel.addEventListener('transitionend', end);
  // Fallback for a background tab, which never runs the transitions.
  const grow = parseFloat(getComputedStyle(header).getPropertyValue('--grow-duration')) * 1000 || 500;
  window.setTimeout(end, grow * 2 + 100);
}

/** Whether the header news panel is showing. */
export function isNewsOpen() {
  return Boolean(panel && !panel.hidden);
}

/**
 * About opened while news was closed: open with About's motion and close with it
 * later. If news is already open, leave it and do not tie it to About.
 */
export function openNewsWithAbout() {
  if (!panel) return;
  window.clearTimeout(timer);
  if (!panel.hidden) {
    openedWithAbout = false;
    return;
  }
  openedWithAbout = true;
  reveal(true);
}

/** About is closing: fold news only if it was opened with About. */
export function closeNewsWithAbout() {
  if (!openedWithAbout || !panel || panel.hidden) {
    openedWithAbout = false;
    return;
  }
  close();
}

/** Closes the panel at once, without its motion (menu on phone, and similar). */
export function hideNewsNow() {
  if (!panel) return;
  window.clearTimeout(timer);
  if (panel.hidden) return;
  rememberClosed();
  finishClose();
}

/** Closes the panel, or stops it from opening, as its close button does. */
export function dismissNews() {
  if (!panel || wasClosed()) return;
  if (panel.hidden) {
    rememberClosed();
    window.clearTimeout(timer);
    return;
  }
  close();
}

function onClick(event) {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('[data-news-close]')) close();
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const step = event.target.closest('[data-news-step]');
  const target = step?.closest('.news-panel');
  if (!target) return;
  show(target, Number(target.dataset.newsIndex || 0) + Number(step.dataset.newsStep));
});

function onKeyDown(event) {
  if (event.key !== 'Escape' || !panel || panel.hidden) return;
  // About owns Escape while it is open; news stays until its own close.
  if (panel.closest('.site-header')?.hasAttribute('data-about')) return;
  close();
}

/**
 * A new page on the same header. A project page puts the panel away at once (it is never
 * shown there, and the page change covers it); the next other page brings it back.
 */
function syncToPage() {
  if (!panel || wasClosed()) return;
  if (onProject()) {
    window.clearTimeout(timer);
    if (!panel.hidden) {
      finishClose();
      waiting = true;
    }
    return;
  }
  if (!waiting) return;
  waiting = false;
  window.clearTimeout(timer);
  // A moment after the page has arrived, so it opens on a settled page.
  timer = window.setTimeout(open, 900);
}

/** Runs after each page setup. The first call on a new header wires it up. */
export function setUpNews() {
  const found = document.querySelector('[data-news-panel]');
  if (found && found === panel) {
    syncToPage();
    return;
  }
  if (!found) return;
  panel = found;
  index = 0;
  openedWithAbout = false;
  waiting = false;
  window.clearTimeout(timer);
  applyRatio(panel, 0);
  if (wasClosed()) return;
  panel.addEventListener('click', onClick);
  timer = window.setTimeout(open, DELAY);
}

document.addEventListener('keydown', onKeyDown);
