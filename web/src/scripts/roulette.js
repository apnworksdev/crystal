// Home project roulette. A plain row with a 1px gap. The centre stays full
// size. One step out is 75% of it, two steps out is 50%, and a taller or
// wider picture shrinks further so it stays smaller than the centre.

import EmblaCarousel from 'embla-carousel';
import { WheelGesturesPlugin } from 'embla-carousel-wheel-gestures';
import { closeNav, setHeaderProject } from './header.js';

let embla;
let root;
let frontIndex = -1;
let titledIndex = -1;
let pictureObserver;
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
  // Embla's duration is a physics constant, not milliseconds. 15 is about
  // half a second; a longer jump eases a little longer, then caps.
  const duration = reducedMotion.matches ? 8 : Math.min(28, 15 + (steps - 1) * 4);
  embla.internalEngine().options.duration = duration;
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
    .filter((item) => item.card && item.distance <= 2.4 && item.boxW >= 2 && item.boxH >= 2)
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

    ordered.forEach((item, j) => {
      const center = focusX + (packed[j] - focusPacked);
      item.shift = center - item.naturalCenter;
    });
  }

  items.forEach((item) => {
    const inFront = item.index === frontIndex;

    // Paint order only. Slides do not cover each other.
    item.slide.style.zIndex = String(Math.round((3 - item.distance) * 10));
    item.slide.classList.toggle('is-active', inFront);

    if (!item.card) return;
    item.card.style.visibility = item.distance > 2.4 ? 'hidden' : '';
    item.card.style.setProperty('--roulette-shift', `${item.shift.toFixed(2)}px`);
    item.card.tabIndex = inFront ? 0 : -1;
  });

  // The first placement is in ideal pixels. A narrow centre picture leaves a
  // wide empty slide, so a fraction of a pixel of rounding opens a visible
  // seam. Measure the painted edges and pull each neighbour back to 1px.
  tightenGaps(ordered);

  if (frontIndex !== titledIndex) {
    titledIndex = frontIndex;
    const slide = slides[frontIndex];
    if (slide) {
      setHeaderProject({
        title: slide.dataset.title,
        slug: slide.dataset.slug,
      });
    }
  }
}

function onSlideClick(event) {
  if (!embla || !root) return;
  const link = event.target.closest('[data-roulette-link]');
  if (!link || !root.contains(link)) return;

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

function onInteract() {
  closeNav();
}

export function setUpRoulette() {
  if (root) {
    root.removeEventListener('pointerdown', onInteract);
    root.removeEventListener('wheel', onInteract);
  }

  embla?.destroy();
  embla = undefined;
  pictureObserver?.disconnect();
  pictureObserver = undefined;
  frontIndex = -1;
  titledIndex = -1;
  root = document.querySelector('[data-roulette]');

  if (!root) {
    setHeaderProject(null);
    return;
  }

  const viewport = root.querySelector('.project-roulette__viewport');
  if (!viewport) return;

  embla = EmblaCarousel(
    viewport,
    {
      loop: true,
      align: 'center',
      skipSnaps: true,
      containScroll: false,
      duration: reducedMotion.matches ? 8 : 15,
    },
    // Vertical wheel and trackpad drive the strip. Drag still scrubs sideways.
    [WheelGesturesPlugin({ forceWheelAxis: 'y' })],
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
  root.addEventListener('pointerdown', onInteract);
  root.addEventListener('wheel', onInteract, { passive: true });
  paint();
}

document.addEventListener('click', onSlideClick, true);
document.addEventListener('keydown', onKeyDown);
