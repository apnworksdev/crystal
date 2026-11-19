# The header flip runs before paint

When a full page load opens, the header has to be held at its old position before the first paint, or it flashes in the new one. A module runs too late for that, so the hold stays an inline script in the layout. That script and the animation after the page is ready both use one calculation. The script does not keep a second copy.
