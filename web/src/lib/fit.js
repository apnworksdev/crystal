/**
 * Where a picture of `width`×`height` shows inside a `boxWidth`×`boxHeight` box with
 * `object-fit: contain`: centred, whole, with bars above and below or at the sides.
 * The project player's »« glass is drawn over exactly this part, so its framing matches
 * the letterboxed video. Zero sizes give the whole box.
 */
export function containBox(boxWidth, boxHeight, width, height) {
  if (!(boxWidth > 0 && boxHeight > 0 && width > 0 && height > 0)) {
    return { left: 0, top: 0, width: Math.max(0, boxWidth || 0), height: Math.max(0, boxHeight || 0) };
  }
  // The side that fills the box is taken as is, so it never comes out a hair off.
  const wide = boxWidth / width <= boxHeight / height;
  const w = wide ? boxWidth : (width * boxHeight) / height;
  const h = wide ? (height * boxWidth) / width : boxHeight;
  return { left: (boxWidth - w) / 2, top: (boxHeight - h) / 2, width: w, height: h };
}

/**
 * The project player's picture box on a `width`×`height` screen (project.css): `margin`
 * around it, no wider than `maxWidth`, and the `bar` (flush at the bottom) plus a margin kept free.
 */
export function stageBox(width, height, { margin = 20, bar = 24, maxWidth = Infinity } = {}) {
  const side = Math.max(margin, (width - maxWidth) / 2);
  const top = margin;
  const bottom = bar + margin;
  return { left: side, top, width: Math.max(0, width - side * 2), height: Math.max(0, height - top - bottom) };
}
