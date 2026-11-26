// About, Team and News windows (desktop): dragging a window's bottom edge makes it taller or
// shorter. The windows are centred on the header row, so they grow up and down together and
// the edge stays under the pointer. No grip element: the bottom few pixels of each window
// show a resize cursor and start the drag. Sizes are set inline and kept until the page
// reloads (News frames reset when the window is resized, to stay on screen).

const EDGE = 8;
const MIN_HEIGHT = 120;
const MIN_FRAME = 60;
const BOXES = [
  '.site-header[data-about] .about-panel__copy',
  '.site-header[data-about] .about-panel__team',
  '.site-header[data-news] .news-panel:not([hidden])',
].join(', ');
// Same query as the phone blocks in the stylesheets. Phone windows take turns full size.
const phone = matchMedia('(max-width: 48rem), (max-height: 30rem) and (pointer: coarse)');

let drag = null;
let hovered = null;
let swallowClick = false;

function boxAt(event) {
  if (phone.matches || event.pointerType === 'touch' || !(event.target instanceof Element)) return null;
  const box = event.target.closest(BOXES);
  if (!box) return null;
  const { bottom } = box.getBoundingClientRect();
  return event.clientY <= bottom && bottom - event.clientY <= EDGE ? box : null;
}

function isNews(box) {
  return box.matches('.news-panel');
}

function newsFrames(box) {
  return [...box.querySelectorAll('.news-panel__image')];
}

function maxHeight(box) {
  if (!isNews(box)) return box.parentElement?.clientHeight || window.innerHeight;
  const side = box.closest('.site-header')?.getBoundingClientRect().left ?? 16;
  return window.innerHeight - Math.max(16, side) * 2;
}

function setHover(box) {
  if (box === hovered) return;
  if (hovered) hovered.style.cursor = '';
  hovered = box;
  if (box) box.style.cursor = 'ns-resize';
}

function onPointerDown(event) {
  if (event.button !== 0) return;
  const box = boxAt(event);
  if (!box) return;
  // Before the header's own listeners, so the press does not count as a click inside.
  event.preventDefault();
  event.stopPropagation();
  const height = box.getBoundingClientRect().height;
  const frame = isNews(box) ? newsFrames(box).find((element) => !element.hidden) : null;
  drag = {
    box,
    y: event.clientY,
    height,
    frame: frame?.getBoundingClientRect().height ?? 0,
    max: maxHeight(box),
    moved: false,
  };
  document.documentElement.style.cursor = 'ns-resize';
  document.documentElement.style.userSelect = 'none';
}

function onPointerMove(event) {
  if (!drag) {
    setHover(boxAt(event));
    return;
  }
  const dy = event.clientY - drag.y;
  if (Math.abs(dy) > 2) drag.moved = true;
  const height = Math.min(drag.max, Math.max(MIN_HEIGHT, drag.height + dy * 2));
  const { box } = drag;
  if (isNews(box)) {
    // News is as tall as its picture frame. The frame takes the change; the picture covers it.
    const frame = Math.max(MIN_FRAME, drag.frame + height - drag.height);
    newsFrames(box).forEach((element) => {
      element.style.aspectRatio = 'auto';
      element.style.height = `${frame}px`;
    });
    return;
  }
  box.style.height = `${height}px`;
  box.style.maxHeight = '100%';
}

function onPointerUp() {
  if (!drag) return;
  swallowClick = drag.moved;
  drag = null;
  document.documentElement.style.cursor = '';
  document.documentElement.style.userSelect = '';
  // A click that never comes (released outside a window) must not swallow the next one.
  window.setTimeout(() => {
    swallowClick = false;
  }, 0);
}

function onClick(event) {
  if (!swallowClick) return;
  swallowClick = false;
  event.preventDefault();
  event.stopPropagation();
}

function onResize() {
  document.querySelectorAll('.news-panel__image[style]').forEach((element) => {
    element.style.removeProperty('aspect-ratio');
    element.style.removeProperty('height');
  });
}

// Capture on window: runs before the header's document listeners.
window.addEventListener('pointerdown', onPointerDown, true);
window.addEventListener('pointermove', onPointerMove, { passive: true });
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);
window.addEventListener('click', onClick, true);
window.addEventListener('resize', onResize);
