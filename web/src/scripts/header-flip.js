/** The transform that holds the header at its old position, then releases it. */
export function headerFlip(from, to, projectPage) {
  if (Math.abs(from.top - to.top) + Math.abs(from.left - to.left) < 2) return null;

  const shift = `translate(${from.left - to.left}px, ${from.top - to.top}px)`;
  const center = projectPage ? '' : ' translateY(-50%)';
  return {
    start: shift + center,
    rest: `translate(0px, 0px)${center}`,
  };
}
