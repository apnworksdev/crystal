// Three quick clicks on the header logo open the hidden mirror page, with a short
// transition (playEnter).
//
// On the home page the logo does nothing on its own (it would only reload the page),
// so every click there just counts. On other pages the first click goes home as usual,
// later clicks are swallowed so they don't start more navigations, and a third click
// leaves a note so the mirror opens as soon as the home page has arrived.
// The count lives in sessionStorage, so it survives full page loads in preview mode.

const WINDOW_MS = 700;
const COUNT_KEY = 'mirror-clicks';
const PENDING_KEY = 'mirror-pending';
const PENDING_MS = 5000;

let memory = { count: 0, at: 0 };

function read(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Storage can be blocked. Memory still works with page transitions.
  }
}

function countClick() {
  const now = Date.now();
  const stored = read(COUNT_KEY);
  const previous = stored ? { count: Number(stored.split(':')[0]), at: Number(stored.split(':')[1]) } : memory;
  const count = now - previous.at < WINDOW_MS ? previous.count + 1 : 1;
  memory = { count, at: now };
  write(COUNT_KEY, `${count}:${now}`);
  return count;
}

const onHome = () => location.pathname === '/';

const ENTER_MS = 700;
let opening = false;

/**
 * The way in: the page fades to white while the header logo grows into the big red
 * logo in the middle of the screen. It lands exactly where the mirror page draws its
 * logo (70vw wide, at most 1600px, centred), so the two pages meet without a jump.
 * Resolves when it has finished, straight away with reduced motion.
 */
function playEnter() {
  const mark = document.querySelector('.site-header__logo svg');
  if (!mark || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();

  const from = mark.getBoundingClientRect();
  const width = Math.min(innerWidth * 0.7, 1600);
  const height = (width * from.height) / from.width;
  const red = getComputedStyle(document.documentElement).getPropertyValue('--foreground-color').trim();
  const easing = 'cubic-bezier(0.7, 0, 0.2, 1)';

  const cover = document.createElement('div');
  cover.className = 'mirror-enter';
  cover.setAttribute('aria-hidden', 'true');
  Object.assign(cover.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    background: 'var(--background-color)',
    opacity: '0',
  });

  const logo = mark.cloneNode(true);
  logo.classList.add('mirror-enter');
  Object.assign(logo.style, {
    position: 'fixed',
    zIndex: '2147483647',
    margin: '0',
    color: getComputedStyle(mark).color,
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
  });

  document.body.append(cover, logo);
  cover.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ENTER_MS * 0.6, easing: 'ease', fill: 'forwards' });
  // Size and position rather than a transform, so the logo stays sharp as it grows.
  const grow = logo.animate(
    [
      { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` },
      {
        left: `${(innerWidth - width) / 2}px`,
        top: `${(innerHeight - height) / 2}px`,
        width: `${width}px`,
        height: `${height}px`,
        color: red,
      },
    ],
    { duration: ENTER_MS, easing, fill: 'forwards' },
  );
  return grow.finished.catch(() => {});
}

function openMirror() {
  if (opening) return;
  opening = true;
  memory = { count: 0, at: 0 };
  write(COUNT_KEY, null);
  write(PENDING_KEY, null);
  playEnter().then(() => location.assign('/mirror'));
}

// Coming back with the browser's back button can restore this page from memory as it was
// left, still covered. Take the cover away.
addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  opening = false;
  document.querySelectorAll('.mirror-enter').forEach((element) => element.remove());
});

function openIfPending() {
  const at = Number(read(PENDING_KEY));
  if (!at) return;
  write(PENDING_KEY, null);
  if (onHome() && Date.now() - at < PENDING_MS) openMirror();
}

document.addEventListener(
  'click',
  (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!event.target.closest?.('.site-header__logo')) return;

    const count = countClick();

    if (onHome()) {
      // Capture phase, so this runs before the page router sees the click.
      event.preventDefault();
      event.stopImmediatePropagation();
      if (count >= 3) openMirror();
      return;
    }

    if (count < 2) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (count >= 3) write(PENDING_KEY, String(Date.now()));
  },
  true,
);

openIfPending();
document.addEventListener('astro:after-swap', openIfPending);
