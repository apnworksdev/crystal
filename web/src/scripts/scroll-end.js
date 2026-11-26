// Calls `callback` when a scroller stops moving. Uses the browser's scrollend event where it
// exists. Safari does not fire it, so there a short pause in scroll events counts as the end:
// without this the Work stack, the merch pile and the product strip never settled on Safari,
// and stopped halfway between two pictures.

const NATIVE = typeof window !== 'undefined' && 'onscrollend' in window;
// Momentum scrolling sends events every frame, so a pause this long means it has stopped.
const PAUSE_MS = 140;

/** Starts watching `element`. Returns a function that stops watching. */
export function watchScrollEnd(element, callback) {
  if (NATIVE) {
    element.addEventListener('scrollend', callback);
    return () => element.removeEventListener('scrollend', callback);
  }
  let timer = 0;
  const onScroll = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(callback, PAUSE_MS);
  };
  element.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    window.clearTimeout(timer);
    element.removeEventListener('scroll', onScroll);
  };
}
