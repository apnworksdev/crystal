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

// Moving by hand (the merch pile, a product's pictures): input sets a target and one frame
// loop eases toward it, so a burst of fast scrolling only moves the target further.

/**
 * One frame of easing from `from` toward `to`, `elapsed` milliseconds long. Following a
 * target that stands still, it traces the shared expo-out (--ease-out) over `duration`.
 */
export function follow(from, to, elapsed, duration) {
  if (!(duration > 0) || !(elapsed > 0)) return elapsed > 0 ? to : from;
  return to - (to - from) * 2 ** ((-10 * elapsed) / duration);
}

/**
 * How far card `index` is from `position` on a loop of `count` cards, the short way
 * round: from -count / 2 up to (not including) count / 2.
 */
export function loopOffset(index, position, count) {
  if (count <= 0) return 0;
  return ((((index - position + count / 2) % count) + count) % count) - count / 2;
}

/** The pile behind an open product: how much more it blurs, and how much of it fades. */
export const OPEN_BLUR = 20;
export const OPEN_FADE = 1;

/** An even ease in and out, so a fade is seen to happen (the expo-out was a cut on phone). */
function evenEase(t) {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}

/**
 * A pile card's style while a product opens over it: `progress` runs evenly in time from 0
 * (the merch pile) to 1 (the product's pictures in front, the pile gone).
 */
export function openPileStyle(style, progress) {
  const open = evenEase(progress);
  return {
    ...style,
    blur: style.blur + OPEN_BLUR * open,
    opacity: style.opacity * (1 - OPEN_FADE * open),
  };
}

// Thrown by hand (a product's pictures): letting go of a drag hands its speed to a spring
// that carries on at that speed and settles on a picture, so nothing jumps when the finger lifts.

/**
 * One step of a critically damped spring pulling `offset` (from where it rests) to 0 at
 * `omega` per millisecond, `elapsed` milliseconds long. Exact for any step, so a slow frame
 * never overshoots. Returns the new offset and velocity (per millisecond).
 */
export function spring(offset, velocity, omega, elapsed) {
  if (!(elapsed > 0)) return { offset, velocity };
  const decay = Math.exp(-omega * elapsed);
  const lead = velocity + omega * offset;
  return {
    offset: (offset + lead * elapsed) * decay,
    velocity: (velocity - omega * lead * elapsed) * decay,
  };
}

/**
 * Where a throw lands and how stiff the spring that carries it is. `position` and `velocity`
 * (per millisecond) are in pictures; the throw would coast `coastMs` times its speed, and it
 * lands on the nearest whole picture to that, at most `maxLead` pictures away. `omega` is the
 * spring's usual stiffness. A real throw gets a softer spring that leaves at the finger's
 * speed, only slows from there and never runs past the picture.
 */
export function throwTo(position, velocity, coastMs, omega, maxLead = Infinity) {
  let target = Math.round(position + velocity * coastMs);
  target = Math.max(Math.round(position) - maxLead, Math.min(Math.round(position) + maxLead, target));
  let distance = target - position;
  if (!velocity || velocity * distance <= 0 || !distance) return { target, omega };
  // Leaving at this speed, a spring of stiffness w runs past the picture unless the distance is at
  // least speed / w, and speeds up first unless it is at most 2 × speed / w: the middle is 1.5.
  let stiffness = Math.min(omega, Math.max(omega / 4, (1.5 * velocity) / distance));
  if (Math.abs(velocity) / stiffness > Math.abs(distance) && Math.abs(target - Math.round(position)) < maxLead) {
    // Too fast to stop in time: the next picture on.
    target += Math.sign(velocity);
    distance = target - position;
    stiffness = Math.min(omega, Math.max(omega / 4, (1.5 * velocity) / distance));
  }
  return { target, omega: stiffness };
}
