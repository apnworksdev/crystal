// Merch pile: each product sits behind the one in front, 4px more blurred and
// 10% bigger. Four products show at once; the fifth fades in at the back as the
// front one leaves. Scrolling fades, blurs and lifts the front one; the next one
// loses blur and shrinks to full size.

const BLUR_STEP = 4;
const SCALE_STEP = 0.1;
export const VISIBLE = 4;

/** Style for one place in the pile. `slot` 0 is the front; `local` is 0–1 through the step. */
export function merchStackStyle(slot, local) {
  if (slot === 0) {
    const leave = local * local;
    return {
      opacity: 1 - leave,
      blur: leave * 10,
      shift: local === 0 ? 0 : -local * 44,
      scale: 1,
    };
  }

  const depth = Math.max(0, slot - local);
  let opacity = 1;
  if (slot === VISIBLE) opacity = local;
  else if (slot > VISIBLE) opacity = 0;

  return {
    opacity,
    blur: depth * BLUR_STEP,
    shift: 0,
    scale: 1 + depth * SCALE_STEP,
  };
}
