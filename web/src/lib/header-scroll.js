/**
 * The header's sideways offset, kept between 0 (at rest) and how far it overflows,
 * in whole pixels so text stays sharp.
 */
export function clampShift(value, overflow) {
  const max = Math.max(0, Math.round(overflow) || 0);
  return Math.min(max, Math.max(0, Math.round(value) || 0));
}
