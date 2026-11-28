// The project page is a player. The site header slides down and becomes its bar.

import { formatTimecode } from '../lib/format.js';
import { containBox } from '../lib/fit.js';
import { prefetch } from 'astro:prefetch';
import { navigate } from 'astro:transitions/client';
import { leaveCoverShrink, markLeave, takeEnterCover } from './cover.js';
import { closeNav } from './header.js';
import { headerFlip } from './header-flip.js';
import { whenIntroDone } from './intro.js';
import { projectSound, startLogoMotion } from './logo-motion.js';
import { createLevel, spectrumEnergy } from '../lib/sound-level.js';
import { createFilePlayback, createVimeoPlayback } from './playback.js';
import { createWaveform, peaksFromMediaUrl, seededPeaks } from './waveform.js';

const IDLE_MS = 3000;
// The header travels to the bottom edge and becomes the player bar, and back, in step with
// the black cover (COVER_MS in cover.js): 1s on the opening expo-out. Change the two
// together. It used to take 300ms on a short ease, which read as a jump.
const MOVE_MS = 1000;
// Then the player bar opens out of the logo: once the move has visually landed on the
// expo-out (a little past half its length), over the shared grow duration (variables.css).
const EXPAND_DELAY_MS = MOVE_MS * 0.55;
const EXPAND_MS = 500;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const EASE_OUT = 'cubic-bezier(0.19, 1, 0.22, 1)';

let stop = () => {};
let arrival = '';
let headerSlide = 0;

const PLAYER_OUT_MS = 160;
let playerFade = null;

/** Fades the player bar out before a project is left, so it does not vanish in one frame. */
export function fadePlayerOut() {
  const player = document.querySelector('.site-header__player');
  if (!player || reducedMotion.matches || document.body.dataset.page !== 'project') return Promise.resolve();
  playerFade?.cancel();
  playerFade = player.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: PLAYER_OUT_MS,
    easing: 'ease-in',
    fill: 'forwards',
  });
  // A background tab may never start the animation. Leaving must not wait for it.
  return Promise.race([
    playerFade.finished.catch(() => {}),
    new Promise((resolve) => window.setTimeout(resolve, PLAYER_OUT_MS + 80)),
  ]);
}

/** The next page hides the player anyway. Drop the held fade so the next project starts clean. */
export function clearPlayerFade() {
  playerFade?.cancel();
  playerFade = null;
}

/** Where an in-site click came from. Read once on the next page. */
export function rememberSiteClick(pathname) {
  try {
    sessionStorage.setItem('crystal-from', pathname);
  } catch {
    // Storage can be blocked. Close will fall back to the work page.
  }
}

function takeArrival() {
  try {
    const from = sessionStorage.getItem('crystal-from') || '';
    sessionStorage.removeItem('crystal-from');
    return from;
  } catch {
    return '';
  }
}

/** Captures the header box so the next page can slide it, including a full load. */
export function rememberHeaderBox() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const box = header.getBoundingClientRect();
  const from = { top: box.top, left: box.left, width: box.width };
  try {
    sessionStorage.setItem('crystal-header-from', JSON.stringify(from));
  } catch {
    // The header still changes. It just will not slide.
  }
  header.dataset.flipTop = String(from.top);
  header.dataset.flipLeft = String(from.left);
  header.dataset.flipWidth = String(from.width);
}

function readHeaderFrom(header) {
  if (header.dataset.flipTop) {
    return {
      top: Number(header.dataset.flipTop),
      left: Number(header.dataset.flipLeft),
      width: Number(header.dataset.flipWidth),
    };
  }
  try {
    const raw = sessionStorage.getItem('crystal-header-from');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function slideHeader() {
  const header = document.querySelector('.site-header');
  const from = header ? readHeaderFrom(header) : null;
  try {
    sessionStorage.removeItem('crystal-header-from');
  } catch {
    // Already consumed, or storage is blocked.
  }
  if (!header || !from) return;

  const held = header.dataset.flipToTop;
  const to = held
    ? {
        top: Number(header.dataset.flipToTop),
        left: Number(header.dataset.flipToLeft),
        width: Number(header.dataset.flipToWidth),
      }
    : header.getBoundingClientRect();
  delete header.dataset.flipTop;
  delete header.dataset.flipLeft;
  delete header.dataset.flipWidth;
  delete header.dataset.flipToTop;
  delete header.dataset.flipToLeft;
  delete header.dataset.flipToWidth;
  header.classList.remove('is-arriving', 'is-leaving');
  const flip = headerFlip(from, to, document.body.dataset.page === 'project');
  if (reducedMotion.matches || !flip) {
    header.style.transform = '';
    header.style.transformOrigin = '';
    return;
  }

  const goingDown = to.top > from.top;
  header.classList.add(goingDown ? 'is-arriving' : 'is-leaving');
  const slide = ++headerSlide;
  const clear = () => {
    if (slide !== headerSlide) return;
    header.style.transform = '';
    header.style.transformOrigin = '';
    header.classList.remove('is-arriving', 'is-leaving');
    header.querySelectorAll('.site-header__player, .site-header__context, .site-header__toggle').forEach((piece) => {
      piece.getAnimations?.().forEach((animation) => animation.cancel());
      piece.style.opacity = '';
    });
  };

  const { start, rest } = flip;

  header.style.transformOrigin = 'left center';
  header.style.transform = start;
  const animation = header.animate(
    [
      { transform: start, transformOrigin: 'left center' },
      { transform: rest, transformOrigin: 'left center' },
    ],
    { duration: MOVE_MS, easing: EASE_OUT },
  );
  // Once the move ends the header must stay where it landed. The inline transform was the
  // start pose, and the player can still be opening: without this it flashed back to the
  // middle for a frame before clear() ran.
  header.style.transform = rest;
  // Arriving on a project: first the logo travels down, then, once it has landed, the player
  // bar opens out of it. One after the other reads as one gesture; together it was two at once.
  let grow = null;
  if (goingDown) {
    grow = header.querySelector('.site-header__player')?.animate(
      [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
      { duration: EXPAND_MS, delay: EXPAND_DELAY_MS, easing: EASE_OUT, fill: 'backwards', id: 'player-grow' },
    );
  }
  const total = grow ? Math.max(MOVE_MS, EXPAND_DELAY_MS + EXPAND_MS) : MOVE_MS;
  // A timer too: a background tab never finishes the animations.
  Promise.race([
    Promise.all([animation.finished, grow?.finished].map((done) => Promise.resolve(done).catch(() => {}))),
    new Promise((resolve) => window.setTimeout(resolve, total + 100)),
  ]).then(clear);
}

const HEADER_HOME_KEY = 'crystal-header-home';
const SLIDE_EASE = EASE_OUT;

/** Where the header sits before a project opens. Used to slide it back on a full page load. */
export function rememberHeaderHome() {
  const logo = document.querySelector('.site-header__logo');
  if (!logo) return;
  const box = logo.getBoundingClientRect();
  try {
    sessionStorage.setItem(
      HEADER_HOME_KEY,
      JSON.stringify({ top: box.top, left: box.left, width: box.width, height: box.height }),
    );
  } catch {
    // The header still moves down. The way back just will not slide.
  }
}

/** Fades everything except the logo bubble, so the bubble can move on its own. */
function hideHeaderExtras(header) {
  header.querySelectorAll('.site-header__context, .site-header__nav, .site-header__toggle, .site-header__player').forEach((piece) => {
    piece.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease', fill: 'forwards' });
  });
}

/** Slides the logo bubble down. The player appears on the project page. */
export function slideHeaderDown() {
  const header = document.querySelector('.site-header');
  const logo = header?.querySelector('.site-header__logo');
  if (!header || !logo || reducedMotion.matches) return Promise.resolve();
  const from = logo.getBoundingClientRect();
  // The player bar sits on the bottom edge, with no margin below it (project.css).
  const dy = window.innerHeight - from.height - from.top;
  hideHeaderExtras(header);
  header.classList.add('is-arriving');
  header.style.transformOrigin = 'left center';
  const animation = header.animate(
    [
      { transform: 'translate(0px, 0px) translateY(-50%)', transformOrigin: 'left center' },
      { transform: `translate(0px, ${dy}px) translateY(-50%)`, transformOrigin: 'left center' },
    ],
    { duration: MOVE_MS, easing: SLIDE_EASE, fill: 'forwards' },
  );
  return animation.finished.catch(() => {});
}

/** Slides the player bar back to the header box saved on the way in. */
export function slideHeaderHome() {
  const header = document.querySelector('.site-header');
  let home = null;
  try {
    home = JSON.parse(sessionStorage.getItem(HEADER_HOME_KEY) || 'null');
    sessionStorage.removeItem(HEADER_HOME_KEY);
  } catch {
    home = null;
  }
  if (!header || !home || reducedMotion.matches) return Promise.resolve();

  const logo = header.querySelector('.site-header__logo');
  if (!logo) return Promise.resolve();
  const from = logo.getBoundingClientRect();
  const dx = home.left - from.left;
  const dy = home.top - from.top;
  hideHeaderExtras(header);
  header.classList.add('is-leaving');
  header.style.transformOrigin = 'left center';
  const animation = header.animate(
    [
      { transform: 'translate(0px, 0px)', transformOrigin: 'left center' },
      { transform: `translate(${dx}px, ${dy}px)`, transformOrigin: 'left center' },
    ],
    { duration: MOVE_MS, easing: SLIDE_EASE, fill: 'forwards' },
  );
  return animation.finished.catch(() => {});
}

/** Waits out the open page morph so playback can land on a black frame. */
function whenViewTransitionsDone() {
  const animations = document.getAnimations().filter((animation) => {
    const pseudo = animation.effect?.pseudoElement;
    return typeof pseudo === 'string' && pseudo.includes('view-transition');
  });
  if (!animations.length) return Promise.resolve();
  return Promise.all(animations.map((animation) => animation.finished.catch(() => {})));
}

// How long a video may take to show its first frame before its poster covers the black.
const LOADING_POSTER_MS = 500;

// How long history.back() may take to start a page change before closing goes there directly.
const BACK_GRACE_MS = 700;

function goTo(path) {
  if (document.querySelector('[name="astro-view-transitions-enabled"]')) {
    navigate(path);
    return;
  }
  location.assign(path);
}

function leaveProject() {
  const target = arrival && arrival !== location.pathname ? arrival : '';
  arrival = '';
  if (!target || history.length < 2) {
    goTo('/work');
    return;
  }
  // The player is already gone, so the screen is black until the page changes. history.back()
  // can do nothing visible: on an iPhone the entry before can belong to the removed video
  // frame. If no page change has started soon, go to the page directly instead.
  const here = location.href;
  let moved = false;
  const onMove = () => {
    moved = true;
  };
  const events = ['popstate', 'pagehide'];
  document.addEventListener('astro:before-preparation', onMove, { once: true });
  events.forEach((type) => window.addEventListener(type, onMove, { once: true }));
  history.back();
  window.setTimeout(() => {
    document.removeEventListener('astro:before-preparation', onMove);
    events.forEach((type) => window.removeEventListener(type, onMove));
    if (moved || location.href !== here) return;
    goTo(target);
  }, BACK_GRACE_MS);
}

let shownPlaying = null;

function setPlayingMarks(playing) {
  if (shownPlaying === playing) return;
  shownPlaying = playing;
  document.querySelector('[data-project-vimeo]')?.toggleAttribute('data-playing', playing);
  // The icons are SVG, which has no hidden property: set the attribute itself.
  document.querySelectorAll('[data-icon="play"]').forEach((icon) => {
    icon.toggleAttribute('hidden', playing);
  });
  document.querySelectorAll('[data-icon="pause"]').forEach((icon) => {
    icon.toggleAttribute('hidden', !playing);
  });
  startLogoMotion();
}

/** The shared opening motion from variables.css, read once per opening. */
function sharedMotion() {
  const style = getComputedStyle(document.documentElement);
  const ms = (name, fallback) => {
    const raw = style.getPropertyValue(name).trim();
    const value = parseFloat(raw);
    if (!Number.isFinite(value)) return fallback;
    return raw.endsWith('ms') ? value : value * 1000;
  };
  return {
    ease: style.getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.19, 1, 0.22, 1)',
    grow: ms('--grow-duration', 500),
    fade: ms('--fade-duration', 300),
    textDelay: ms('--text-delay', 180),
  };
}

function cancelInfoMotion(player) {
  player
    ?.querySelectorAll('[data-player-name], [data-player-info] > *, [data-player-info-close], .site-header__slot')
    .forEach((node) => node.getAnimations?.().forEach((animation) => animation.cancel()));
}

function clearPlayerChrome(player) {
  if (!player) return;
  cancelInfoMotion(player);
  const name = player.querySelector('[data-player-name]');
  const infoHost = player.querySelector('[data-player-info]');
  const infoClose = player.querySelector('[data-player-info-close]');
  name?.removeAttribute('data-open');
  if (infoHost) {
    infoHost.hidden = true;
    infoHost.replaceChildren();
  }
  if (infoClose) infoClose.hidden = true;
  player.querySelector('[data-player-title]')?.setAttribute('aria-expanded', 'false');
}

export function setUpProject() {
  stop();
  slideHeader();

  const project = document.querySelector('[data-project]');
  const header = document.querySelector('.site-header');
  const player = header?.querySelector('[data-header-player]');

  const from = takeArrival();
  if (!project) {
    document.body.removeAttribute('data-player-idle');
    clearPlayerChrome(player);
    arrival = '';
    stop = () => {};
    return;
  }

  arrival = from;
  // Fetch the page that closing goes back to now, so closing does not wait on the network
  // with the player already gone. Prefetch on hover never happens on a phone.
  if (document.querySelector('[name="astro-view-transitions-enabled"]')) {
    prefetch(arrival && arrival !== location.pathname ? arrival : '/work', { ignoreSlowConnection: true });
  }
  shownPlaying = null;
  closeNav();

  const stage = project.querySelector('[data-project-hit]');
  const infoSource = project.querySelector('[data-project-info]');
  const cursor = project.querySelector('[data-project-cursor]');
  const title = project.querySelector('[data-project-title]')?.textContent?.trim() ?? '';
  const seed = project.querySelector('[data-project-title]')?.textContent?.trim() || location.pathname;
  const hasInfo = project.hasAttribute('data-has-info');
  const isVideo = project.dataset.kind === 'video';
  const controller = new AbortController();
  const { signal } = controller;

  let playback = null;
  let unsubscribe = null;
  let waveform = null;
  let idleTimer = 0;
  let dragging = false;
  let started = false;
  let duration = 0;
  let idleAtPointerDown = false;
  let pointerType = 'mouse';
  let playing = false;

  const name = player?.querySelector('[data-player-name]');
  const nameButton = player?.querySelector('[data-player-title]');
  const nameLabel = player?.querySelector('[data-player-label]');
  const infoHost = player?.querySelector('[data-player-info]');
  const infoClose = player?.querySelector('[data-player-info-close]');
  const seek = player?.querySelector('[data-player-seek]');
  const time = player?.querySelector('[data-player-time]');
  const seekLabel = player?.querySelector('.site-header__seek');
  const waveCanvas = player?.querySelector('[data-player-wave]');

  if (infoHost) {
    infoHost.replaceChildren();
    if (infoSource) infoHost.append(...infoSource.childNodes);
  }

  if (nameButton) {
    nameButton.hidden = !hasInfo;
    nameButton.textContent = title;
    nameButton.setAttribute('aria-expanded', 'false');
  }
  if (nameLabel) {
    nameLabel.hidden = hasInfo;
    nameLabel.textContent = title;
  }
  if (infoClose) infoClose.hidden = true;
  if (infoHost) infoHost.hidden = true;
  name?.removeAttribute('data-open');
  if (seekLabel) seekLabel.hidden = !isVideo;
  if (time) {
    time.hidden = !isVideo;
    time.textContent = formatTimecode(0);
  }
  if (seek) {
    seek.value = '0';
    seek.style.setProperty('--progress', '0%');
  }
  setPlayingMarks(false);

  if (isVideo && waveCanvas instanceof HTMLCanvasElement) {
    waveform = createWaveform(waveCanvas, seededPeaks(seed));
  }

  const fromCover = takeEnterCover();
  if (fromCover && !reducedMotion.matches) {
    header?.classList.add('is-arriving');
    // Clear leftover script fades, but keep the CSS player-in fade that is-arriving just started.
    player?.getAnimations?.().forEach((animation) => {
      if (typeof CSSAnimation !== 'undefined' && animation instanceof CSSAnimation) return;
      if (animation.id === 'player-grow') return;
      animation.cancel();
    });
    if (player) player.style.opacity = '';
    if (!isVideo) project.setAttribute('data-reveal', '');
    window.setTimeout(() => {
      if (signal.aborted) return;
      header?.classList.remove('is-arriving');
    }, MOVE_MS);
  }

  const slot = player?.querySelector('.site-header__slot');
  let infoOpen = false;
  let infoTurn = 0;

  // Where the title block and the slot after it sit, open or closed, relative to the bar.
  const measureInfo = (open) => {
    name.toggleAttribute('data-open', open);
    const base = player.getBoundingClientRect();
    const box = name.getBoundingClientRect();
    return {
      left: box.left - base.left,
      width: box.width,
      height: box.height,
      slot: slot ? parseFloat(getComputedStyle(slot).marginLeft) || 0 : 0,
      slotLeft: slot ? slot.getBoundingClientRect().left - base.left : 0,
    };
  };

  // The description grows up out of the title block and shrinks back into it, on the shared
  // expo-out. Its text fades in once the block has started to grow.
  const setInfoOpen = (open) => {
    if (!hasInfo || !nameButton || !name || !player) return;
    if (open === infoOpen) return;
    infoOpen = open;
    const turn = ++infoTurn;
    nameButton.setAttribute('aria-expanded', String(open));

    const animate = !reducedMotion.matches && name.isConnected;
    // Start from wherever the block is now, even halfway through the other direction.
    const now = animate ? name.getBoundingClientRect() : null;
    const base = animate ? player.getBoundingClientRect() : null;
    const slotNow = animate && slot ? slot.getBoundingClientRect().left - base.left : 0;
    cancelInfoMotion(player);

    if (!animate) {
      name.toggleAttribute('data-open', open);
      if (infoHost) infoHost.hidden = !open;
      if (infoClose) infoClose.hidden = !open;
      return;
    }

    const motion = sharedMotion();
    const from = { left: now.left - base.left, width: now.width, height: now.height };
    // Measured as it will rest: closed, the details are hidden and do not widen the title.
    if (infoHost) infoHost.hidden = !open;
    if (infoClose) infoClose.hidden = !open;
    const target = measureInfo(open);
    if (infoHost) infoHost.hidden = false;
    if (infoClose) infoClose.hidden = false;
    // Held open while it shrinks, so it stays out of the row until it is back to its size.
    name.setAttribute('data-open', '');
    // In the open layout the slot is the first control in the row, so its margin is its offset.
    const slotTo = open ? target.slot : target.slotLeft;

    const timing = { duration: motion.grow, easing: motion.ease };
    const grow = name.animate(
      [
        { left: `${from.left}px`, width: `${from.width}px`, height: `${from.height}px` },
        { left: `${target.left}px`, width: `${target.width}px`, height: `${target.height}px` },
      ],
      timing,
    );
    slot?.animate([{ marginLeft: `${slotNow}px` }, { marginLeft: `${slotTo}px` }], timing);

    // The details' contents fade, not the details block: it carries the background now
    // (header.css), which has to grow with the name.
    const text = [...(infoHost?.children ?? []), infoClose].filter(Boolean);
    text.forEach((node) => {
      node.animate(
        open ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }],
        {
          duration: motion.fade,
          delay: open ? motion.textDelay : 0,
          easing: 'ease',
          fill: 'both',
        },
      );
    });

    if (open) {
      grow.finished
        .then(() => {
          if (turn !== infoTurn) return;
          text.forEach((node) => node.getAnimations().forEach((animation) => animation.cancel()));
        })
        .catch(() => {});
      return;
    }

    const settle = () => {
      if (turn !== infoTurn || signal.aborted) return;
      cancelInfoMotion(player);
      name.removeAttribute('data-open');
      if (infoHost) infoHost.hidden = true;
      if (infoClose) infoClose.hidden = true;
    };
    // A background tab may never run the animation. The block must still close.
    grow.finished.then(settle).catch(() => {});
    window.setTimeout(settle, motion.grow + 80);
  };

  const wake = () => {
    document.body.removeAttribute('data-player-idle');
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      // Only a playing video hides the controls. Paused, stalled or not started, they
      // stay, so there is always a way to play or close.
      if (signal.aborted || !playing) return;
      // Never under a resting mouse: the controls would fade under it, and a click meant
      // for the x would land on the video. Moving away wakes and restarts this timer.
      if (player?.closest('.site-header')?.matches(':hover')) return;
      document.body.setAttribute('data-player-idle', '');
      if (cursor) cursor.hidden = true;
      stage?.classList.remove('is-cursor');
    }, IDLE_MS);
  };

  const poster = project.querySelector('[data-project-poster]');

  const showWaitingPoster = () => {
    if (started || !isVideo) return;
    project.setAttribute('data-waiting', '');
    poster?.removeAttribute('hidden');
  };

  // The »« button: the fluted glass (fluted-glass.js, the mirror page's effect) over the
  // video while it plays, bent a little by its sound. Shown on every video, off until clicked, and only downloaded then.
  // A file it can read is drawn through WebGL into the fx canvas, exactly as the mirror; a
  // Vimeo player, or a file it can't read, gets the glass's SVG filter.
  const fxButton = player?.querySelector('[data-player-fx]');
  const fxCanvas = project.querySelector('[data-project-fx]');
  let fx = null;
  let fxLoading = null;
  // The sound that bends the glass, the same one the logo follows. Paused, it eases to still.
  const fxLevel = createLevel();
  let fxBins = null;
  let fxFrame = -1;
  const getLevel = () => {
    // Once per frame, however many times it is asked.
    const frame = Math.round(performance.now() / 8);
    if (frame === fxFrame) return fxLevel.value;
    fxFrame = frame;
    const analyser = projectSound();
    if (!analyser) return fxLevel.quiet();
    if (fxBins?.length !== analyser.frequencyBinCount) fxBins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(fxBins);
    return fxLevel.update(spectrumEnergy(fxBins, analyser.context.sampleRate));
  };
  if (fxButton) {
    fxButton.hidden = !isVideo;
    fxButton.setAttribute('aria-pressed', 'false');
  }
  // WebGL over a file, frame by frame. Switches to the filter for good if the picture
  // turns out to be unreadable.
  const glassOver = (glass, file, makeFilter) => {
    let raf = 0;
    let fallback = null;
    let placed = '';
    // Over the picture only, not its black bars: the glass fills its canvas edge to edge,
    // so a canvas the size of the stage cropped the video and the framing jumped.
    const place = () => {
      if (!(fxCanvas instanceof HTMLElement)) return;
      const box = containBox(file.clientWidth, file.clientHeight, file.videoWidth, file.videoHeight);
      const key = `${box.left},${box.top},${box.width},${box.height}`;
      if (key === placed) return;
      placed = key;
      Object.assign(fxCanvas.style, {
        left: `${file.offsetLeft + box.left}px`,
        top: `${file.offsetTop + box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      });
    };
    const loop = () => {
      raf = document.hidden ? 0 : requestAnimationFrame(loop);
      place();
      if (glass.draw(file, { level: getLevel(), time: performance.now() / 1000 })) {
        if (file.videoWidth) project.setAttribute('data-fx', '');
        return;
      }
      cancelAnimationFrame(raf);
      raf = 0;
      project.removeAttribute('data-fx');
      glass.destroy();
      fallback = makeFilter();
      fallback.start();
    };
    const onVisible = () => {
      if (!document.hidden && on && !raf && !fallback) loop();
    };
    let on = false;
    document.addEventListener('visibilitychange', onVisible, { signal });
    return {
      start() {
        on = true;
        if (fallback) fallback.start();
        else if (!raf) loop();
      },
      stop() {
        on = false;
        cancelAnimationFrame(raf);
        raf = 0;
        project.removeAttribute('data-fx');
        fallback?.stop();
      },
      destroy() {
        this.stop();
        if (fallback) fallback.destroy();
        else glass.destroy();
      },
    };
  };
  const loadFx = () => {
    if (fx || fxLoading) return fxLoading ?? Promise.resolve(fx);
    const file = project.querySelector('[data-project-file]');
    const frame = file instanceof HTMLVideoElement ? file : project.querySelector('[data-project-vimeo]');
    if (!(frame instanceof HTMLElement)) return Promise.resolve(null);
    fxLoading = import('./fluted-glass.js')
      .then(({ createFlutedGlass, createFlutedGlassFilter }) => {
        if (signal.aborted) return null;
        const makeFilter = () => createFlutedGlassFilter(frame, { getLevel });
        const readable = file instanceof HTMLVideoElement && fxCanvas instanceof HTMLCanvasElement && file.dataset.logoCors !== 'failed';
        const glass = readable ? createFlutedGlass(fxCanvas) : null;
        fx = glass ? glassOver(glass, file, makeFilter) : makeFilter();
        return fx;
      })
      .catch(() => null)
      .finally(() => {
        fxLoading = null;
      });
    return fxLoading;
  };
  const syncFx = () => {
    if (!fxButton) return;
    const wanted = fxButton.getAttribute('aria-pressed') === 'true' && started;
    if (!fx) {
      if (wanted) loadFx().then((made) => made && !signal.aborted && syncFx());
      return;
    }
    if (wanted) fx.start();
    else fx.stop();
  };
  fxButton?.addEventListener(
    'click',
    () => {
      wake();
      fxButton.setAttribute('aria-pressed', String(fxButton.getAttribute('aria-pressed') !== 'true'));
      syncFx();
    },
    { signal },
  );

  const paint = (state) => {
    if (playing !== state.playing) {
      playing = state.playing;
      wake();
    }
    if (state.playing) {
      const first = !started;
      started = true;
      project.removeAttribute('data-waiting');
      poster?.setAttribute('hidden', '');
      if (first) syncFx();
    }
    duration = state.duration;
    project.toggleAttribute('data-started', started);
    setPlayingMarks(state.playing);
    if (!time) return;
    const ratio = duration ? state.current / duration : 0;
    if (dragging) return;
    if (seek) {
      seek.value = String(Math.round(ratio * 1000));
      seek.style.setProperty('--progress', `${ratio * 100}%`);
    }
    waveform?.setProgress(ratio);
    time.textContent = formatTimecode(state.current);
  };

  const mountPlayback = () => {
    if (playback || signal.aborted) return;
    const file = project.querySelector('[data-project-file]');
    const vimeo = project.querySelector('[data-project-vimeo]');
    if (file instanceof HTMLVideoElement) {
      if (file.dataset.src) file.src = file.dataset.src;
      playback = createFilePlayback(file);
      peaksFromMediaUrl(file.currentSrc || file.src).then((peaks) => {
        if (signal.aborted || !peaks) return;
        waveform?.setPeaks(peaks);
      });
    } else if (vimeo instanceof HTMLIFrameElement) {
      if (vimeo.dataset.src) vimeo.src = vimeo.dataset.src;
      playback = createVimeoPlayback(vimeo);
    }
    unsubscribe = playback?.subscribe(paint) ?? null;
  };

  const onStagePointer = (event) => {
    if (!isVideo || !finePointer.matches || !stage || !cursor) return;
    if (document.body.hasAttribute('data-player-idle')) {
      cursor.hidden = true;
      stage.classList.remove('is-cursor');
      return;
    }
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const onVideo = under && (under === stage || stage.contains(under));
    cursor.hidden = !onVideo;
    stage.classList.toggle('is-cursor', Boolean(onVideo));
    if (!onVideo) return;
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
  };

  stage?.addEventListener(
    'pointerdown',
    (event) => {
      pointerType = event.pointerType;
      idleAtPointerDown = document.body.hasAttribute('data-player-idle');
    },
    { signal },
  );

  stage?.addEventListener(
    'click',
    () => {
      const revealOnly = idleAtPointerDown && pointerType === 'touch';
      wake();
      if (revealOnly || !playback) return;
      playback.toggle();
    },
    { signal },
  );

  nameButton?.addEventListener(
    'click',
    () => {
      wake();
      setInfoOpen(nameButton.getAttribute('aria-expanded') !== 'true');
    },
    { signal },
  );

  infoClose?.addEventListener(
    'click',
    () => {
      wake();
      setInfoOpen(false);
    },
    { signal },
  );

  let leaving = false;
  player?.querySelector('[data-player-close]')?.addEventListener(
    'click',
    () => {
      // A second tap while leaving would start a second page change, to /work.
      if (leaving) return;
      leaving = true;
      const parts = location.pathname.split('/').filter(Boolean);
      const slug = parts[0] === 'projects' ? decodeURIComponent(parts[1] || '') : '';
      const routed = Boolean(document.querySelector('[name="astro-view-transitions-enabled"]'));
      playback?.destroy();
      playback = null;
      unsubscribe?.();
      unsubscribe = null;
      project.querySelectorAll('.project__frame, .project__poster').forEach((node) => node.remove());

      if (!slug || reducedMotion.matches) {
        leaveProject();
        return;
      }

      // Header, black cover, and the blank frame move together.
      if (!routed) {
        Promise.all([slideHeaderHome(), leaveCoverShrink()]).then(() => leaveProject());
        return;
      }

      markLeave(slug);
      rememberHeaderBox();
      fadePlayerOut().then(() => leaveProject());
    },
    { signal },
  );

  seek?.addEventListener(
    'pointerdown',
    () => {
      dragging = true;
      wake();
    },
    { signal },
  );
  seek?.addEventListener(
    'pointerup',
    () => {
      dragging = false;
    },
    { signal },
  );
  seek?.addEventListener(
    'input',
    () => {
      wake();
      const ratio = Number(seek.value) / 1000;
      seek.style.setProperty('--progress', `${ratio * 100}%`);
      waveform?.setProgress(ratio);
      if (time) time.textContent = formatTimecode(ratio * duration);
      playback?.seek(ratio);
    },
    { signal },
  );

  document.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch') return;
      wake();
      onStagePointer(event);
    },
    { signal },
  );

  // The button that last took focus from a press of the mouse or a finger, not the keyboard.
  let pressedByPointer = null;
  document.addEventListener(
    'pointerdown',
    (event) => {
      pressedByPointer = event.target instanceof Element ? event.target.closest('button') : null;
    },
    { signal, capture: true },
  );
  document.addEventListener(
    'focusin',
    (event) => {
      if (event.target !== pressedByPointer) pressedByPointer = null;
    },
    { signal },
  );

  document.addEventListener(
    'keydown',
    (event) => {
      wake();
      if (event.key === 'Escape') {
        event.preventDefault();
        // First the details, then the project itself, as its x does.
        if (name?.hasAttribute('data-open')) setInfoOpen(false);
        else player?.querySelector('[data-player-close]')?.click();
        return;
      }
      if (event.key !== ' ' && event.code !== 'Space') return;
      if (!playback) return;
      const target = event.target instanceof Element ? event.target : null;
      // A button clicked with the mouse keeps focus, and Space would press it again (the
      // »« button, the title). Only a button reached with the keyboard keeps Space for itself.
      const button = target?.closest('button');
      if (target?.closest('a, input:not([type="range"]), textarea')) return;
      if (button && button !== pressedByPointer) return;
      event.preventDefault();
      playback.toggle();
    },
    { signal },
  );

  stop = () => {
    window.clearTimeout(idleTimer);
    unsubscribe?.();
    playback?.destroy();
    fx?.destroy();
    waveform?.destroy();
    clearPlayerChrome(player);
    controller.abort();
  };

  whenIntroDone()
    .then(() => whenViewTransitionsDone())
    .then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    .then(() => {
      if (signal.aborted) return;
      if (!isVideo) {
        if (project.hasAttribute('data-reveal')) project.setAttribute('data-started', '');
        return;
      }
      mountPlayback();
      wake();
      if (!playback) return;
      // A file still downloading (a cold visit, a phone) left the screen black for seconds:
      // show the poster until the first frame plays, which hides it again.
      window.setTimeout(() => {
        if (!signal.aborted && !started) showWaitingPoster();
      }, LOADING_POSTER_MS);
      Promise.resolve(playback.play())
        .catch(() => {
          // The browser wants a fresh tap before sound (phones, mostly). A file video still
          // starts, muted, and its sound comes on with the next touch or key anywhere.
          const file = project.querySelector('[data-project-file]');
          if (!(file instanceof HTMLVideoElement)) throw new Error('blocked');
          file.muted = true;
          return file.play().then(() => {
            const unmute = () => {
              file.muted = false;
            };
            for (const type of ['pointerdown', 'keydown']) {
              document.addEventListener(type, unmute, { signal, once: true, capture: true });
            }
          });
        })
        .catch(() => {
          showWaitingPoster();
        })
        .then(() => {
          // Vimeo play is fire-and-forget; if nothing starts, fall back to the poster.
          window.setTimeout(() => {
            if (!signal.aborted && !started) showWaitingPoster();
          }, 1800);
        });
    });
}
