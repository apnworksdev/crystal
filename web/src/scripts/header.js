// Open and closed state for the site header. Listeners stay on document so they
// survive page transitions. setUpHeader runs again after each swap.

import { collapseArchive, reopenArchiveBar } from './archive.js';
import { closeNewsWithAbout, dismissNews, openNewsWithAbout } from './news.js';
import { clearFooterReveal, footerIsRaised, homeFooterTop, lowerFooter, raiseFooter } from './footer-reveal.js';
import { pinProductMorph, productMenuClosed, productMenuOpening } from './product.js';
// Dragging the bottom edge of the About, Team and News windows (wires itself up once).
import './box-resize.js';

let navOpen = false;
let aboutOpen = false;
let closeTimer = 0;
let titleTimer = 0;
let menuIdleTimer = 0;
// Phone only: the column folds itself away after a while. On desktop the menu stays open.
const MENU_IDLE_MS = 3000;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
// Same query as the phone blocks in the stylesheets.
const phone = matchMedia('(max-width: 48rem), (max-height: 30rem) and (pointer: coarse)');
// Pages whose phone header is docked at the bottom. Same list as header.css.
const DOCKED_BOTTOM =
  ":is(:has([data-roulette]), :has([data-merch-reel]), [data-page='product'], :not([data-work-view='list']):has([data-reel]))";
const SECTION_MS = 180;

const NAV = [
  ['Work', '/work'],
  ['Awards', '/awards'],
  ['Archive', '/archive'],
  ['Merch', '/merch'],
];
const NAV_HREFS = NAV.map(([, href]) => href);

function navLinks(header) {
  return header.querySelectorAll('.site-header__links .site-header__link');
}

/** Closed, the section links are out of reach. Only the links: List, Stack and Buy sit in
    the same list and stay usable while the menu is closed. */
function setLinksInert(header, inert) {
  header.querySelector('.site-header__links')?.removeAttribute('inert');
  navLinks(header).forEach((link) => {
    link.inert = inert;
  });
}

function sectionHref(pathname) {
  return NAV_HREFS.find((href) => pathname === href || pathname.startsWith(`${href}/`)) || '';
}

function clearLinkMotion(link) {
  if (!link) return;
  link.getAnimations?.().forEach((animation) => {
    if (typeof CSSTransition !== 'undefined' && animation instanceof CSSTransition) return;
    animation.cancel();
  });
  link.style.opacity = '';
  link.style.width = '';
  link.style.paddingInline = '';
  link.style.color = '';
}

/** Marks the active page on the real nav links. Nothing is copied into context. */
function syncCurrentSection(header, currentHref) {
  const path = location.pathname;
  let active = null;

  navLinks(header).forEach((link) => {
    const href = link.getAttribute('href');
    const isCurrent = currentHref === undefined
      ? path === href || path.startsWith(`${href}/`)
      : href === currentHref;
    if (isCurrent) {
      active = link;
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });

  navLinks(header).forEach(clearLinkMotion);

  if (active) setHeaderProject(null);
  alignWorkViews(header);
}

function measureBubbles(header) {
  const nav = header.querySelector('.site-header__nav');
  const previousNav = nav.style.width;
  nav.style.width = 'max-content';
  navLinks(header).forEach((link) => {
    const previous = link.style.width;
    link.style.width = 'max-content';
    link.style.paddingInline = 'var(--gap)';
    link.style.setProperty('--full', `${link.getBoundingClientRect().width}px`);
    link.style.width = previous;
    link.style.paddingInline = '';
  });
  nav.style.width = previousNav;
}

function menuDrops() {
  // Desktop menus open sideways and push the page. Phone menus are a column (CSS).
  // Kept as a function so call sites stay readable; always false for now.
  return false;
}

function listMenu(header) {
  if (!menuDrops()) return null;
  return header.querySelector('.site-header__nav');
}

function bubbleTargets(header) {
  const targets = [...navLinks(header)];
  const menu = listMenu(header);
  if (menu) targets.push(menu);
  return targets;
}

function measureListNav(header) {
  const menu = listMenu(header);
  if (!menu) return;
  const extras = [...menu.querySelectorAll('.site-header__link:not([aria-current="page"])')];
  if (!extras.length) return;
  const top = menu.getBoundingClientRect().bottom;
  const bottom = Math.max(...extras.map((link) => link.getBoundingClientRect().bottom));
  menu.style.setProperty('--list-nav-drop', `${Math.ceil(bottom - top)}px`);
}

function alignWorkViews(header) {
  const nav = header.querySelector('.site-header__nav');
  nav?.style.removeProperty('--work-views-left');
  nav?.style.removeProperty('--work-views-width');
}

function alignListNav(header) {
  if (document.body.dataset.workView !== 'list') return;
  alignWorkViews(header);
}

// Phone: List and Stack sit where the column opens. They fade out in place instead of
// jumping with the column and vanishing, and fade back once it has closed.
let viewsFade = null;
// A fade on the expo-out was three quarters done in its first frame, so on a phone it read
// as a cut. Fades use this even curve instead (--ease-fold), so they are seen to happen.
const FADE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const FADE_OUT_MS = 300;
const FADE_IN_MS = 400;

function endViewsFade() {
  if (!viewsFade) return;
  window.clearTimeout(viewsFade.timer);
  viewsFade.header.removeAttribute('data-views-fading');
  viewsFade.views.style.translate = '';
  viewsFade.animation.cancel();
  viewsFade = null;
}

/** Returns a step to run once the menu has opened, or nothing when there is nothing to fade. */
function fadeViewsOut(header) {
  endViewsFade();
  const views = header.querySelector('[data-work-views]');
  if (!phone.matches || reducedMotion.matches || !views || views.hidden) return null;
  const box = views.getBoundingClientRect();
  if (box.width < 1) return null;
  return () => {
    header.setAttribute('data-views-fading', '');
    const now = views.getBoundingClientRect();
    views.style.translate = `${box.left - now.left}px ${box.top - now.top}px`;
    const animation = views.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_OUT_MS, easing: FADE_EASING, fill: 'forwards' });
    viewsFade = { header, views, animation, timer: window.setTimeout(endViewsFade, FADE_OUT_MS + 20) };
  };
}

function fadeViewsIn(header) {
  endViewsFade();
  const views = header.querySelector('[data-work-views]');
  if (!phone.matches || reducedMotion.matches || !views || views.hidden) return;
  if (views.getAnimations().length) return;
  views.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_IN_MS, easing: FADE_EASING });
}

/** `fromAbout`: the menu comes back as About closes, so the product title and price were
 *  never showing and must not fade out (productMenuOpening would show them first). */
function applyNav(open, moveFocus, currentHref, { fromAbout = false } = {}) {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const nav = header.querySelector('.site-header__nav');
  const toggle = header.querySelector('.site-header__toggle');
  const wasSettled = header.classList.contains('is-settled');

  window.clearTimeout(closeTimer);
  navOpen = open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');

  syncCurrentSection(header, currentHref);
  alignListNav(header);

  if (open) {
    // On a phone the menu column would cover the news, so opening it closes the news.
    if (phone.matches) dismissNews();
    // Idle close starts once the menu has settled (transitionend), not mid-open.
    clearMenuIdle();
    // Work list follows the growing menu so the gap stays one pixel.
    document.dispatchEvent(new CustomEvent('crystal:menu-motion'));
    measureBubbles(header);
    header.removeAttribute('data-closing');
    // Measured while the title is still shown, then kept over the Merch link as it shrinks.
    if (!fromAbout) productMenuOpening(header);
    const fadeViews = fadeViewsOut(header);
    header.setAttribute('data-open', '');
    raiseMenuFooter();
    updateFooterPush();
    pinProductMorph();
    fadeViews?.();
    setLinksInert(header, false);
    // The x stays beside the menu, so it stays clickable to close.
    toggle.removeAttribute('inert');
    if (moveFocus) {
      const focusTarget = menuDrops()
        ? nav.querySelector('a:not([aria-current="page"])')
        : nav.querySelector('a');
      focusTarget?.focus();
    }
    if (wasSettled) return;

    header.classList.remove('is-settled');
    measureListNav(header);
    const links = bubbleTargets(header);
    // Opened again while it was still closing: the close left its own --bubble values,
    // so pin the current size, then let the stylesheet grow every bubble to 1. Reversing
    // --bubble from the stylesheet gets stuck in this browser. From fully closed there is
    // nothing to pin, and pinning would switch off the labels' and gaps' transitions too.
    if (!links.some((link) => link.style.getPropertyValue('--bubble'))) return;
    const currents = links.map(
      (link) => getComputedStyle(link).getPropertyValue('--bubble').trim() || '0',
    );
    links.forEach((link, index) => {
      link.getAnimations().forEach((animation) => {
        if (animation.transitionProperty === '--bubble') animation.cancel();
      });
      link.style.transition = 'none';
      link.style.setProperty('--bubble', currents[index]);
    });
    header.offsetWidth;
    links.forEach((link) => {
      link.style.transition = '';
      link.style.removeProperty('--bubble');
    });
    return;
  }

  toggle.removeAttribute('inert');
  setLinksInert(header, true);
  if (moveFocus) toggle.focus();
  clearMenuIdle();
  document.dispatchEvent(new CustomEvent('crystal:menu-motion'));
  // A menu link leaves the page with the footer still up, so only a plain close lowers it.
  if (currentHref === undefined) {
    lowerMenuFooter();
    updateFooterPush();
  }

  const close = () => {
    if (navOpen || !header.isConnected) return;
    const links = bubbleTargets(header);
    const currents = links.map(
      (link) => getComputedStyle(link).getPropertyValue('--bubble').trim() || '0',
    );
    // Pin before data-closing. Otherwise the stylesheet drops --bubble to 0
    // and that reverse transition sticks at the first frame. Transitions are back on
    // before data-closing, so the labels and the gaps fade and shrink with the boxes.
    links.forEach((link, index) => {
      link.getAnimations().forEach((animation) => {
        if (animation.transitionProperty === '--bubble') animation.cancel();
      });
      link.style.transition = 'none';
      link.style.setProperty('--bubble', currents[index]);
    });
    header.offsetWidth;
    links.forEach((link) => {
      link.style.transition = '';
    });
    header.offsetWidth;
    header.setAttribute('data-closing', '');
    links.forEach((link) => {
      link.style.setProperty('--bubble', '0');
    });
    if (currents.every((current) => parseFloat(current) === 0)) {
      links.forEach((link) => link.style.removeProperty('--bubble'));
      header.removeAttribute('data-open');
      header.removeAttribute('data-closing');
      productMenuClosed();
      fadeViewsIn(header);
    }
  };

  header.classList.remove('is-settled');
  // Each label fades as its own box folds, so the fold starts with the x at once.
  close();
}

/** Closes the menu. The project title bubble stays put. */
export function closeNav() {
  if (navOpen) applyNav(false, false);
}

function aboutPanel(header) {
  return header?.querySelector('[data-about-panel]');
}

let aboutMotion = 0;
let endAboutClose = null;

function clearAboutMotion() {
  window.clearTimeout(aboutMotion);
  aboutMotion = 0;
  const panel = aboutPanel(document.querySelector('.site-header'));
  if (endAboutClose && panel) panel.removeEventListener('transitionend', endAboutClose);
  endAboutClose = null;
}

function hideAbout() {
  clearAboutMotion();
  endTabSwap();
  const header = document.querySelector('.site-header');
  aboutOpen = false;
  if (!header) return;
  header.removeAttribute('data-about');
  header.removeAttribute('data-about-closing');
  const panel = aboutPanel(header);
  if (panel) {
    panel.hidden = true;
    panel.inert = true;
  }
  header.querySelector('[data-about-open]')?.setAttribute('aria-expanded', 'false');
  // News opened with About closes with it; an already-open popup stays.
  closeNewsWithAbout();
}

/** Leaving the page from About: the windows fold away, then the page can change. */
export function leaveAbout() {
  const header = document.querySelector('.site-header');
  const panel = aboutPanel(header);
  if (!aboutOpen || !header || !panel || reducedMotion.matches) {
    dismissAbout();
    return Promise.resolve();
  }
  clearAboutMotion();
  closeNewsWithAbout();
  if (panel.dataset.menuWidth) panel.style.setProperty('--about-from', '0px');
  panel.style.removeProperty('--about-w-end');
  header.setAttribute('data-about-closing', '');
  return new Promise((resolve) => {
    const finish = () => {
      clearAboutMotion();
      // The header row comes back without the current section, ready for the next one.
      navLinks(header).forEach((link) => link.removeAttribute('aria-current'));
      leftFromAbout = true;
      dismissAbout();
      resolve();
    };
    endAboutClose = (event) => {
      if (event && (event.target !== panel || event.propertyName !== '--about-w')) return;
      finish();
    };
    panel.addEventListener('transitionend', endAboutClose);
    const grow = parseFloat(getComputedStyle(header).getPropertyValue('--grow-duration')) * 1000 || 500;
    aboutMotion = window.setTimeout(endAboutClose, grow * 2 + 100);
  });
}

/** Closes the about panel. The menu stays as it was. */
export function dismissAbout() {
  if (!aboutOpen) return;
  hideAbout();
  const toggle = document.querySelector('.site-header__toggle');
  if (!navOpen && toggle) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  }
}

function snapNavClosed(header) {
  window.clearTimeout(closeTimer);
  navOpen = false;
  header.classList.remove('is-settled', 'is-section-swap');
  header.removeAttribute('data-open');
  header.removeAttribute('data-closing');
  header.querySelector('.site-header__nav')?.style.removeProperty('--bubble');
  navLinks(header).forEach((link) => {
    link.getAnimations?.().forEach((animation) => animation.cancel());
    link.style.transition = '';
    link.style.removeProperty('--bubble');
  });
  setLinksInert(header, true);
}

/** The element that fills the panel for a tab: the copy, the team, or the shared news panel. */
function aboutView(panel, tab) {
  if (tab === 'team') return panel.querySelector('.about-panel__team');
  if (tab === 'news') return panel.closest('.site-header')?.querySelector('[data-news-panel]');
  return panel.querySelector('.about-panel__body');
}

function applyAboutTab(panel, tab) {
  panel.dataset.aboutView = tab;
  const scroller = tab === 'news'
    ? aboutView(panel, tab)?.querySelector('[data-news-photos]')
    : tab === 'team'
      ? aboutView(panel, tab)
      : panel.querySelector('.about-panel__text');
  if (scroller) scroller.scrollTop = 0;
}

let tabSwap = null;

function endTabSwap() {
  if (!tabSwap) return;
  window.clearTimeout(tabSwap.timer);
  tabSwap.out?.cancel();
  tabSwap = null;
}

/** Phone only: shows the copy, the team, or the shared news panel. Desktop ignores this.
    In an open panel the old tab fades out, then the new one fades in (as in the reference). */
function showAboutTab(panel, tab) {
  if (!panel) return;
  panel.querySelectorAll('.about-panel__tab').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.aboutTab === tab));
  });
  endTabSwap();
  const header = panel.closest('.site-header');
  const from = panel.dataset.aboutView;
  const oldView = from && from !== tab ? aboutView(panel, from) : null;
  if (!oldView || !header?.hasAttribute('data-about') || !phone.matches || reducedMotion.matches) {
    applyAboutTab(panel, tab);
    return;
  }
  const fade = parseFloat(getComputedStyle(header).getPropertyValue('--fade-duration')) * 1000 || 300;
  const outMs = Math.round(fade / 2);
  const swap = {
    out: oldView.animate([{ opacity: 1 }, { opacity: 0 }], { duration: outMs, easing: FADE_EASING, fill: 'forwards' }),
    timer: 0,
  };
  // A timer, not the animation's end: a background tab never runs it.
  swap.timer = window.setTimeout(() => {
    if (tabSwap !== swap) return;
    tabSwap = null;
    applyAboutTab(panel, tab);
    swap.out.cancel();
    aboutView(panel, tab)?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fade, easing: FADE_EASING });
  }, outMs);
  tabSwap = swap;
}

function openAbout(moveFocus) {
  const header = document.querySelector('.site-header');
  if (!header || document.body.dataset.page === 'project') return;
  // Archive: the column bar folds into the header first, then About opens from there.
  if (header.classList.contains('is-archive-open') && !reducedMotion.matches) {
    collapseArchive().then(() => {
      if (!aboutOpen) openAbout(moveFocus);
    });
    return;
  }
  clearAboutMotion();
  // Desktop: the windows start as a strip over the open menu, so the menu turns into them,
  // and close back to its width. News stays in its own place beside them, so only the
  // menu's width counts.
  const nav = header.querySelector('.site-header__nav');
  let menuWidth = 0;
  if (!phone.matches && navOpen && nav) menuWidth = nav.getBoundingClientRect().width;
  const stripWidth = menuWidth;
  // Same news element as the popup: leave it if open; otherwise open it with About.
  openNewsWithAbout();
  snapNavClosed(header);
  aboutOpen = true;
  const panel = aboutPanel(header);
  panel?.style.setProperty('--about-from', `${Math.round(stripWidth)}px`);
  panel?.style.removeProperty('--about-w-end');
  if (panel) panel.dataset.menuWidth = String(Math.round(menuWidth));
  if (panel) {
    panel.hidden = false;
    panel.inert = false;
    const team = panel.querySelector('.about-panel__team');
    if (team) team.scrollTop = 0;
    showAboutTab(panel, 'about');
  }
  header.setAttribute('data-about', '');
  if (panel && !reducedMotion.matches) {
    header.setAttribute('data-about-closing', '');
    panel.offsetWidth;
    header.removeAttribute('data-about-closing');
  }
  header.querySelector('[data-about-open]')?.setAttribute('aria-expanded', 'true');
  const toggle = header.querySelector('.site-header__toggle');
  toggle?.removeAttribute('inert');
  toggle?.setAttribute('aria-expanded', 'true');
  toggle?.setAttribute('aria-label', 'Close about');
  if (moveFocus) header.querySelector('[data-about-close]')?.focus();
}

function finishAboutClose(moveFocus) {
  if (!aboutOpen) return;
  const header = document.querySelector('.site-header');
  hideAbout();
  applyNav(true, moveFocus, undefined, { fromAbout: true });
  // The windows have narrowed back to the menu's width, so the menu is already there:
  // its boxes take their full size at once, and only the labels fade in.
  if (header && !phone.matches) {
    bubbleTargets(header).forEach((target) => {
      target.getAnimations().forEach((animation) => {
        if (animation.transitionProperty === '--bubble' || animation.transitionProperty === 'margin-right') {
          animation.finish();
        }
      });
    });
    header.querySelector('.site-header__nav')?.getAnimations().forEach((animation) => animation.finish());
  }
  reopenArchiveBar();
}

/** Closes about and opens the menu, so About is a button again. */
function closeAboutToNav(moveFocus) {
  const header = document.querySelector('.site-header');
  if (!aboutOpen || !header || header.hasAttribute('data-about-closing')) return;
  // Fold news with About when it was opened with About; an independent popup stays.
  closeNewsWithAbout();
  const panel = aboutPanel(header);
  if (!panel || reducedMotion.matches) {
    finishAboutClose(moveFocus);
    return;
  }
  // The strip narrows to the menu's own width and ends there, so the menu takes over at once.
  const menuWidth = Number(panel.dataset.menuWidth) || 0;
  if (menuWidth) panel.style.setProperty('--about-from', `${menuWidth}px`);
  const fullWidth = panel.getBoundingClientRect().width;
  panel.style.setProperty('--about-w-end', fullWidth > menuWidth && menuWidth ? String(menuWidth / fullWidth) : '0');
  header.setAttribute('data-about-closing', '');
  // The windows fold down first, then narrow back to the menu. The last of those ends it.
  endAboutClose = (event) => {
    if (event && (event.target !== panel || event.propertyName !== '--about-w')) return;
    clearAboutMotion();
    finishAboutClose(moveFocus);
  };
  panel.addEventListener('transitionend', endAboutClose);
  // Fallback for a background tab, which never runs the transitions: fold, then narrow.
  const grow = parseFloat(getComputedStyle(header).getPropertyValue('--grow-duration')) * 1000 || 500;
  aboutMotion = window.setTimeout(endAboutClose, grow * 2 + 100);
}

// A product handing its title back to the Merch page has already slid it into place
// (product.js): the name shows at once there instead of growing out of nothing.
let projectAtOnce = '';

/** The next time the header shows `title` as the project, it shows without motion. */
export function showHeaderProjectAtOnce(title) {
  projectAtOnce = title;
}

function paintHeaderProject(link, title, href) {
  if (projectAtOnce && projectAtOnce === title) {
    projectAtOnce = '';
    link.hidden = false;
    link.style.transition = 'none';
    link.href = href;
    link.textContent = title;
    link.style.color = '';
    link.style.width = 'max-content';
    link.style.width = `${link.getBoundingClientRect().width}px`;
    link.offsetWidth;
    link.style.transition = '';
    return;
  }
  projectAtOnce = '';
  const fromWidth = link.hidden ? 0 : link.getBoundingClientRect().width;
  const fadeIn = !link.hidden && !reducedMotion.matches;

  link.hidden = false;
  link.style.transition = 'none';
  if (fadeIn) link.style.color = 'transparent';
  link.href = href;
  link.textContent = title;
  link.style.width = 'max-content';
  const toWidth = link.getBoundingClientRect().width;
  link.style.width = `${fromWidth}px`;
  link.offsetWidth;

  if (reducedMotion.matches) {
    link.style.transition = '';
    link.style.width = '';
    link.style.color = '';
    return;
  }

  link.style.transition = '';
  link.style.width = `${toWidth}px`;
  // From hidden, the padding has to grow with the width, or the bubble starts 14px wide.
  if (!fromWidth) {
    link.animate([{ paddingInline: '0px' }, {}], { duration: motionMs(link.closest('.site-header')), easing: 'linear' });
  }
  if (fadeIn) link.offsetWidth;
  link.style.color = '';
}

/** Shows a label in the bubble between the logo and the menu. */
// Counts every change of the project name, so a delayed step meant for an older one
// (closeHeaderProject) never clears a newer one.
let projectTurn = 0;

export function setHeaderProject(project) {
  const link = document.querySelector('[data-header-project]');
  if (!link) return;

  window.clearTimeout(titleTimer);
  projectTurn += 1;

  const nextHref = project?.href || (project?.slug ? `/projects/${project.slug}` : '');
  if (!project?.title || !nextHref) {
    link.hidden = true;
    link.removeAttribute('href');
    link.textContent = '';
    link.style.width = '';
    link.style.color = '';
    return;
  }

  const nextTitle = project.title;
  if (!link.hidden && link.textContent === nextTitle && link.getAttribute('href') === nextHref) {
    // Back to the name already there before a pending change had painted (a quick scroll
    // back and forth on Merch): its text was faded out for that change and stayed invisible.
    link.style.color = '';
    return;
  }

  const reveal = () => paintHeaderProject(link, nextTitle, nextHref);
  const canFade = !link.hidden && link.textContent && !reducedMotion.matches;
  if (!canFade) {
    reveal();
    return;
  }

  link.style.color = 'transparent';
  titleTimer = window.setTimeout(reveal, 160);
}

/** Width of a link when it is the one on screen, including its padding. */
function fullLinkWidth(link, padding) {
  const previousWidth = link.style.width;
  const previousPad = link.style.paddingInline;
  link.style.width = 'max-content';
  link.style.paddingInline = padding;
  const width = Math.ceil(link.getBoundingClientRect().width);
  link.style.width = previousWidth;
  link.style.paddingInline = previousPad;
  return width;
}

function linkByHref(header, href) {
  if (!href) return null;
  return header.querySelector(`.site-header__links .site-header__link[href="${CSS.escape(href)}"]`);
}

function measureSectionWidths(header) {
  const widths = {};
  navLinks(header).forEach((link) => {
    const href = link.getAttribute('href');
    if (href) widths[href] = fullLinkWidth(link, 'var(--inline-gap)');
  });
  return widths;
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** How long the open menu takes to fold away: the staggered links, until the last is gone. */
function menuCloseMs(header) {
  const style = getComputedStyle(header);
  // The links fold on --ease-fold, which ends cleanly, so the wait is the whole fold.
  const fold = parseFloat(style.getPropertyValue('--fold-duration')) * 1000;
  const stagger = parseFloat(style.getPropertyValue('--fold-stagger'));
  if (!Number.isFinite(fold) || !Number.isFinite(stagger)) return motionMs(header);
  // The archive's drop-down wipes in whole. The rest, the phone column included, stagger.
  const steps = menuDrops() ? 0 : navLinks(header).length - 1;
  return fold + stagger * steps;
}

function motionMs(header) {
  const ms = parseFloat(getComputedStyle(header).getPropertyValue('--transition-duration')) * 1000;
  return Number.isFinite(ms) ? ms : SECTION_MS;
}

let leaveGeneration = 0;
let leftFromAbout = false;

/**
 * The next page paints its nav already settled. Shrink the old link and grow
 * the new one here, then navigate, so the change is not a cut.
 */
function swapClosedSection(header, from, to, generation) {
  // The closed phone header shows no section, so there is nothing to swap.
  if (phone.matches) return Promise.resolve();
  const outgoing = linkByHref(header, from);
  const incoming = linkByHref(header, to);
  if ((!outgoing && !incoming) || outgoing === incoming) return Promise.resolve();

  const widths = measureSectionWidths(header);
  navLinks(header).forEach((link) => {
    const href = link.getAttribute('href');
    if (widths[href]) link.style.setProperty('--full', `${widths[href]}px`);
  });

  const links = [outgoing, incoming].filter(Boolean);
  header.classList.add('is-section-swap');
  links.forEach((link) => {
    link.getAnimations?.().forEach((animation) => animation.cancel());
    link.style.transition = 'none';
    link.style.setProperty('--bubble', link === incoming ? '0' : '1');
  });
  // Move the marker while the widths are pinned, so max-content cannot snap.
  navLinks(header).forEach((link) => {
    if (incoming && link === incoming) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  header.offsetWidth;
  links.forEach((link) => {
    link.style.transition = '';
  });
  if (outgoing) outgoing.style.setProperty('--bubble', '0');
  if (incoming) incoming.style.setProperty('--bubble', '1');

  // Expo-out has visually landed a little past half its length.
  const swapMs = (parseFloat(getComputedStyle(header).getPropertyValue('--grow-duration')) * 1000 || 500) * 0.56;
  return delay(swapMs + 40).then(() => {
    if (generation !== leaveGeneration || !header.isConnected) return;
    links.forEach((link) => {
      link.style.transition = 'none';
      link.style.removeProperty('--bubble');
    });
    header.classList.remove('is-section-swap');
    header.offsetWidth;
    links.forEach((link) => {
      link.style.transition = '';
    });
  });
}

/** Shrinks the centered project title. The next page opens its own. */
function closeHeaderProject(header) {
  const link = header.querySelector('[data-header-project]');
  if (!link || link.hidden) return Promise.resolve();
  const turn = projectTurn;

  const from = Math.ceil(link.getBoundingClientRect().width);
  link.style.transition = 'none';
  link.style.width = `${from}px`;
  link.offsetWidth;
  link.style.transition = '';
  link.style.width = '0px';
  // The padding shrinks with the width, so the bubble does not vanish from 14px wide.
  const padding = reducedMotion.matches
    ? null
    : link.animate([{}, { paddingInline: '0px' }], { duration: motionMs(header), easing: 'linear', fill: 'forwards' });

  return delay(motionMs(header)).then(() => {
    padding?.cancel();
    // A new name was set meanwhile (the next page, or Merch again): it stays.
    if (!link.isConnected || link.hidden || turn !== projectTurn) return;
    link.hidden = true;
    link.textContent = '';
    link.removeAttribute('href');
    link.style.width = '';
    link.style.color = '';
    link.style.transition = '';
  });
}

/** Plays the nav change, then resolves true once this navigation may proceed. */
export function prepareSectionLeave(nextPathname, currentPathname = location.pathname) {
  const generation = ++leaveGeneration;
  const proceed = (promise) => promise.then(() => generation === leaveGeneration);

  if (reducedMotion.matches) return Promise.resolve(true);

  const header = document.querySelector('.site-header');
  const next = sectionHref(nextPathname);
  // Leaving from About: its windows folded away with the section bubble hidden, so the
  // next section grows in from nothing instead of the old one popping back first.
  const current = leftFromAbout ? '' : sectionHref(currentPathname);
  leftFromAbout = false;
  if (!header || next === current) return Promise.resolve(true);
  if (!current && !next) return Promise.resolve(true);

  const nav = header.querySelector('.site-header__nav');
  if (nav && getComputedStyle(nav).display === 'none') return Promise.resolve(true);

  if (current === '/work') header.classList.add('is-views-out');

  const project = closeHeaderProject(header);
  const section = navOpen
    ? (() => {
        const drops = menuDrops();
        if (drops) {
          // The archive's drop-down keeps its own link in the row while it folds away,
          // then the row changes section the way a closed menu does.
          applyNav(false, false, current);
          // The swap needs the drop-down fully gone (data-open off), not just visually landed.
          const fold = parseFloat(getComputedStyle(header).getPropertyValue('--fold-duration')) * 1000 || 400;
          return delay(fold + 60).then(() =>
            generation === leaveGeneration ? swapClosedSection(header, current, next, generation) : null,
          );
        }
        applyNav(false, false, next);
        return delay(menuCloseMs(header) + 40);
      })()
    : swapClosedSection(header, current, next, generation);

  return proceed(Promise.all([section, project, collapseArchive()]));
}

// The pieces of the header row. A new page can rearrange them: on the Archive, News hangs
// below the column bar instead of sitting in the row, so the nav and the + move over.
const EXPO_OUT = 'cubic-bezier(0.19, 1, 0.22, 1)';
const ROW_PARTS = '.site-header__logo, [data-news-panel], .site-header__context, .site-header__nav, .site-header__toggle';
let rowBefore = null;

function rowPlaces(header) {
  const origin = header.getBoundingClientRect();
  const places = new Map();
  header.querySelectorAll(ROW_PARTS).forEach((element) => {
    if (element.parentElement !== header || !element.getClientRects().length) return;
    const box = element.getBoundingClientRect();
    places.set(element, { x: box.left - origin.left, y: box.top - origin.top });
  });
  return places;
}

/* ---------- The header changing place ----------

   On a phone the header sits in a different place on each page: docked at the bottom on
   Home, Merch and the Work stack, at the top on the Work list, in the middle elsewhere. The
   distance can be most of the screen, so on the opening curve at its usual length it covered
   80px or more in a frame and read as a drop. It glides on the same expo-out over twice the
   grow duration, which halves the first frames' speed; most of the way is still covered in
   the first third. */

/** How long the header and whatever moves with it take to change place. */
export function headerGlideMs(header = document.querySelector('.site-header')) {
  const grow = header ? parseFloat(getComputedStyle(header).getPropertyValue('--grow-duration')) : NaN;
  return (Number.isFinite(grow) ? grow * 1000 : 500) * 2;
}

/** The docked header eases `top` as the footer pushes it (footer.css). A page or view change
 *  starts that transition too, which made the header drop on its own: end it, so the header
 *  is measured at its new place and only the glide moves it. */
export function settleHeaderPlace(header = document.querySelector('.site-header')) {
  header?.getAnimations().forEach((animation) => {
    if (animation.transitionProperty === 'top') animation.finish();
  });
}

/** Slides `element` from `dx`, `dy` pixels away to where it is now. */
export function glideFrom(element, dx, dy, ms = headerGlideMs()) {
  if (!element || reducedMotion.matches || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) return null;
  // Added to the header's own translate (header-scroll.js), not instead of it.
  return element.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }], {
    duration: ms,
    easing: EXPO_OUT,
    composite: 'add',
  });
}

// Where the header box was before a section change. Project pages move it themselves
// (project.js), behind the black cover.
let headerBefore = null;

/** After a swap between two pages that are not project pages, the header glides to its new place. */
function glideHeaderToPlace(header) {
  const from = headerBefore;
  headerBefore = null;
  if (!from || document.body.dataset.page === 'project') return;
  // A full page load holds the header with its own transform (Base.astro); leave that one be.
  if (header.dataset.flipToTop) return;
  // Take the move over from project.js, so the header is not slid twice.
  delete header.dataset.flipTop;
  delete header.dataset.flipLeft;
  delete header.dataset.flipWidth;
  try {
    sessionStorage.removeItem('crystal-header-from');
  } catch {
    // Nothing to take over, then.
  }
  // The Work page sets its view later (work.js). Set it now, as Base.astro does on a full
  // load, so the header is measured at the place the view docks it.
  if (document.querySelector('[data-work-list]')) {
    let stored = '';
    try {
      stored = sessionStorage.getItem('work-view') || '';
    } catch {
      // The stack, then.
    }
    if (stored === 'list') document.body.dataset.workView = 'list';
  }
  settleHeaderPlace(header);
  const to = header.getBoundingClientRect();
  glideFrom(header, from.left - to.left, from.top - to.top, headerGlideMs(header));
}

/** Runs just before a page swap: where each piece sits in the header row. */
export function rememberHeaderRow() {
  rowBefore = null;
  headerBefore = null;
  const header = document.querySelector('.site-header');
  if (!header || reducedMotion.matches || document.body.dataset.page === 'project') return;
  rowBefore = rowPlaces(header);
  const box = header.getBoundingClientRect();
  headerBefore = { top: box.top, left: box.left };
}

/** After the swap, pieces the new page moved slide there instead of jumping. */
function slideHeaderRow(header) {
  const before = rowBefore;
  rowBefore = null;
  if (!before || reducedMotion.matches || document.body.dataset.page === 'project') return;
  const after = rowPlaces(header);
  const ms = parseFloat(getComputedStyle(header).getPropertyValue('--grow-duration')) * 1000 || 500;
  let moved = false;
  after.forEach((place, element) => {
    const from = before.get(element);
    if (!from) return;
    const dx = from.x - place.x;
    const dy = from.y - place.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    moved = true;
    element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }], {
      duration: ms,
      easing: EXPO_OUT,
      composite: 'add',
    });
  });
  // When the slide has visually landed on the expo-out. The archive waits for it before its
  // column bar opens, so the two never move over each other (archive.js).
  header.rowSettleAt = moved ? performance.now() + ms * 0.56 : 0;
}

/** Syncs the active link without replaying the open/close menu animation. */
export function setUpHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  // A section change leaves the previous page's raise mid-flight; start clean.
  clearFooterReveal();
  leftFromAbout = false;

  syncCurrentSection(header);
  alignListNav(header);
  alignWorkViews(header);
  updateFooterPush();

  const nav = header.querySelector('.site-header__nav');
  const toggle = header.querySelector('.site-header__toggle');
  const views = header.querySelector('[data-work-views]');
  const onWork = sectionHref(location.pathname) === '/work';
  if (views) {
    if (onWork && views.hidden) views.classList.add('is-views-in');
    else views.classList.remove('is-views-in');
    views.hidden = !onWork;
  }
  header.classList.remove('is-views-out');
  slideHeaderRow(header);
  glideHeaderToPlace(header);

  if (document.body.dataset.page === 'project') dismissAbout();

  if (aboutOpen) {
    header.setAttribute('data-about', '');
    header.removeAttribute('data-open');
    header.removeAttribute('data-closing');
    setLinksInert(header, true);
    toggle?.removeAttribute('inert');
    toggle?.setAttribute('aria-expanded', 'true');
    toggle?.setAttribute('aria-label', 'Close about');
    const panel = aboutPanel(header);
    if (panel) {
      panel.hidden = false;
      panel.inert = false;
    }
    header.querySelector('[data-about-open]')?.setAttribute('aria-expanded', 'true');
    return;
  }

  if (navOpen) {
    header.setAttribute('data-open', '');
    header.classList.add('is-settled');
    header.removeAttribute('data-closing');
    setLinksInert(header, false);
    toggle?.removeAttribute('inert');
    // Menu stayed open across the swap: show this page's footer the same way.
    raiseMenuFooter();
    updateFooterPush();
    bumpMenuIdle();
    document.dispatchEvent(new CustomEvent('crystal:menu-motion'));
  } else {
    header.removeAttribute('data-open');
    header.removeAttribute('data-closing');
    header.classList.remove('is-section-swap');
    setLinksInert(header, true);
    toggle?.removeAttribute('inert');
  }
}

document.addEventListener('pointerover', (event) => {
  if (!navOpen || !(event.target instanceof Element)) return;
  if (event.target.closest('.site-header__nav, .site-header__toggle')) bumpMenuIdle();
});

document.addEventListener('focusin', (event) => {
  if (!navOpen || !(event.target instanceof Element)) return;
  if (event.target.closest('.site-header__nav, .site-header__toggle')) bumpMenuIdle();
});

// While the menu opens, each link grows from nothing, and a box still growing also trims
// where the link can be tapped. A quick tap then lands on the links' container instead. Hand
// it to the link whose full box is under the finger, so an early tap still works.
document.addEventListener(
  'click',
  (event) => {
    if (!navOpen || !(event.target instanceof Element) || !event.target.matches('.site-header__links')) return;
    const link = [...event.target.querySelectorAll('.site-header__link')].find((candidate) => {
      const box = candidate.getBoundingClientRect();
      return (
        box.width > 0 &&
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom
      );
    });
    if (!link) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    link.click();
  },
  true,
);

document.addEventListener('click', (event) => {
  if (navOpen && event.target instanceof Element && event.target.closest('.site-header__nav, .site-header__toggle')) {
    bumpMenuIdle();
  }
  const aboutButton = event.target.closest('[data-about-open]');
  if (aboutButton) {
    clearMenuIdle();
    openAbout(aboutButton.matches(':focus-visible'));
    return;
  }

  const aboutTab = event.target.closest('[data-about-tab]');
  if (aboutTab) {
    showAboutTab(aboutTab.closest('[data-about-panel]'), aboutTab.dataset.aboutTab);
    return;
  }

  const aboutClose = event.target.closest('[data-about-close]');
  if (aboutClose) {
    closeAboutToNav(aboutClose.matches(':focus-visible'));
    return;
  }

  const toggle = event.target.closest('.site-header__toggle');
  if (toggle) {
    if (aboutOpen) {
      closeAboutToNav(toggle.matches(':focus-visible'));
      return;
    }
    applyNav(!navOpen, toggle.matches(':focus-visible'));
    return;
  }

  // News sits beside About as a window of its own: changing item there keeps About open.
  if (aboutOpen && !event.target.closest('[data-about-panel], [data-news-panel]')) {
    // A link leaves the page: page.js folds About away first (leaveAbout).
    if (event.target.closest('a[href]')) return;
    closeAboutToNav(false);
    return;
  }

  // The footer comes up with the menu, so using it keeps the menu open.
  if (navOpen && !event.target.closest('.site-header, .site-footer')) {
    applyNav(false, false);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (aboutOpen) {
    closeAboutToNav(true);
    return;
  }
  if (navOpen) applyNav(false, true);
});

document.addEventListener('submit', (event) => {
  const form = event.target?.closest?.('[data-about-form]');
  if (!form) return;
  event.preventDefault();
  const email = form.dataset.email;
  if (!email) return;
  const message = new FormData(form).get('message')?.toString().trim() ?? '';
  window.location.href = `mailto:${email}?body=${encodeURIComponent(message)}`;
});

/** Restarts the idle close. Hover, focus or click on the menu counts as use. */
function bumpMenuIdle() {
  window.clearTimeout(menuIdleTimer);
  if (!navOpen || aboutOpen || !phone.matches) return;
  menuIdleTimer = window.setTimeout(() => {
    if (navOpen && !aboutOpen) applyNav(false, false);
  }, MENU_IDLE_MS);
}

function clearMenuIdle() {
  window.clearTimeout(menuIdleTimer);
  menuIdleTimer = 0;
}

/** Desktop: shows the footer at the bottom of the screen with the menu, on every page. */
function raiseMenuFooter() {
  // Phone: the menu opens on its own and the footer stays where it is. Closing then has
  // nothing to lower.
  if (phone.matches || footerIsRaised()) return;
  raiseFooter();
}

/** Puts the footer back below the screen when the menu closes. */
function lowerMenuFooter() {
  lowerFooter();
}

/** Phone, header docked at the bottom: the footer pushes it up as it arrives. The
    stylesheet stops it at the middle. */
function updateFooterPush() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const footer = document.querySelector('.site-footer');
  let push = 0;
  // Home, Work and Merch rise the footer with the menu instead of scrolling, so use where it stops.
  const homeTop = homeFooterTop();
  const footerTop = homeTop ?? (footer?.getClientRects().length ? footer.getBoundingClientRect().top : null);
  if (phone.matches && footerTop !== null && document.body.matches(DOCKED_BOTTOM)) {
    const margin = parseFloat(getComputedStyle(header).getPropertyValue('--margin')) || 20;
    push = Math.max(0, window.innerHeight - margin - footerTop);
  }
  header.style.setProperty('--footer-push', `${Math.round(push)}px`);
  header.toggleAttribute('data-footer', push > 0);
}

window.addEventListener('scroll', updateFooterPush, { passive: true });

window.addEventListener('resize', () => {
  updateFooterPush();
  const header = document.querySelector('.site-header');
  if (!header) return;
  alignListNav(header);
  alignWorkViews(header);
  if (header.hasAttribute('data-open')) measureListNav(header);
});

document.addEventListener('transitionend', (event) => {
  if (event.propertyName !== '--bubble') return;
  // The links, or the archive's drop-down itself, which can end after them.
  if (!(event.target instanceof Element) || !event.target.matches('.site-header__link, .site-header__nav')) return;
  const header = event.target.closest('.site-header');
  if (!header || header.classList.contains('is-section-swap')) return;
  // The links run one after another, so the menu has settled only once the last one ends.
  const running = bubbleTargets(header).some((target) =>
    target.getAnimations().some(
      (animation) => animation.transitionProperty === '--bubble' && animation.playState === 'running',
    ),
  );
  if (running) return;
  bubbleTargets(header).forEach((target) => target.style.removeProperty('--bubble'));
  if (!navOpen) header.querySelector('.site-header__nav')?.style.removeProperty('--bubble');
  if (navOpen) {
    header.classList.add('is-settled');
    bumpMenuIdle();
  } else {
    header.removeAttribute('data-open');
    header.removeAttribute('data-closing');
    productMenuClosed();
    fadeViewsIn(header);
  }
  alignWorkViews(header);
});
