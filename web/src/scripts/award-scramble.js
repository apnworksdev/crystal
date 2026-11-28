// Awards: the pointer leaves a trail through the text, as on the studio's preview.
// Characters within RADIUS of the pointer turn into glyphs from a music alphabet (note
// names, b for flat, the dynamics p m f, numbers, - for rests) and flicker every FLICKER
// ms, then settle back a moment later; the closer ones stay scrambled longer. Mono type
// keeps every character the same width, so nothing moves. A tap scrambles a whole entry
// (phones have no pointer trail). Reduced motion: off.

export const GLYPHS = 'ABCDEFGABCDEFGbbpmf0123456789--';
export const RADIUS = 46;
export const FLICKER = 70;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const LINES = '.award__ceremony, .award__category, .award__work, .award__year';

const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

/**
 * Puts every character of each award line in its own span, with the plain text kept for
 * screen readers. Run before the list is copied for the loop, so the copies have them too.
 */
export function splitAwardText(root) {
  // Preview leaves these lines alone: click-to-edit hides invisible characters in them
  // (EDITABLE_FIELDS in lib/content.js), and a span each would break it.
  if (document.documentElement.classList.contains('is-preview')) return;
  root.querySelectorAll(LINES).forEach((line) => {
    if (line.querySelector('.award__char')) return;
    const text = line.textContent;
    const spoken = document.createElement('span');
    spoken.className = 'sr-only';
    spoken.textContent = text;
    const chars = document.createDocumentFragment();
    for (const ch of text) {
      const span = document.createElement('span');
      span.className = 'award__char';
      span.setAttribute('aria-hidden', 'true');
      span.dataset.c = ch;
      span.textContent = ch;
      chars.append(span);
    }
    line.replaceChildren(spoken, chars);
  });
}

/** Wires the trail to the scroller. Stops with `signal`. */
export function setUpScramble(scroller, signal) {
  const active = new Map();
  let loop = 0;

  const settleAll = () => {
    active.forEach((_, el) => (el.textContent = el.dataset.c));
    active.clear();
  };

  const tick = (now) => {
    if (document.hidden || !scroller.isConnected) {
      settleAll();
      loop = 0;
      return;
    }
    active.forEach((state, el) => {
      if (now >= state.until) {
        el.textContent = el.dataset.c;
        active.delete(el);
      } else if (now >= state.next) {
        el.textContent = glyph();
        state.next = now + FLICKER;
      }
    });
    loop = active.size ? requestAnimationFrame(tick) : 0;
  };

  const run = () => {
    if (!loop && active.size) loop = requestAnimationFrame(tick);
  };

  const scramble = (el, life, now) => {
    if (el.dataset.c === ' ') return;
    const state = active.get(el);
    if (state) state.until = Math.max(state.until, now + life);
    else {
      el.textContent = glyph();
      active.set(el, { until: now + life, next: now + FLICKER });
    }
  };

  scroller.addEventListener(
    'pointermove',
    (event) => {
      if (reducedMotion.matches || event.pointerType === 'touch') return;
      const now = performance.now();
      scroller.querySelectorAll('.award').forEach((award) => {
        const box = award.getBoundingClientRect();
        if (box.bottom < event.clientY - RADIUS || box.top > event.clientY + RADIUS) return;
        award.querySelectorAll('.award__char').forEach((el) => {
          const c = el.getBoundingClientRect();
          const d = Math.hypot(c.left + c.width / 2 - event.clientX, c.top + c.height / 2 - event.clientY);
          if (d > RADIUS) return;
          scramble(el, 250 + (1 - d / RADIUS) * 650 * Math.random(), now);
        });
      });
      run();
    },
    { signal, passive: true },
  );

  scroller.addEventListener(
    'click',
    (event) => {
      const award = event.target instanceof Element ? event.target.closest('.award') : null;
      if (!award || reducedMotion.matches) return;
      const now = performance.now();
      award.querySelectorAll('.award__char').forEach((el) => scramble(el, 300 + 600 * Math.random(), now));
      run();
    },
    { signal },
  );

  signal.addEventListener('abort', settleAll);
}
