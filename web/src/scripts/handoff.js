// A page that carries its own motion into the next one, instead of the content fading out
// and in (page.js). Merch and a product hand over to each other: opening a product, the
// front product of the pile becomes the middle picture and the others slide in from the
// sides; closing it plays the same in reverse (merch-reel.js, product-strip.js).
//
// The leaving page calls handOff with where it is going and a promise for its own leave
// motion. page.js then waits on that instead of fading the content, and does not fade the
// new page in. The arriving page takes the details in its setup.

let pending = null;
const path = (pathname) => pathname.replace(/\/+$/, '') || '/';

/** The leaving page plays its own motion to `to` (a pathname). `ready` settles when it is done. */
export function handOff(to, details, ready) {
  pending = { to: path(to), details, ready: Promise.resolve(ready).catch(() => {}) };
}

/** page.js: the leaving page's own motion, or null when the content should fade as usual. */
export function handoffLeave() {
  return pending ? pending.ready : null;
}

/** A navigation is starting: forgets a hand-off that was meant for somewhere else. */
export function checkHandoff(to) {
  if (pending && pending.to !== path(to)) pending = null;
}

/** The arriving page: the details the leaving page left for it, once. */
export function takeHandoff() {
  if (!pending || pending.to !== path(location.pathname)) {
    pending = null;
    return null;
  }
  const { details } = pending;
  pending = null;
  return details;
}
