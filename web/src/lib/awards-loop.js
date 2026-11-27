// Maths for the Awards roll (scripts/awards.js). No DOM, so it can be tested in Node.

/**
 * The loop is a copy, the list, then more copies. Keeping the scroll position inside the
 * list itself, [listHeight, 2 × listHeight), leaves a copy above to scroll up into and one
 * below to scroll down into. Every position outside maps to the one that looks the same.
 */
export function wrapIntoList(top, listHeight) {
  if (!(listHeight >= 1)) return top;
  const offset = (((top - listHeight) % listHeight) + listHeight) % listHeight;
  return listHeight + offset;
}

/** How many copies must follow the list so the screen never runs past the end. */
export function copiesAfter(listHeight, viewportHeight) {
  if (!(listHeight >= 1)) return 1;
  return Math.max(1, Math.ceil(viewportHeight / listHeight));
}

/**
 * Which entry sits at `centre`. `rows` are the entries of every copy, in order, as
 * { top, height } from the top of the track; `count` is the number in one list. Returns the
 * entry's index within its list, so any copy maps back to the original. Between two
 * entries (in the gap), the nearer one wins. Returns -1 when there are no rows.
 */
export function centredIndex(rows, centre, count) {
  if (!rows.length || count < 1) return -1;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const { top, height } = rows[i];
    if (centre >= top && centre < top + height) {
      best = i;
      break;
    }
    const distance = Math.min(Math.abs(centre - top), Math.abs(centre - (top + height)));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best % count;
}
