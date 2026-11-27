// Opening a project: the clicked picture grows to fill the screen, on black, then the
// project page takes over under it. Closing shrinks it back onto the picture.
//
// The layer is one fixed element the size of the screen. A clip-path window grows from the
// picture's box to the screen while the picture inside moves and scales (transforms only):
// it starts cropped exactly as it was on the page and ends fitted whole on black, as the
// project player shows it. The layer lives on <html>, outside <body>, so it stays up while
// the router swaps the page, and fades once the project's own media is showing.

const COVER_MS = 700;
const EASING = 'cubic-bezier(0.19, 1, 0.22, 1)';
// The expo-out has visually landed by this share of the motion: the next page loads from here.
const LANDED = 0.55;
// The project fades its media in (project.css, 0.35s); the layer goes once that is done.
const PROJECT_FADE_MS = 380;
const HANDOFF_MS = 300;
// Never hold the project hidden longer than this, even if its video has not started.
const HOLD_MAX_MS = 2200;
const ENTER_KEY = 'crystal-cover-enter';
const LEAVE_KEY = 'crystal-cover-leave';
const ORIGIN_KEY = 'crystal-cover-origin';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

let busy = false;
// The grown layer, carried over to the project page.
let carried = null;

/** Resolves when the animation ends, or after `ms` if a background tab never starts it. */
function settled(animation, ms = COVER_MS) {
  return Promise.race([
    animation.finished.catch(() => {}),
    new Promise((resolve) => window.setTimeout(resolve, ms + 80)),
  ]);
}

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function projectSlug(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'projects' || !parts[1]) return '';
  return decodeURIComponent(parts[1]);
}

export function coverBusy() {
  return busy;
}

/** The picture the cover should start on. List rows use the shared still. */
export function enterSource(link) {
  if (link.hasAttribute('data-work-row')) return document.querySelector('[data-work-still-frame]');
  if (link.hasAttribute('data-reel-card') || link.hasAttribute('data-roulette-link')) {
    return link.querySelector('.project-roulette__media') || link;
  }
  return null;
}

/** The picture shown in `box`: its address and shape, or null. */
function pictureIn(box) {
  const image = box?.querySelector('img');
  if (image instanceof HTMLImageElement && (image.currentSrc || image.src)) {
    const ratio = image.naturalWidth > 0 ? image.naturalWidth / image.naturalHeight : 0;
    return { src: image.currentSrc || image.src, ratio };
  }
  const video = box?.querySelector('video[poster]');
  if (video instanceof HTMLVideoElement) {
    const ratio = video.videoWidth > 0 ? video.videoWidth / video.videoHeight : 0;
    return { src: video.poster, ratio };
  }
  return null;
}

/** A box of `ratio` that covers (`fill`) or fits inside `rect`, centred on it. */
function fitBox(ratio, rect, fill) {
  const wide = ratio > rect.width / rect.height;
  const width = wide === fill ? rect.height * ratio : rect.width;
  const height = width / ratio;
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  };
}

function screenRect() {
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

function clipTo(rect) {
  const right = window.innerWidth - rect.left - rect.width;
  const bottom = window.innerHeight - rect.top - rect.height;
  return `inset(${rect.top}px ${right}px ${bottom}px ${rect.left}px)`;
}

/** The picture at `box`, as a transform from its place fitted whole on the screen (`whole`). */
function placeAt(box, whole) {
  const scale = box.width / whole.width;
  return `translate(${box.left}px, ${box.top}px) scale(${scale})`;
}

/** A layer over the whole screen, with the picture fitted whole on black. */
function createLayer(picture, rect) {
  const layer = document.createElement('div');
  layer.className = 'project-cover';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'top:0;left:0;width:100vw;height:100vh;overflow:hidden;';
  let whole = null;
  if (picture) {
    const ratio = picture.ratio || rect.width / rect.height;
    whole = fitBox(ratio, screenRect(), false);
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'sync';
    image.src = picture.src;
    image.style.cssText = `position:absolute;top:0;left:0;max-width:none;width:${whole.width}px;height:${whole.height}px;transform-origin:0 0;`;
    layer.append(image);
    whole.ratio = ratio;
  }
  return { layer, image: layer.querySelector('img'), whole };
}

/** Grows the picture in `source` to the screen. Resolves true when the next page can load. */
export function startEnterCover(source) {
  if (busy || reducedMotion.matches) return Promise.resolve(false);
  const rect = source.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return Promise.resolve(false);

  busy = true;
  carried?.remove();
  const { layer, image, whole } = createLayer(pictureIn(source), rect);
  // Outside <body>, so the router's swap leaves it in place.
  document.documentElement.append(layer);
  carried = layer;
  try {
    sessionStorage.setItem(
      ORIGIN_KEY,
      JSON.stringify({ top: rect.top, left: rect.left, width: rect.width, height: rect.height }),
    );
  } catch {
    // Leave can still run. It just will not shrink onto this picture.
  }
  const timing = { duration: COVER_MS, easing: EASING, fill: 'forwards' };
  const grow = layer.animate([{ clipPath: clipTo(rect) }, { clipPath: 'inset(0px 0px 0px 0px)' }], timing);
  if (image && whole) {
    const start = fitBox(whole.ratio, rect, true);
    image.animate([{ transform: placeAt(start, whole) }, { transform: placeAt(whole, whole) }], timing);
  }

  const done = settled(grow).then(() => {
    // The end state as plain styles: the swap or a background tab must not lose it.
    layer.style.clipPath = 'none';
    if (image && whole) image.style.transform = placeAt(whole, whole);
    layer.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
  });
  return Promise.race([wait(COVER_MS * LANDED), done]).then(() => {
    try {
      sessionStorage.setItem(ENTER_KEY, '1');
    } catch {
      // The project still opens. The image just will not wait to fade in.
    }
    busy = false;
    // Plain page loads (preview) lose the layer anyway; the project starts on black.
    return true;
  });
}

/** On the project page: the layer fades once the project's media is showing. */
function handOff() {
  const layer = carried;
  if (!layer?.isConnected) return;
  const project = document.querySelector('[data-project]');
  if (!project) {
    // Not a project after all (an error page, or the back button mid-way).
    carried = null;
    layer.remove();
    return;
  }
  const started = new Promise((resolve) => {
    if (project.hasAttribute('data-started')) {
      resolve();
      return;
    }
    const watch = new MutationObserver(() => {
      if (!project.hasAttribute('data-started')) return;
      watch.disconnect();
      resolve();
    });
    watch.observe(project, { attributes: true, attributeFilter: ['data-started'] });
    window.setTimeout(() => {
      watch.disconnect();
      resolve();
    }, HOLD_MAX_MS);
  });
  started
    .then(() => wait(PROJECT_FADE_MS))
    .then(() => {
      if (carried !== layer) return;
      const fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: HANDOFF_MS,
        easing: 'ease',
        fill: 'forwards',
      });
      return settled(fade, HANDOFF_MS);
    })
    .then(() => {
      if (carried !== layer) return;
      carried = null;
      layer.remove();
    });
}

document.addEventListener('astro:after-swap', () => {
  if (carried) handOff();
});

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

/** The project being left, while its cover is pending: the page puts its picture in place. */
export function leaveSlug() {
  try {
    return sessionStorage.getItem(LEAVE_KEY) || '';
  } catch {
    return '';
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

  document.querySelectorAll('.project-cover').forEach((held) => held.remove());

  if (!origin || origin.width < 2 || origin.height < 2) return Promise.resolve();

  const { layer } = createLayer(null, origin);
  document.body.append(layer);
  const animation = layer.animate([{ clipPath: 'inset(0px 0px 0px 0px)' }, { clipPath: clipTo(origin) }], {
    duration: COVER_MS,
    easing: EASING,
    fill: 'forwards',
  });
  return settled(animation).finally(() => layer.remove());
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

/** Shrinks the black from the whole screen onto the picture this Project came from, the
 *  picture fading in as it goes: opening, in reverse. */
export function playLeaveCover() {
  let slug = '';
  try {
    slug = sessionStorage.getItem(LEAVE_KEY) || '';
    sessionStorage.removeItem(LEAVE_KEY);
  } catch {
    return;
  }
  const held = document.querySelector('[data-cover-hold]');
  if (!slug || reducedMotion.matches || document.querySelector('[data-project]')) {
    held?.remove();
    return;
  }

  const source = leaveTarget(slug);
  const rect = source?.getBoundingClientRect();
  if (!rect || rect.width < 2 || rect.height < 2) {
    held?.remove();
    return;
  }

  const { layer, image, whole } = createLayer(pictureIn(source), rect);
  document.body.append(layer);
  // The held black came up before the first paint. The new layer is the same black.
  held?.remove();
  const timing = { duration: COVER_MS, easing: EASING, fill: 'forwards' };
  const shrink = layer.animate([{ clipPath: 'inset(0px 0px 0px 0px)' }, { clipPath: clipTo(rect) }], timing);
  if (image && whole) {
    const end = fitBox(whole.ratio, rect, true);
    image.animate([{ transform: placeAt(whole, whole) }, { transform: placeAt(end, whole) }], timing);
    image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: COVER_MS * 0.4, easing: 'ease-out', fill: 'backwards' });
  }
  settled(shrink).then(() => layer.remove());
}
