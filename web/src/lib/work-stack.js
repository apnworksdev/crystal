// Work stack maths: where each card sits, how it looks and how big it is. No DOM here, so
// it can be tested (work-stack.test.js). scripts/reel.js draws it.
//
// The card in front is sharp. Each card behind sits RISE pixels higher, more blurred and a
// little fainter. Moving on, the front card falls away in front of the pile and fades while
// the next one comes forward behind it. The position is continuous and endless: after the last card comes
// the first.

/** How far up each card behind sits, in pixels. */
export const RISE = 25;
/** How far a card that has passed drops, in pixels per step. */
export const DROP = 140;
/** Every card covers about this many square pixels, so shapes differ but weight stays even. */
export const CARD_AREA = 250000;
/** The largest card, before a big screen grows it. */
export const CARD_MAX_WIDTH = 650;
export const CARD_MAX_HEIGHT = 480;

// Blur and opacity at depth 0, 1, 2, … Between two depths the values blend.
const BLUR = [0, 2, 4, 8, 16, 16];
const OPACITY = [1, 1, 0.95, 0.9, 0.8];
const SHOWN_DEPTH = 5;

function at(values, depth) {
  const i = Math.min(values.length - 1, Math.floor(depth));
  const next = Math.min(values.length - 1, i + 1);
  return values[i] + (values[next] - values[i]) * (depth - i);
}

/** `value` wrapped into 0 … count - 1. */
export function wrapIndex(value, count) {
  return ((value % count) + count) % count;
}

/**
 * How deep card `index` is when the stack is at `position`: 0 in front, 1 just behind,
 * below 0 passing. A card is passing for one step only (it has faded out by then); then it
 * waits at the very back, depth count - 1, unseen (stackStyle), and fades in from there as
 * the next step brings it into the pile. Going back, the same in reverse.
 */
export function stackDepth(index, position, count) {
  if (count <= 1) return 0;
  let depth = wrapIndex(index - position, count);
  if (depth > count - 1) depth -= count;
  return depth;
}

/**
 * How a card at `depth` looks, in a stack of `count` cards (optional). It returns: `y` from the front card's top in pixels (up is negative),
 * blur in pixels, opacity, stacking order, and whether it has passed (passed cards never
 * catch a tap).
 */
export function stackStyle(depth, count = Infinity) {
  if (depth >= 0) {
    const opacity = depth <= 4 ? at(OPACITY, depth) : Math.max(0, 0.8 - (depth - 4) * 0.8);
    // The card waiting at the very back is unseen, and fades in as it takes the last place
    // of the pile (it appeared there at once before). Two cards: the other always shows.
    const arriving = count > 2 ? Math.max(0, Math.min(1, count - 1 - depth)) : 1;
    return {
      y: -Math.min(depth, SHOWN_DEPTH) * RISE + 0,
      blur: depth <= 1 ? 2 * depth : at(BLUR, depth),
      opacity: opacity * arriving,
      z: 1000 - Math.round(depth * 10),
      passed: false,
    };
  }
  // Passed: falls away and fades, above the card coming forward. Behind it (as the reference
  // has it) the front card vanished the instant scrolling started.
  return { y: -depth * DROP, blur: 0, opacity: Math.max(0, 1 + depth * 1.5), z: 1001, passed: true };
}

/** Big screens grow the cards past the 1440 × 1000 design size. */
export function stackGrow(width, height) {
  return Math.max(1, Math.min(width / 1440, height / 1000));
}

/**
 * Card size for a picture of `ratio` (width / height). Desktop: the same area for every
 * card, grown on big screens, never taller than `room`. Phone: as wide as the screen
 * allows (`width` less 79px), never taller than `room`. Widths are even, so a centred card
 * sits on whole pixels.
 */
export function cardSize(ratio, { phone = false, width = 1440, height = 1000, room = Infinity } = {}) {
  const shape = ratio > 0 && Number.isFinite(ratio) ? ratio : 16 / 9;
  let w = Math.sqrt(CARD_AREA * shape);
  let h = w / shape;
  if (w > CARD_MAX_WIDTH) {
    w = CARD_MAX_WIDTH;
    h = w / shape;
  }
  if (h > CARD_MAX_HEIGHT) {
    h = CARD_MAX_HEIGHT;
    w = h * shape;
  }
  const grow = phone ? 1 : stackGrow(width, height);
  const scale = Math.max(0, Math.min(grow, phone ? (width - 79) / w : grow, room / h));
  return { w: 2 * Math.round((w * scale) / 2), h: Math.round(h * scale) };
}

/** Desktop: the front card's top, in viewport pixels. On the 25px pitch above the header line. */
export function stackTop(width, height) {
  return Math.round(height / 2 - 12) - Math.round(8 * stackGrow(width, height)) * RISE;
}
