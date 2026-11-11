// Open and closed state for the site header. Listeners stay on document so they
// survive page transitions. setUpHeader runs again after each swap.

let navOpen = false;
let closeTimer = 0;
let titleTimer = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const textHold = 70;

const NAV_HREFS = ['/work', '/awards', '/archive', '/merch', '/about'];

function navLinks(header) {
  return header.querySelectorAll('.site-header__links .site-header__link');
}

// The current section's own nav link sits in the bubble. The others stay in the menu.
function placeCurrentLink(header) {
  const linksBox = header.querySelector('.site-header__links');
  const context = header.querySelector('.site-header__context');
  const project = header.querySelector('[data-header-project]');
  if (!linksBox || !context) return;

  const path = location.pathname;
  const links = [...header.querySelectorAll('.site-header__link')].sort(
    (a, b) => NAV_HREFS.indexOf(a.getAttribute('href')) - NAV_HREFS.indexOf(b.getAttribute('href')),
  );
  let current = null;
  links.forEach((link) => {
    const href = link.getAttribute('href');
    const isCurrent = path === href || path.startsWith(`${href}/`);
    if (isCurrent) {
      current = link;
      link.setAttribute('aria-current', 'page');
      context.insertBefore(link, project);
    } else {
      link.removeAttribute('aria-current');
      linksBox.append(link);
    }
  });
  if (current) setHeaderProject(null);
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

function listMenu(header) {
  if (document.body.dataset.workView !== 'list') return null;
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
  const previous = menu.style.height;
  menu.style.height = 'max-content';
  menu.style.setProperty('--list-nav-full', `${Math.ceil(menu.getBoundingClientRect().height)}px`);
  menu.style.height = previous;
}

function alignListNav(header) {
  if (document.body.dataset.workView !== 'list') return;
  const context = header.querySelector('.site-header__context');
  if (!context) return;
  header.style.setProperty('--list-nav-left', `${context.offsetLeft}px`);
}

function setToggleMark(header, open) {
  const mark = header.querySelector('[data-header-mark]');
  if (!mark) return;
  const showMinus = open && document.body.dataset.workView === 'list';
  mark.textContent = showMinus ? '−' : '+';
}

function applyNav(open, moveFocus) {
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

  placeCurrentLink(header);
  alignListNav(header);

  if (open) {
    measureBubbles(header);
    header.removeAttribute('data-closing');
    header.setAttribute('data-open', '');
    nav.removeAttribute('inert');
    // The list keeps + visible, so it has to stay clickable to close.
    if (document.body.dataset.workView === 'list') toggle.removeAttribute('inert');
    else toggle.setAttribute('inert', '');
    if (moveFocus) {
      const focusTarget =
        document.body.dataset.workView === 'list'
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
  nav.setAttribute('inert', '');
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
  const listView = document.body.dataset.workView === 'list';
  if (wasSettled && !reducedMotion.matches && !listView) closeTimer = window.setTimeout(close, textHold);
  else close();
}

/** Closes the menu. The project title bubble stays put. */
export function closeNav() {
  if (navOpen) applyNav(false, false);
}

function paintHeaderProject(link, title, href) {
  const fromWidth = link.hidden ? 0 : link.getBoundingClientRect().width;
  const previousWidth = link.style.width;
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
  if (fadeIn) link.offsetWidth;
  link.style.color = '';

  const settle = (event) => {
    if (event.propertyName !== 'width') return;
    link.removeEventListener('transitionend', settle);
    link.style.width = previousWidth;
  };
  link.addEventListener('transitionend', settle);
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

export function setUpHeader() {
  applyNav(navOpen, false);
}

document.addEventListener('click', (event) => {
  const toggle = event.target.closest('.site-header__toggle');
  if (toggle) {
    const listView = document.body.dataset.workView === 'list';
    applyNav(listView ? !navOpen : true, toggle.matches(':focus-visible'));
    return;
  }

  if (navOpen && !event.target.closest('.site-header')) {
    applyNav(false, false);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && navOpen) applyNav(false, true);
});

window.addEventListener('resize', () => {
  const header = document.querySelector('.site-header');
  if (header) alignListNav(header);
});

document.addEventListener('transitionend', (event) => {
  if (event.propertyName !== '--bubble') return;
  if (!(event.target instanceof Element) || !event.target.classList.contains('site-header__link')) return;
  const header = event.target.closest('.site-header');
  if (!header) return;
  event.target.style.removeProperty('--bubble');
  if (!navOpen) header.querySelector('.site-header__nav')?.style.removeProperty('--bubble');
  if (navOpen) {
    header.classList.add('is-settled');
    return;
  }
  header.removeAttribute('data-open');
  header.removeAttribute('data-closing');
  setToggleMark(header, false);
});
