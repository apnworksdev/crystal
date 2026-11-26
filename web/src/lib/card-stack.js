// Card stack, shared by the Work stack and the merch pile. The front card is sharp. Each
// card behind sits a little higher, more blurred and a little fainter, so the pile reads as depth. Scrolling moves through it: the next
// card comes forward while the one in front leaves, growing slightly, blurring and dropping
// away as it fades. The position is continuous, so every card is always somewhere between
// two places, never switched. It loops: after the last card comes the first.

/** How far up each card behind sits, in pixels. */
export const DEPTH_RISE = 25;
/** How far a leaving card drops, in pixels, as it goes. */
export const LEAVE_DROP = 140;
/** How much a leaving card grows as it goes. */
export const LEAVE_GROW = 0.08;
/** Cards deeper than this are not drawn. */
export const VISIBLE_DEPTH = 5;

// Blur and opacity at depth 0, 1, 2, … Between two depths the values blend.
const BLUR = [0, 2, 4, 8, 16, 16];
const OPACITY = [1, 1, 0.95, 0.9, 0.8];

function at(values, depth) {
  const i = Math.min(values.length - 1, Math.floor(depth));
  const next = Math.min(values.length - 1, i + 1);
  return values[i] + (values[next] - values[i]) * (depth - i);
}

/**
 * Where card `index` sits when the stack is at `position` (0 is the first card in front,
 * 1.5 is halfway from the second card to the third). 0 is in front, 1 is just behind it,
 * and below 0 the card is leaving. The stack wraps, so the first card follows the last.
 *
 * The card in front has half a step to leave (0 to -0.5). For the other half it is back
 * at the far end of the pile (count - 0.5 to count - 1), fading in there, so at rest every
 * card is in the pile and none appears at once.
 */
export function depthOf(index, position, count) {
  if (count <= 1) return index - position;
  let depth = (((index - position) % count) + count) % count;
  if (depth > count - 0.5) depth -= count;
  return depth;
}

/**
 * Style for a card at `depth` in a pile of `count`: rise and drop in pixels (up is
 * negative), blur, opacity, scale and order.
 */
export function cardStackStyle(depth, reducedMotion = false, count = Infinity) {
  if (depth >= 0) {
    const shown = Math.min(depth, VISIBLE_DEPTH);
    let opacity = depth <= 4 ? at(OPACITY, depth) : Math.max(0, 0.8 - (depth - 4) * 0.8);
    if (depth > VISIBLE_DEPTH) opacity = 0;
    // Fading in at the far end, having just left the front.
    if (count > 1) opacity *= Math.max(0, Math.min(1, (count - 0.5 - depth) * 2));
    return {
      y: shown ? -shown * DEPTH_RISE : 0,
      blur: depth <= 1 ? 2 * depth : at(BLUR, depth),
      opacity,
      scale: 1,
      z: 1000 - Math.round(depth * 10),
    };
  }

  // Leaving, over half a step: drops away, fades, and blurs and grows a little as it goes.
  const gone = Math.min(1, -depth * 2);
  return {
    y: reducedMotion ? 0 : gone * LEAVE_DROP,
    blur: gone * gone * 10,
    opacity: Math.max(0, 1 - gone),
    scale: reducedMotion ? 1 : 1 + LEAVE_GROW * gone,
    z: 1001,
  };
}
