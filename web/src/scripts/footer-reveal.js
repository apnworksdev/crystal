// Opening the menu shows the footer. On Home, Work, Merch and Awards the page does not
// scroll to the footer, so it waits below the screen and rises on its own until its top
// meets the header (footer.css; this file measures where to stop) — page content stays
// put. On pages that do scroll, the same open scrolls to that stop. Closing lowers the
// rise again, or puts the scroll back. On the archive, header.js has archive.js run its
// own list to the footer instead.

// Same expo-out used by the reels (matches --ease-out).
const easeOut = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

let stopMotion = null;
/** @type {{ kind: 'rise' } | { kind: 'scroll'; el: Element; top: number } | null} */
let raised = null;

/**
 * Where the header's bottom edge rests once the footer is up. On desktop the header is
 * fixed at the middle, so that is where it already is. On a phone it is docked lower and
 * the footer pushes it up until it reaches the middle, so it rests at the middle instead.
 */
export function headerRestBottom(headerTop, headerHeight, viewportHeight) {
  const middleBottom = viewportHeight / 2 + headerHeight / 2;
  return Math.min(headerTop + headerHeight, middleBottom);
}

/** How far the footer rises from the bottom of the screen to meet that edge. */
export function footerRise(headerTop, headerHeight, viewportHeight) {
  return Math.max(0, Math.round(viewportHeight - headerRestBottom(headerTop, headerHeight, viewportHeight)));
}

/** Pages locked so the footer is not reachable by scroll: it rises in CSS without
 *  moving the page content. Scrollable pages use scroll instead. The archive steps
 *  its own list to its end (archive.js), so its footer arrives after the last row. */
function usesFooterRise() {
  if (document.body.dataset.page === 'archive') return false;
  return Boolean(
    document.querySelector('[data-roulette], [data-merch-reel], [data-reel], [data-awards-scroller]'),
  );
}

function footerEl() {
  return document.querySelector('.site-footer');
}

/** True when the footer is laid out and reachable (not display:none on reels / projects). */
export function footerReachable(footer = footerEl()) {
  if (!footer) return false;
  const style = getComputedStyle(footer);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function scrollRoot() {
  return document.scrollingElement;
}

function scrollTopOf(el) {
  if (!el || el === document.documentElement || el === document.body) return window.scrollY;
  return el.scrollTop;
}

function setScrollTop(el, top) {
  if (!el || el === document.documentElement || el === document.body) {
    window.scrollTo(0, top);
    return;
  }
  el.scrollTop = top;
}

function maxScrollTop(el) {
  if (!el || el === document.documentElement || el === document.body) {
    const root = document.scrollingElement || document.documentElement;
    return Math.max(0, root.scrollHeight - window.innerHeight);
  }
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

function growMs() {
  const raw = parseFloat(getComputedStyle(document.body).getPropertyValue('--grow-duration'));
  return Number.isFinite(raw) ? raw * 1000 : 500;
}

/** Tweens a scroll position on the shared expo-out. Returns a cancel function. */
function animateScroll(el, to) {
  const from = scrollTopOf(el);
  const duration = prefersReducedMotion() ? 0 : growMs();
  if (duration <= 0 || Math.abs(to - from) < 1) {
    setScrollTop(el, to);
    return () => {};
  }

  const start = performance.now();
  let frame = 0;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    setScrollTop(el, from + (to - from) * easeOut(t));
    if (t < 1) {
      frame = requestAnimationFrame(tick);
      return;
    }
    frame = 0;
  };
  frame = requestAnimationFrame(tick);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
}

function cancelMotion() {
  stopMotion?.();
  stopMotion = null;
}

/** Brings the footer up to just below the header (CSS rise, or page scroll). */
export function raiseFooter(header) {
  if (!header || raised || document.body.hasAttribute('data-footer-raised')) return;

  if (usesFooterRise()) {
    // The header row only: on a phone the open menu column is positioned outside it.
    const rect = header.getBoundingClientRect();
    const rise = footerRise(rect.top, rect.height, window.innerHeight);
    document.body.style.setProperty('--footer-rise', `${rise}px`);
    document.body.setAttribute('data-footer-raised', '');
    raised = { kind: 'rise' };
    return;
  }

  // Archive steps its own list; header.js handles that before calling here.
  if (document.body.dataset.page === 'archive') return;

  const footer = footerEl();
  if (!footerReachable(footer)) return;

  const root = scrollRoot();
  if (!root) return;

  const rect = header.getBoundingClientRect();
  const rest = headerRestBottom(rect.top, rect.height, window.innerHeight);
  const delta = footer.getBoundingClientRect().top - rest;
  if (delta <= 1) return;

  const from = scrollTopOf(root);
  const to = Math.min(from + delta, maxScrollTop(root));
  if (to - from < 1) return;

  document.body.setAttribute('data-footer-raised', '');
  raised = { kind: 'scroll', el: root, top: from };
  cancelMotion();
  stopMotion = animateScroll(root, to);
}

/** True while a menu open has the footer shown (Home, scroll, or archive). */
export function footerIsRaised() {
  return Boolean(raised || document.body.hasAttribute('data-footer-raised'));
}

/** Marks the footer as raised without moving it here (the archive moves its own list). */
export function markFooterRaised() {
  if (footerIsRaised()) return;
  document.body.setAttribute('data-footer-raised', '');
  raised = { kind: 'rise' };
}

/** Drops raise state without moving anything. Used after a page swap. */
export function clearFooterReveal() {
  cancelMotion();
  raised = null;
  document.body.removeAttribute('data-footer-raised');
  document.body.style.removeProperty('--footer-rise');
}

/** Lowers the footer again, or puts the scroll back where the menu found it. */
export function lowerFooter() {
  const state = raised;
  cancelMotion();
  raised = null;
  document.body.removeAttribute('data-footer-raised');

  if (!state || state.kind === 'rise') return;

  if (state.kind === 'scroll' && state.el?.isConnected) {
    stopMotion = animateScroll(state.el, state.top);
  }
}

/**
 * Rise pages only: where the footer's top stops, below the screen while it is down. Its
 * box is mid-movement while it slides, so it is not measured. Null on every other page.
 */
export function homeFooterTop() {
  if (!usesFooterRise()) return null;
  if (!document.body.hasAttribute('data-footer-raised')) return window.innerHeight;
  const rise = parseFloat(document.body.style.getPropertyValue('--footer-rise'));
  return window.innerHeight - (Number.isFinite(rise) ? rise : 0);
}
