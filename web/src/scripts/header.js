// Open and closed state for the site header. Listeners stay on document so they
// survive page transitions. setUpHeader runs again after each swap.

import { collapseArchive } from './archive.js';
import { dismissNews } from './news.js';

let navOpen = false;
let aboutOpen = false;
let closeTimer = 0;
let titleTimer = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
// Same query as the phone blocks in the stylesheets.
const phone = matchMedia('(max-width: 48rem), (max-height: 30rem) and (pointer: coarse)');
// Pages whose phone header is docked at the bottom. Same list as header.css.
const DOCKED_BOTTOM =
  ":is(:has([data-roulette]), :has([data-merch-reel]), [data-page='product'], :not([data-work-view='list']):has([data-reel]))";
const textHold = 70;
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

/** Closed, the section links are out of reach. Only the links: List, Reel and Buy sit in
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
  // On a phone every menu is a column with the + hidden under it.
  if (phone.matches) return false;
  return document.body.dataset.workView === 'list' || document.body.dataset.page === 'archive';
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

function setToggleMark(header, open) {
  const mark = header.querySelector('[data-header-mark]');
  if (!mark) return;
  const showMinus = open && menuDrops();
  const plus = mark.querySelector('[data-header-plus]');
  const minus = mark.querySelector('[data-header-minus]');
  // SVGElement.hidden does not toggle the attribute in this browser.
  if (plus) plus.toggleAttribute('hidden', showMinus);
  if (minus) minus.toggleAttribute('hidden', !showMinus);
}

function applyNav(open, moveFocus, currentHref) {
  const header = document.querySelector('.site-header');
  if (!header) return;

  const nav = header.querySelector('.site-header__nav');
  const toggle = header.querySelector('.site-header__toggle');
  const wasSettled = header.classList.contains('is-settled');

  window.clearTimeout(closeTimer);
  navOpen = open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  if (open) setToggleMark(header, true);

  syncCurrentSection(header, currentHref);
  alignListNav(header);

  if (open) {
    // On a phone the menu column would cover the news, so opening it closes the news.
    if (phone.matches) dismissNews();
    measureBubbles(header);
    header.removeAttribute('data-closing');
    header.setAttribute('data-open', '');
    setLinksInert(header, false);
    // The list keeps + visible, so it has to stay clickable to close.
    if (menuDrops()) toggle.removeAttribute('inert');
    else toggle.setAttribute('inert', '');
    if (moveFocus) {
      const focusTarget = menuDrops()
        ? nav.querySelector('a:not([aria-current="page"])')
        : nav.querySelector('a');
      focusTarget?.focus();
    }
    if (wasSettled) return;

    header.classList.remove('is-settled');
    // Pin the current size, then let the stylesheet grow every bubble to 1.
    // Reversing --bubble from the stylesheet gets stuck in this browser, so
    // the close path sets its own value and the open path has to clear it.
    measureListNav(header);
    const links = bubbleTargets(header);
    const currents = links.map(
      (link) => getComputedStyle(link).getPropertyValue('--bubble').trim() || '0',
    );
    links.forEach((link, index) => {
      link.getAnimations().forEach((animation) => animation.cancel());
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

  const close = () => {
    if (navOpen || !header.isConnected) return;
    const links = bubbleTargets(header);
    const currents = links.map(
      (link) => getComputedStyle(link).getPropertyValue('--bubble').trim() || '0',
    );
    // Pin before data-closing. Otherwise the stylesheet drops --bubble to 0
    // and that reverse transition sticks at the first frame.
    links.forEach((link, index) => {
      link.getAnimations().forEach((animation) => animation.cancel());
      link.style.transition = 'none';
      link.style.setProperty('--bubble', currents[index]);
    });
    header.setAttribute('data-closing', '');
    header.offsetWidth;
    links.forEach((link) => {
      link.style.transition = '';
      link.style.setProperty('--bubble', '0');
    });
    if (currents.every((current) => parseFloat(current) === 0)) {
      links.forEach((link) => link.style.removeProperty('--bubble'));
      header.removeAttribute('data-open');
      header.removeAttribute('data-closing');
      setToggleMark(header, false);
    }
  };

  header.classList.remove('is-settled');
  // The horizontal menu hides its labels, then shrinks. The list menu keeps
  // them and wipes straight back up over List and Reel.
  const drops = menuDrops();
  if (wasSettled && !reducedMotion.matches && !drops && !phone.matches) closeTimer = window.setTimeout(close, textHold);
  else close();
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

/** Phone only: shows the copy or the team. Desktop shows both and ignores this. */
function showAboutTab(panel, tab) {
  if (!panel) return;
  panel.dataset.aboutView = tab;
  panel.querySelectorAll('.about-panel__tab').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.aboutTab === tab));
  });
  const scroller = panel.querySelector(tab === 'team' ? '.about-panel__team' : '.about-panel__text');
  if (scroller) scroller.scrollTop = 0;
}

function openAbout(moveFocus) {
  const header = document.querySelector('.site-header');
  if (!header || document.body.dataset.page === 'project') return;
  clearAboutMotion();
  snapNavClosed(header);
  aboutOpen = true;
  const panel = aboutPanel(header);
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
  setToggleMark(header, false);
  if (moveFocus) header.querySelector('[data-about-close]')?.focus();
}

function finishAboutClose(moveFocus) {
  if (!aboutOpen) return;
  hideAbout();
  applyNav(true, moveFocus);
}

/** Closes about and opens the menu, so About is a button again. */
function closeAboutToNav(moveFocus) {
  const header = document.querySelector('.site-header');
  if (!aboutOpen || !header || header.hasAttribute('data-about-closing')) return;
  const panel = aboutPanel(header);
  if (!panel || reducedMotion.matches) {
    finishAboutClose(moveFocus);
    return;
  }
  header.setAttribute('data-about-closing', '');
  endAboutClose = (event) => {
    if (event && (event.target !== panel || event.propertyName !== '--about')) return;
    clearAboutMotion();
    finishAboutClose(moveFocus);
  };
  panel.addEventListener('transitionend', endAboutClose);
  aboutMotion = window.setTimeout(endAboutClose, SECTION_MS + 80);
}

function paintHeaderProject(link, title, href) {
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
export function setHeaderProject(project) {
  const link = document.querySelector('[data-header-project]');
  if (!link) return;

  window.clearTimeout(titleTimer);

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

function motionMs(header) {
  const ms = parseFloat(getComputedStyle(header).getPropertyValue('--transition-duration')) * 1000;
  return Number.isFinite(ms) ? ms : SECTION_MS;
}

let leaveGeneration = 0;

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

  return delay(motionMs(header) + 40).then(() => {
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
    if (!link.isConnected || link.hidden) return;
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
  const current = sectionHref(currentPathname);
  if (!header || next === current) return Promise.resolve(true);
  if (!current && !next) return Promise.resolve(true);

  const nav = header.querySelector('.site-header__nav');
  if (nav && getComputedStyle(nav).display === 'none') return Promise.resolve(true);

  if (current === '/work') header.classList.add('is-views-out');

  const project = closeHeaderProject(header);
  const section = navOpen
    ? (() => {
        const wasSettled = header.classList.contains('is-settled');
        const drops = menuDrops();
        applyNav(false, false, next);
        const wait = !wasSettled || drops ? motionMs(header) : textHold + motionMs(header);
        return delay(wait + 40);
      })()
    : swapClosedSection(header, current, next, generation);

  return proceed(Promise.all([section, project, collapseArchive()]));
}

/** Syncs the active link without replaying the open/close menu animation. */
export function setUpHeader() {
  const header = document.querySelector('.site-header');
  if (!header) return;

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

  if (document.body.dataset.page === 'project') dismissAbout();

  if (aboutOpen) {
    header.setAttribute('data-about', '');
    header.removeAttribute('data-open');
    header.removeAttribute('data-closing');
    setLinksInert(header, true);
    toggle?.removeAttribute('inert');
    toggle?.setAttribute('aria-expanded', 'true');
    toggle?.setAttribute('aria-label', 'Close about');
    setToggleMark(header, false);
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
    if (menuDrops()) toggle?.removeAttribute('inert');
    else toggle?.setAttribute('inert', '');
    setToggleMark(header, true);
  } else {
    header.removeAttribute('data-open');
    header.removeAttribute('data-closing');
    header.classList.remove('is-section-swap');
    setLinksInert(header, true);
    toggle?.removeAttribute('inert');
    setToggleMark(header, false);
  }
}

document.addEventListener('click', (event) => {
  const aboutButton = event.target.closest('[data-about-open]');
  if (aboutButton) {
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
    applyNav(menuDrops() ? !navOpen : true, toggle.matches(':focus-visible'));
    return;
  }

  if (aboutOpen && !event.target.closest('[data-about-panel]')) {
    if (event.target.closest('a[href]')) {
      dismissAbout();
      return;
    }
    closeAboutToNav(false);
    return;
  }

  if (navOpen && !event.target.closest('.site-header')) {
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

/** Phone, header docked at the bottom: the footer pushes it up as it arrives. The
    stylesheet stops it at the middle. */
function updateFooterPush() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const footer = document.querySelector('.site-footer');
  let push = 0;
  if (phone.matches && footer?.getClientRects().length && document.body.matches(DOCKED_BOTTOM)) {
    const margin = parseFloat(getComputedStyle(header).getPropertyValue('--margin')) || 20;
    push = Math.max(0, window.innerHeight - margin - footer.getBoundingClientRect().top);
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
  if (!(event.target instanceof Element) || !event.target.classList.contains('site-header__link')) return;
  const header = event.target.closest('.site-header');
  if (!header || header.classList.contains('is-section-swap')) return;
  event.target.style.removeProperty('--bubble');
  if (!navOpen) header.querySelector('.site-header__nav')?.style.removeProperty('--bubble');
  if (navOpen) header.classList.add('is-settled');
  else {
    header.removeAttribute('data-open');
    header.removeAttribute('data-closing');
    setToggleMark(header, false);
  }
  alignWorkViews(header);
});
