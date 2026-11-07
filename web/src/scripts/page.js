// Runs on the first load and again after each page transition.

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let observer;

/** Looping videos only download and play while they're on screen. */
function setUpVideos() {
  observer?.disconnect();
  if (reducedMotion.matches) return;

  observer = new IntersectionObserver(
    (entries) => {
      for (const { target, isIntersecting } of entries) {
        if (isIntersecting) target.play().catch(() => {});
        else target.pause();
      }
    },
    { rootMargin: '200px' },
  );
  document.querySelectorAll('video[data-autoplay]').forEach((video) => observer.observe(video));
}

/** Shows the popup once per browser session. */
function showPopup() {
  const dialog = document.querySelector('dialog[data-popup-key]');
  if (!dialog) return;

  const storageKey = `popup:${dialog.dataset.popupKey}`;
  try {
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, '1');
  } catch {
    // Storage can be blocked. Showing the popup again is fine.
  }

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.showModal();
}

function setUpPage() {
  setUpVideos();
  showPopup();
}

/** Loads Vimeo's player only when someone clicks play, to keep pages light. */
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-vimeo-player]');
  if (!button) return;

  const frame = document.createElement('iframe');
  frame.className = 'video-frame';
  frame.src = button.dataset.vimeoPlayer;
  frame.title = 'Video player';
  frame.allow = 'autoplay; fullscreen; picture-in-picture';
  frame.allowFullscreen = true;
  button.replaceWith(frame);
  frame.focus();
});

setUpPage();
document.addEventListener('astro:after-swap', setUpPage);
