// Home project roulette. A plain row with a 1px gap. The centre stays full
// size. One step out is 75% of it, two steps out is 50%, and a taller or
// wider picture shrinks further so it stays smaller than the centre.

import EmblaCarousel from 'embla-carousel';
import { closeNav, setHeaderProject } from './header.js';

// Embla's duration is a physics constant, not milliseconds: lower is quicker.
// About 11 is a third of a second for one step.
const STEP_DURATION = 11;

// Wheel, trackpad and drag all feed one input, as on the reference site: every
// pixel moves the row the same share of a project there, then the row eases
// after it (about an eighth of a second to close most of the gap) and rests
// wherever it stops. No snap, so a single wheel notch is never pulled back.
// The reference row gives a centred project 598px at a 1000px tall window
// (a 915px wide one caps it), and a phone column one width (less 24px of
// gutters) of a 598 x 474 picture.
const REFERENCE_WIDTH = 598;
const REFERENCE_RATIO = 598 / 474;
const phone = matchMedia('(max-width: 48rem), (max-height: 30rem) and (pointer: coarse)');
// Embla's spring with almost no carry-over, so it closes about 13% of the gap a frame from the
// first frame on, as the reference's glide does. Embla's usual spring starts slower and felt heavy.
const FOLLOW_DURATION = 0.85;
const FOLLOW_FRICTION = 0.1;
// A Firefox wheel notch in lines comes out near Chrome's 100px.
const LINE_HEIGHT = 33;
// Letting go of a drag keeps its speed and loses 8% of it every 16ms.
const FLING_DECAY = 0.92;
const FLING_FRAME = 16;
// A touch that moves less than this stays a tap.
const TAP_DISTANCE = 8;

let embla;
let root;
let frontIndex = -1;
let pictureObserver;
let drag = null;
let fling = 0;
let swallowClick = false;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function snapDelta(snap, progress) {
  let delta = snap - progress;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return delta;
}

function stepsAway(index) {
  const count = embla.scrollSnapList().length;
  const raw = Math.abs(index - embla.selectedScrollSnap());
  return Math.max(1, Math.min(raw, count - raw));
}

function armScroll(steps) {
  // A longer jump eases a little longer, then caps.
  const duration = reducedMotion.matches ? 8 : Math.min(22, STEP_DURATION + (steps - 1) * 3);
  embla.internalEngine().options.duration = duration;
}

function projectLength() {
  if (phone.matches) return (innerWidth - 24) / REFERENCE_RATIO;
  return REFERENCE_WIDTH * Math.min(innerHeight / 1000, innerWidth / 915);
}

// Moves the row by pixels of the reference row. Positive goes to the next project.
function nudge(pixels) {
  if (!embla || !pixels) return;
  const engine = embla.internalEngine();
  const snaps = engine.scrollSnaps;
  const step = snaps.length > 1 ? Math.abs(snaps[1] - snaps[0]) : engine.containerRect.width;
  engine.scrollBody
    .useDuration(reducedMotion.matches ? 0 : FOLLOW_DURATION)
    .useFriction(FOLLOW_FRICTION);
  engine.scrollTo.distance((-pixels * step) / projectLength(), false);
}

function onWheel(event) {
  if (event.ctrlKey) return;
  event.preventDefault();
  closeNav();
  const unit = event.deltaMode === 1 ? LINE_HEIGHT : event.deltaMode === 2 ? innerHeight : 1;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  nudge(delta * unit);
}

// A dragged link would start the browser's own drag and cancel ours.
function onDragStart(event) {
  event.preventDefault();
}

function endDrag() {
  removeEventListener('pointermove', onPointerMove);
  removeEventListener('pointerup', onPointerUp);
  removeEventListener('pointercancel', onPointerUp);
  drag = null;
}

function onPointerDown(event) {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
  cancelAnimationFrame(fling);
  closeNav();
  swallowClick = false;
  drag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    lastTime: event.timeStamp,
    speed: 0,
    moved: false,
  };
  addEventListener('pointermove', onPointerMove);
  addEventListener('pointerup', onPointerUp);
  addEventListener('pointercancel', onPointerUp);
}

// The row follows the finger along whichever axis it moves most.
function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.id) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < TAP_DISTANCE) return;
  drag.moved = true;
  const dx = event.clientX - drag.lastX;
  const dy = event.clientY - drag.lastY;
  const delta = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
  const elapsed = Math.max(8, event.timeStamp - drag.lastTime);
  drag.speed = delta / elapsed;
  drag.lastX = event.clientX;
  drag.lastY = event.clientY;
  drag.lastTime = event.timeStamp;
  nudge(-delta);
}

function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const { moved, lastTime } = drag;
  // A finger held still before letting go has no speed left.
  let speed = event.timeStamp - lastTime > 100 ? 0 : drag.speed;
  endDrag();
  if (!moved) return;
  // The drag does not also count as a click on the picture under it.
  swallowClick = true;
  setTimeout(() => (swallowClick = false), 50);
  if (event.type === 'pointercancel' || reducedMotion.matches) return;

  let last = performance.now();
  const step = (now) => {
    const elapsed = Math.min(50, now - last);
    last = now;
    speed *= FLING_DECAY ** (elapsed / FLING_FRAME);
    if (Math.abs(speed * FLING_FRAME) < 0.5) return;
    nudge(-speed * elapsed);
    fling = requestAnimationFrame(step);
  };
  fling = requestAnimationFrame(step);
}

function scrollToProject(index) {
  armScroll(stepsAway(index));
  embla.scrollTo(index);
}

// A square fills both the width cap and the height cap, so it dominates.
// Portraits keep the tall cap. Anything clearly wide or tall stays full size.
function shapeScale(boxW, boxH) {
  if (!boxW || !boxH) return 1;
  const squareness = Math.max(0, 1 - Math.abs(Math.log(boxW / boxH)) / Math.log(1.45));
  return 1 - squareness * 0.28;
}

// Pull each picture until its painted edge is exactly 1px from the previous
// one. A fraction of a pixel otherwise rounds open, most visibly beside a
// narrow centre picture.
function tightenGaps(ordered) {
  if (ordered.length < 2) return;

  ordered.forEach((item) => {
    const rect = (item.picture || item.card).getBoundingClientRect();
    item.left = rect.left;
    item.right = rect.right;
  });

  let anchor = 0;
  ordered.forEach((item, index) => {
    if (Math.abs(item.units) < Math.abs(ordered[anchor].units)) anchor = index;
  });

  const move = (item, screenDelta) => {
    if (Math.abs(screenDelta) < 0.05) return;
    const moved = (item.left + item.right) / 2 - item.naturalCenter;
    const gain = Math.abs(item.shift) > 0.5 && Math.abs(moved) > 0.5 ? moved / item.shift : 1;
    item.shift += screenDelta / (Math.abs(gain) > 0.2 ? gain : 1);
    item.left += screenDelta;
    item.right += screenDelta;
    item.card.style.setProperty('--roulette-shift', `${item.shift.toFixed(3)}px`);
  };

  for (let index = anchor + 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    move(ordered[index], previous.right + 1 - ordered[index].left);
  }
  for (let index = anchor - 1; index >= 0; index -= 1) {
    const next = ordered[index + 1];
    move(ordered[index], next.left - 1 - ordered[index].right);
  }
}

function updateLevels(api) {
  const slides = api.slideNodes();
  const snaps = api.scrollSnapList();
  const progress = api.scrollProgress();
  if (!slides.length) return;

  const step = snaps.length > 1 ? Math.abs(snapDelta(snaps[1], snaps[0])) || 1 / snaps.length : 1;
  const poses = slides.map((_, index) => {
    const units = snapDelta(snaps[index], progress) / step;
    return { units, distance: Math.abs(units) };
  });

  let closest = 0;
  poses.forEach((pose, index) => {
    if (pose.distance < poses[closest].distance) closest = index;
  });

  // Hold the front card until the next one is clearly closer.
  if (frontIndex < 0 || frontIndex >= slides.length) frontIndex = closest;
  if (closest !== frontIndex && poses[closest].distance + 0.2 < poses[frontIndex].distance) {
    frontIndex = closest;
  }

  // Place cards from scroll progress, not from the slide box. Embla teleports
  // a looping slide while its picture is still on screen; progress does not
  // jump, so the picture keeps moving and the 1px gap stays.
  const viewRect = api.rootNode().getBoundingClientRect();
  const focusX = viewRect.left + viewRect.width / 2;

  const items = slides.map((slide, index) => {
    const { units, distance } = poses[index];
    const card = slide.querySelector('.project-roulette__card');
    const picture = card?.querySelector('img, video, iframe');
    const box = picture || card;
    return {
      slide,
      card,
      picture,
      index,
      units,
      distance,
      // Layout size ignores the scale transform, so this is the unscaled picture.
      boxW: box?.offsetWidth || 0,
      boxH: box?.offsetHeight || 0,
      shape: shapeScale(box?.offsetWidth || 0, box?.offsetHeight || 0),
      scale: 1,
      shift: 0,
      shown: false,
    };
  });

  const byDistance = items
    .filter((item) => item.card && item.boxW >= 2 && item.boxH >= 2)
    .sort((a, b) => a.units - b.units);
  let refH = 0;
  const crossing = byDistance.findIndex(
    (item, j) => j < byDistance.length - 1 && item.units <= 0 && byDistance[j + 1].units >= 0,
  );
  if (crossing >= 0) {
    const left = byDistance[crossing];
    const right = byDistance[crossing + 1];
    const span = right.units - left.units;
    const t = span === 0 ? 0 : -left.units / span;
    refH = left.boxH * left.shape + (right.boxH * right.shape - left.boxH * left.shape) * t;
  } else if (byDistance.length) {
    const nearest = byDistance.reduce((best, item) =>
      Math.abs(item.units) < Math.abs(best.units) ? item : best,
    );
    refH = nearest.boxH * nearest.shape;
  }

  items.forEach((item) => {
    // One step out is 75% of the centre, two steps out is 50%.
    // Wide pictures may be wider than a square centre. A side picture still
    // may not be taller than the centre.
    const step = Math.max(0.5, 1 - item.distance * 0.25);
    const height = item.boxH * item.shape;
    const fitH = height > 0 && refH > 0 ? refH / height : 1;
    item.scale = step * Math.min(1, fitH) * item.shape;
  });

  items.forEach((item) => {
    if (!item.card) return;
    item.card.style.setProperty('--roulette-scale', item.scale.toFixed(4));
    item.card.style.setProperty('--roulette-shift', '0px');
  });

  items.forEach((item) => {
    if (!item.card) return;
    const rect = (item.picture || item.card).getBoundingClientRect();
    item.visual = rect.width;
    item.naturalCenter = rect.left + rect.width / 2;
  });

  // A picture with no size yet must not join the row. Several of those were
  // packed on the same spot, then grew on top of each other once they loaded.
  const ordered = items
    .filter((item) => item.card && item.boxW >= 2 && item.boxH >= 2)
    .sort((a, b) => a.units - b.units);
  if (ordered.length) {
    const packed = new Array(ordered.length);
    packed[0] = ordered[0].visual / 2;
    for (let j = 1; j < ordered.length; j += 1) {
      packed[j] = packed[j - 1] + ordered[j - 1].visual / 2 + 1 + ordered[j].visual / 2;
    }

    let focusPacked = packed[0];
    const straddle = ordered.findIndex(
      (item, j) => j < ordered.length - 1 && item.units <= 0 && ordered[j + 1].units >= 0,
    );
    if (straddle >= 0) {
      const left = ordered[straddle];
      const right = ordered[straddle + 1];
      const span = right.units - left.units;
      const t = span === 0 ? 0 : -left.units / span;
      focusPacked = packed[straddle] + t * (packed[straddle + 1] - packed[straddle]);
    } else {
      let nearest = 0;
      ordered.forEach((item, j) => {
        if (Math.abs(item.units) < Math.abs(ordered[nearest].units)) nearest = j;
      });
      focusPacked = packed[nearest];
    }

    // Every card that reaches the screen shows, and one more each side, ready to come in.
    // (A fixed 2.4 steps out left the edge empty on a wide screen, or mid-step.)
    ordered.forEach((item, j) => {
      const center = focusX + (packed[j] - focusPacked);
      item.shift = center - item.naturalCenter;
      const reach = item.visual * 1.5;
      item.shown = center + reach > viewRect.left && center - reach < viewRect.right;
    });
  }

  items.forEach((item) => {
    const inFront = item.index === frontIndex;

    // Paint order only. Slides do not cover each other.
    item.slide.style.zIndex = String(Math.round((3 - item.distance) * 10));
    item.slide.classList.toggle('is-active', inFront);

    if (!item.card) return;
    item.card.style.visibility = item.shown ? '' : 'hidden';
    item.card.style.setProperty('--roulette-shift', `${item.shift.toFixed(2)}px`);
    item.card.tabIndex = inFront ? 0 : -1;
    // Copies are only there to fill the loop: read out only when one is the card in front.
    if (item.slide.hasAttribute('data-roulette-copy')) item.slide.toggleAttribute('aria-hidden', !inFront);
  });

  // The first placement is in ideal pixels. A narrow centre picture leaves a
  // wide empty slide, so a fraction of a pixel of rounding opens a visible
  // seam. Measure the painted edges and pull each neighbour back to 1px.
  tightenGaps(ordered.filter((item) => item.shown));
}

function onSlideClick(event) {
  if (!embla || !root) return;
  const link = event.target.closest('[data-roulette-link]');
  if (!link || !root.contains(link)) return;
  if (swallowClick) {
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const slide = link.closest('.project-roulette__slide');
  const index = embla.slideNodes().indexOf(slide);
  if (index < 0 || index === frontIndex) return;

  event.preventDefault();
  event.stopPropagation();
  closeNav();
  scrollToProject(index);
}

function onKeyDown(event) {
  if (!embla || !root) return;
  if (event.target instanceof HTMLElement) {
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;
  }

  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    closeNav();
    armScroll(1);
    embla.scrollPrev();
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    closeNav();
    armScroll(1);
    embla.scrollNext();
  }
}

// Copies of the projects, so the flat row Embla loops is about this many screens wide.
// The row is drawn squeezed towards the middle, so a slide Embla thinks is off screen can
// still show at the edge: with too few, it moved across while visible and left a gap.
const ROW_SCREENS = 4;
const MAX_SETS = 12;
let copyVideos;

/** Repeats the projects, whole sets at a time, until the row is wide enough to loop unseen. */
function fillRow(viewport) {
  const track = viewport.querySelector('.project-roulette__track');
  if (!track) return false;
  const originals = [...track.children].filter((slide) => !slide.hasAttribute('data-roulette-copy'));
  const setWidth = originals.reduce((sum, slide) => sum + slide.offsetWidth, 0);
  if (!originals.length || setWidth < 1) return false;
  const need = ROW_SCREENS * Math.max(viewport.clientWidth, 1);
  let sets = track.children.length / originals.length;
  let added = false;
  while (setWidth * sets < need && sets < MAX_SETS) {
    originals.forEach((slide) => {
      const copy = slide.cloneNode(true);
      copy.setAttribute('data-roulette-copy', '');
      track.append(copy);
      // page.js only starts the videos that were there on arrival.
      copy.querySelectorAll('video[data-autoplay]').forEach((video) => copyVideos?.observe(video));
    });
    sets += 1;
    added = true;
  }
  return added;
}

export function setUpRoulette() {
  if (root) {
    root.removeEventListener('wheel', onWheel);
    const oldViewport = root.querySelector('.project-roulette__viewport');
    oldViewport?.removeEventListener('pointerdown', onPointerDown);
    oldViewport?.removeEventListener('dragstart', onDragStart);
  }
  endDrag();
  cancelAnimationFrame(fling);

  embla?.destroy();
  embla = undefined;
  copyVideos?.disconnect();
  copyVideos = reducedMotion.matches
    ? undefined
    : new IntersectionObserver(
        (entries) => entries.forEach(({ target, isIntersecting }) => (isIntersecting ? target.play().catch(() => {}) : target.pause())),
        { rootMargin: '200px' },
      );
  pictureObserver?.disconnect();
  pictureObserver = undefined;
  frontIndex = -1;
  root = document.querySelector('[data-roulette]');
  // Home shows the pictures alone, so no project title sits in the header.
  setHeaderProject(null);
  if (!root) return;

  const viewport = root.querySelector('.project-roulette__viewport');
  if (!viewport) return;

  fillRow(viewport);
  embla = EmblaCarousel(
    viewport,
    {
      loop: true,
      align: 'center',
      containScroll: false,
      duration: reducedMotion.matches ? 8 : STEP_DURATION,
      // Drag and wheel go through nudge(), like the reference site.
      watchDrag: false,
    },
  );

  const paint = () => updateLevels(embla);

  embla.on('init', paint);
  embla.on('reInit', paint);
  embla.on('scroll', paint);
  embla.on('select', paint);
  embla.on('settle', paint);
  // Image load changes the picture size without moving Embla, so measure again.
  // Ignore repeat reports of the same size, or a paint would schedule another.
  const pictureSizes = new Map();
  pictureObserver = new ResizeObserver((entries) => {
    let changed = false;
    entries.forEach((entry) => {
      const box = entry.borderBoxSize?.[0];
      const width = box ? box.inlineSize : entry.contentRect.width;
      const height = box ? box.blockSize : entry.contentRect.height;
      const key = `${Math.round(width)}x${Math.round(height)}`;
      if (pictureSizes.get(entry.target) === key) return;
      pictureSizes.set(entry.target, key);
      changed = true;
    });
    if (changed && embla) updateLevels(embla);
  });
  root.querySelectorAll('.project-roulette__media :is(img, video, iframe)').forEach((picture) => {
    pictureObserver.observe(picture);
  });
  // Not passive: the wheel would otherwise also scroll or zoom the page. Only on Home.
  root.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('dragstart', onDragStart);
  paint();
  // The row stays hidden until Embla has placed the slides, so it never shows unarranged.
  root.dataset.ready = '';
}

// A wider window needs a longer row: add sets and let Embla measure again.
window.addEventListener('resize', () => {
  const viewport = root?.isConnected ? root.querySelector('.project-roulette__viewport') : null;
  if (viewport && embla && fillRow(viewport)) {
    embla.reInit();
    root.querySelectorAll('[data-roulette-copy] .project-roulette__media :is(img, video, iframe)').forEach((picture) => pictureObserver?.observe(picture));
  }
});

document.addEventListener('click', onSlideClick, true);
document.addEventListener('keydown', onKeyDown);
