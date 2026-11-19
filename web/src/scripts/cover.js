// A live black layer over the still. It grows to the screen, or shrinks back.
// No view-transition snapshot: the layer is a transformed element.

const COVER_MS = 280;
const EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const ENTER_KEY = 'crystal-cover-enter';
const LEAVE_KEY = 'crystal-cover-leave';
const ORIGIN_KEY = 'crystal-cover-origin';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let busy = false;

/** Resolves when the animation ends, or after its duration if a background tab never starts it. */
function settled(animation) {
  return Promise.race([
    animation.finished.catch(() => {}),
    new Promise((resolve) => window.setTimeout(resolve, COVER_MS + 80)),
  ]);
}

export function projectSlug(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'projects' || !parts[1]) return '';
  return decodeURIComponent(parts[1]);
}

export function coverBusy() {
  return busy;
}

/** The picture the black should start on. List rows use the shared still. */
export function enterSource(link) {
  if (link.hasAttribute('data-work-row')) return document.querySelector('[data-work-still-frame]');
  if (link.hasAttribute('data-reel-card') || link.hasAttribute('data-roulette-link')) {
    return link.querySelector('.project-roulette__media') || link;
  }
  return null;
}

function grownTransform(rect) {
  const sx = window.innerWidth / rect.width;
  const sy = window.innerHeight / rect.height;
  return `translate(${-rect.left}px, ${-rect.top}px) scale(${sx}, ${sy})`;
}

function createCover(rect) {
  const cover = document.createElement('div');
  cover.className = 'project-cover';
  cover.setAttribute('aria-hidden', 'true');
  cover.style.top = `${rect.top}px`;
  cover.style.left = `${rect.left}px`;
  cover.style.width = `${rect.width}px`;
  cover.style.height = `${rect.height}px`;
  document.body.append(cover);
  return cover;
}

/** Grows black from `source` to the viewport. Resolves true when the screen is covered. */
export function startEnterCover(source) {
  if (busy || reducedMotion.matches) return Promise.resolve(false);
  const rect = source.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return Promise.resolve(false);

  busy = true;
  const cover = createCover(rect);
  try {
    sessionStorage.setItem(
      ORIGIN_KEY,
      JSON.stringify({ top: rect.top, left: rect.left, width: rect.width, height: rect.height }),
    );
  } catch {
    // Leave can still run. It just will not shrink onto this still.
  }
  const animation = cover.animate([{ transform: 'none' }, { transform: grownTransform(rect) }], {
    duration: COVER_MS,
    easing: EASING,
    fill: 'forwards',
  });

  return settled(animation).then(() => {
    try {
      sessionStorage.setItem(ENTER_KEY, '1');
    } catch {
      // The project still opens. The image just will not wait to fade in.
    }
    busy = false;
    return true;
  });
}

/** Read once on the project page. True when this visit followed a cover. */
export function takeEnterCover() {
  try {
    const entered = sessionStorage.getItem(ENTER_KEY) === '1';
    sessionStorage.removeItem(ENTER_KEY);
    return entered;
  } catch {
    return false;
  }
}

/** True while a project is being left with the black cover, so the page underneath must not fade. */
export function leavePending() {
  try {
    return Boolean(sessionStorage.getItem(LEAVE_KEY));
  } catch {
    return false;
  }
}

/** True while a project is being entered with the black cover. */
export function enterPending() {
  try {
    return sessionStorage.getItem(ENTER_KEY) === '1';
  } catch {
    return false;
  }
}

/** Remember which Project to uncover onto after the next in-site leave. */
export function markLeave(slug) {
  try {
    sessionStorage.setItem(LEAVE_KEY, slug);
  } catch {
    // The page still changes. It just will not shrink the black.
  }
}

/** Shrinks a fullscreen black cover onto the still that opened this Project. Runs on the leaving page. */
export function leaveCoverShrink() {
  if (reducedMotion.matches) return Promise.resolve();

  let origin = null;
  try {
    origin = JSON.parse(sessionStorage.getItem(ORIGIN_KEY) || 'null');
    sessionStorage.removeItem(ORIGIN_KEY);
    sessionStorage.removeItem(LEAVE_KEY);
  } catch {
    origin = null;
  }

  const held = document.querySelector('.project-cover');
  held?.remove();

  if (!origin || origin.width < 2 || origin.height < 2) return Promise.resolve();

  const cover = createCover(origin);
  const grown = grownTransform(origin);
  cover.style.transform = grown;
  const animation = cover.animate([{ transform: grown }, { transform: 'none' }], {
    duration: COVER_MS,
    easing: EASING,
    fill: 'forwards',
  });
  return settled(animation).finally(() => cover.remove());
}

function sameProject(link, slug) {
  try {
    return projectSlug(new URL(link.href, location.href).pathname) === slug;
  } catch {
    return false;
  }
}

function leaveTarget(slug) {
  const list = document.querySelector('[data-work-list]');
  if (list && !list.hidden) {
    const row = [...list.querySelectorAll('[data-work-row]')].find((link) => sameProject(link, slug));
    const image = list.querySelector('[data-work-still]');
    if (row?.dataset.still && image instanceof HTMLImageElement) {
      image.removeAttribute('srcset');
      image.src = row.dataset.still;
    }
    return list.querySelector('[data-work-still-frame]');
  }

  const card = [...document.querySelectorAll('[data-reel-card], [data-roulette-link]')].find((link) =>
    sameProject(link, slug),
  );
  if (!card) return null;
  return card.querySelector('.project-roulette__media') || card;
}

/** Shrinks a fullscreen black layer onto the still this Project came from. */
export function playLeaveCover() {
  let slug = '';
  try {
    slug = sessionStorage.getItem(LEAVE_KEY) || '';
    sessionStorage.removeItem(LEAVE_KEY);
  } catch {
    return;
  }
  if (!slug || reducedMotion.matches || document.querySelector('[data-project]')) return;

  const rect = leaveTarget(slug)?.getBoundingClientRect();
  const held = document.querySelector('[data-cover-hold]');
  if (!rect || rect.width < 2 || rect.height < 2) {
    held?.remove();
    return;
  }

  const cover = held || createCover(rect);
  cover.style.top = `${rect.top}px`;
  cover.style.left = `${rect.left}px`;
  cover.style.width = `${rect.width}px`;
  cover.style.height = `${rect.height}px`;
  const grown = grownTransform(rect);
  cover.style.transform = grown;
  const animation = cover.animate([{ transform: grown }, { transform: 'none' }], {
    duration: COVER_MS,
    easing: EASING,
    fill: 'forwards',
  });
  animation.finished.finally(() => cover.remove());
}
