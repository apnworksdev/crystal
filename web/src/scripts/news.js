// News panel in the header. It opens only with About, beside it, as on the studio's
// preview, and has its own close: closing News leaves About open. Closing About folds
// News away with it. Nothing opens it on its own.
// The header persists across page transitions, so the panel is wired up once.
// Arrows change item; wheel / touch on the pictures scrolls within the item. The
// window size follows the first picture of the current item only.
//
// It never shows on a project page, where the header is the player. Its width moves the
// header, so it announces its motion (crystal:menu-motion) for pages that follow the
// header, such as the Work list, which is pushed aside like it is by the menu.
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let panel = null;
let index = 0;
// True while News is open because About opened it.
let openedWithAbout = false;

function onProject() {
  return document.body.dataset.page === 'project';
}

/** Lets pages that follow the header (the Work list) move with it. */
function announceMotion() {
  document.dispatchEvent(new CustomEvent('crystal:menu-motion'));
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

function finishClose() {
  const header = panel?.closest('.site-header');
  header?.removeAttribute('data-news');
  header?.removeAttribute('data-news-closing');
  header?.removeAttribute('data-news-folding');
  if (panel) {
    panel.hidden = true;
    panel.inert = true;
  }
  openedWithAbout = false;
}

function close() {
  const header = panel?.closest('.site-header');
  if (!header || !panel || panel.hidden) return;
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

/**
 * Desktop About closing: News folds up and down with it but keeps its width, so the two
 * become one strip. header.js then puts it away (hideNewsNow) as the strip turns back into
 * the menu row.
 */
export function closeNewsFolding() {
  const header = panel?.closest('.site-header');
  if (!header || !panel || panel.hidden) return;
  // Already closing on its own x: let that finish rather than widening it back out.
  if (header.hasAttribute('data-news-closing')) return;
  openedWithAbout = false;
  header.setAttribute('data-news-folding', '');
  header.setAttribute('data-news-closing', '');
  announceMotion();
}

function isFolding() {
  return Boolean(panel?.closest('.site-header')?.hasAttribute('data-news-folding'));
}

/** Whether the header news panel is showing. */
export function isNewsOpen() {
  return Boolean(panel && !panel.hidden);
}

/** About opened: News opens beside it, with About's motion, and closes with it later. */
export function openNewsWithAbout() {
  if (!panel || onProject()) return;
  // Reopened while a fold was still in progress: start from closed.
  if (isFolding()) finishClose();
  openedWithAbout = true;
  if (!panel.hidden) return;
  reveal(true);
}

/** About is closing: fold news only if it was opened with About. */
export function closeNewsWithAbout() {
  // Folded with About's desktop close but not yet handed back (a page link, or About
  // dismissed mid-fold): put it away now, so it never stays behind as a folded strip.
  if (isFolding()) {
    hideNewsNow();
    return;
  }
  if (!openedWithAbout || !panel || panel.hidden) {
    openedWithAbout = false;
    return;
  }
  close();
}

/** Closes the panel at once, without its motion (menu on phone, and similar). */
export function hideNewsNow() {
  if (!panel || panel.hidden) return;
  finishClose();
}

/** Closes the panel, as its close button does. */
export function dismissNews() {
  if (!panel || panel.hidden) return;
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

/** A project page puts the panel away at once: it is never shown there. */
function syncToPage() {
  if (panel && onProject() && !panel.hidden) finishClose();
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
  applyRatio(panel, 0);
  panel.addEventListener('click', onClick);
}

document.addEventListener('keydown', onKeyDown);
