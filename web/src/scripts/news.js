// News panel in the header. Opens a few seconds after the intro, once per tab:
// closing it is remembered in sessionStorage, so only a new tab shows it again.
// The header persists across page transitions, so the panel is wired up once.

const DELAY = 3000;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let panel = null;
let index = 0;
let timer = 0;

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

function show(next) {
  const items = panel.querySelectorAll('.news-panel__item-title');
  const count = items.length;
  if (!count) return;
  index = ((next % count) + count) % count;
  panel.querySelectorAll('[data-news-item]').forEach((element) => {
    element.hidden = Number(element.dataset.newsItem) !== index;
  });
  // The next picture starts loading before it's asked for.
  const upcoming = panel.querySelector(`.news-panel__image[data-news-item="${(index + 1) % count}"] img`);
  if (upcoming) upcoming.loading = 'eager';
}

function open() {
  const header = panel?.closest('.site-header');
  if (!header || !panel.isConnected || wasClosed()) return;
  panel.hidden = false;
  panel.inert = false;
  show(index);
  header.setAttribute('data-news', '');
  if (!reducedMotion.matches) {
    // Starts folded into the header row, then opens.
    header.setAttribute('data-news-closing', '');
    panel.offsetWidth;
    header.removeAttribute('data-news-closing');
  }
}

function close() {
  const header = panel?.closest('.site-header');
  if (!header) return;
  window.clearTimeout(timer);
  rememberClosed();
  const finish = () => {
    header.removeAttribute('data-news');
    header.removeAttribute('data-news-closing');
    panel.hidden = true;
    panel.inert = true;
  };
  if (reducedMotion.matches || panel.hidden) {
    finish();
    return;
  }
  header.setAttribute('data-news-closing', '');
  const ms = parseFloat(getComputedStyle(header).getPropertyValue('--transition-duration')) * 1000;
  window.setTimeout(finish, Number.isFinite(ms) ? ms : 180);
}

/** Closes the panel, or stops it from opening, as its close button does. */
export function dismissNews() {
  if (!panel || wasClosed()) return;
  close();
}

function onClick(event) {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('[data-news-close]')) {
    close();
    return;
  }
  const step = event.target.closest('[data-news-step]');
  if (step) show(index + Number(step.dataset.newsStep));
}

function onKeyDown(event) {
  if (event.key !== 'Escape' || !panel || panel.hidden) return;
  if (panel.closest('.site-header')?.hasAttribute('data-about')) return;
  close();
}

/** Runs after each page setup. Only the first call on a new header does anything. */
export function setUpNews() {
  const found = document.querySelector('[data-news-panel]');
  if (!found || found === panel) return;
  panel = found;
  index = 0;
  window.clearTimeout(timer);
  if (wasClosed()) return;
  panel.addEventListener('click', onClick);
  timer = window.setTimeout(open, DELAY);
}

document.addEventListener('keydown', onKeyDown);
