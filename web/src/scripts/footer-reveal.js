// Opening the menu shows the footer on desktop (phones skip it: header.js). On every page
// the footer is fixed to the bottom of the screen: it waits just below it and rises by its
// own height while the menu is open (footer.css), so the page under it never scrolls or
// moves. Closing lowers it again.

/** Pages locked so the footer is not reachable by scroll (footer.css). On a phone their
 *  footer waits below the screen. */
function usesFooterRise() {
  if (document.body.dataset.page === 'archive') return false;
  return Boolean(
    document.querySelector('[data-roulette], [data-merch-reel], [data-reel], [data-awards-scroller]'),
  );
}

function footerEl() {
  return document.querySelector('.site-footer');
}

/** True when the page has a footer at all (projects hide theirs). */
export function footerReachable(footer = footerEl()) {
  if (!footer) return false;
  return getComputedStyle(footer).display !== 'none';
}

/** Brings the footer up to the bottom of the screen. */
export function raiseFooter() {
  if (!footerReachable()) return;
  document.body.setAttribute('data-footer-raised', '');
}

/** True while a menu open has the footer shown. */
export function footerIsRaised() {
  return document.body.hasAttribute('data-footer-raised');
}

/** Drops the raise without waiting for its motion. Used after a page swap. */
export function clearFooterReveal() {
  document.body.removeAttribute('data-footer-raised');
}

/** Lowers the footer below the screen again. */
export function lowerFooter() {
  document.body.removeAttribute('data-footer-raised');
}

/**
 * Locked pages only: where the footer's top is, just below the screen (phones never raise
 * it). Null on every other page, where it sits at the end of the page.
 */
export function homeFooterTop() {
  return usesFooterRise() ? window.innerHeight : null;
}
