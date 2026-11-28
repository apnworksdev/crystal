// Mirror page. The camera is shown through the fluted glass (fluted-glass.js), exactly as
// the project player's »« button shows a video: the microphone bends it as a soundtrack
// does there, and moves the logo (logo-motion.js).
// Only this page loads this file. It needs no page-transition setup, because the
// mirror page has no router.

import { createLevel, spectrumEnergy } from '../lib/sound-level.js';
import { MIC_PREAMP } from '../lib/wordmark.js';
import { createFlutedGlass } from './fluted-glass.js';
import { setLogoMic } from './logo-motion.js';

const root = document.querySelector('[data-mirror]');
const canvas = root.querySelector('[data-mirror-canvas]');
const video = root.querySelector('[data-mirror-video]');
const enterButton = root.querySelector('[data-mirror-enter]');
const status = root.querySelector('[data-mirror-status]');
const toggles = {
  audio: root.querySelector('[data-mirror-toggle="audio"]'),
  video: root.querySelector('[data-mirror-toggle="video"]'),
};

/* ---------- Glass ---------- */

let glass = null;

function setUpGL() {
  // Mirrored, as a mirror shows a face.
  glass ||= createFlutedGlass(canvas, { mirrored: true });
  return Boolean(glass);
}

/* ---------- Audio ---------- */

let audioContext;
let analyser;
let audioSource;
let preamp;

/**
 * Creates and starts the audio context. Must run straight from a click: Safari keeps
 * a context created later (after the permission prompt) silent.
 */
function unlockAudio() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume().catch(() => {});
  } catch {
    // No Web Audio. The camera still works, just without sound.
  }
}

function connectAudio(stream) {
  unlockAudio();
  if (!audioContext) return;
  // The logo (logo-motion.js) and the glass both listen. A raw phone mic is quiet, so a
  // preamp (+24 dB) lets soft speech move them while a quiet room stays still. Never sent
  // to the speakers.
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.5;
  audioSource = audioContext.createMediaStreamSource(stream);
  preamp = audioContext.createGain();
  preamp.gain.value = MIC_PREAMP;
  audioSource.connect(preamp);
  preamp.connect(analyser);
  // iOS can leave the context interrupted once the mic opens.
  if (audioContext.state !== 'running') audioContext.resume().catch(() => {});
  setLogoMic(analyser);
}

function disconnectAudio() {
  audioSource?.disconnect();
  preamp?.disconnect();
  audioSource = null;
  preamp = null;
  analyser = null;
  setLogoMic(null);
}

/* ---------- Loop ---------- */

let frame = 0;
// The canvas fades in only once it holds a camera frame, so it never fades in black.
let showing = false;

// The sound that bends the glass, as on a project: the mic, easing to still when it's off.
const level = createLevel();
let bins = null;

function micLevel() {
  if (!analyser) return level.quiet();
  if (bins?.length !== analyser.frequencyBinCount) bins = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(bins);
  return level.update(spectrumEnergy(bins, analyser.context.sampleRate));
}

function draw() {
  frame = requestAnimationFrame(draw);
  if (!glass || video.readyState < 2 || !video.videoWidth) return;
  glass.draw(video, { level: micLevel(), time: performance.now() / 1000 });
  if (!showing) {
    showing = true;
    render();
  }
}

function syncLoop() {
  const running = tracks.video || tracks.audio;
  if (running && !frame && !document.hidden) frame = requestAnimationFrame(draw);
  if ((!running || document.hidden) && frame) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

/* ---------- Devices ---------- */

const tracks = { audio: null, video: null };

function say(message) {
  status.textContent = message;
}

function render() {
  const on = Boolean(tracks.audio || tracks.video);
  root.dataset.state = on ? 'live' : 'idle';
  root.dataset.camera = tracks.video && showing ? 'on' : 'off';
  enterButton.hidden = on;
  toggles.audio.setAttribute('aria-pressed', String(Boolean(tracks.audio)));
  toggles.video.setAttribute('aria-pressed', String(Boolean(tracks.video)));
  syncLoop();
}

function stop(kind) {
  const track = tracks[kind];
  if (!track) return;
  track.stop();
  tracks[kind] = null;
  if (kind === 'audio') disconnectAudio();
  if (kind === 'video') {
    video.srcObject = null;
    showing = false;
  }
}

function attach(stream) {
  const [videoTrack] = stream.getVideoTracks();
  const [audioTrack] = stream.getAudioTracks();

  if (videoTrack) {
    if (!setUpGL()) {
      videoTrack.stop();
      say('This browser can’t draw the mirror.');
    } else {
      tracks.video = videoTrack;
      video.srcObject = new MediaStream([videoTrack]);
      video.play().catch(() => {});
      videoTrack.addEventListener('ended', () => {
        tracks.video = null;
        showing = false;
        render();
      });
    }
  }

  if (audioTrack) {
    tracks.audio = audioTrack;
    connectAudio(new MediaStream([audioTrack]));
    audioTrack.addEventListener('ended', () => {
      tracks.audio = null;
      disconnectAudio();
      render();
    });
  }
}

const CONSTRAINTS = {
  video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};

/** Asks for the devices that are off. If both were asked and one is refused, tries each alone. */
async function request(kinds) {
  if (!navigator.mediaDevices?.getUserMedia) {
    say('This browser can’t open the camera.');
    return;
  }
  // One request at a time: a second click while the browser is asking would open the device twice.
  if ('busy' in root.dataset) return;
  const wanted = kinds.filter((kind) => !tracks[kind]);
  if (!wanted.length) return;

  root.dataset.busy = '';
  try {
    const constraints = Object.fromEntries(wanted.map((kind) => [kind, CONSTRAINTS[kind]]));
    attach(await navigator.mediaDevices.getUserMedia(constraints));
  } catch {
    if (wanted.length > 1) {
      for (const kind of wanted) {
        try {
          attach(await navigator.mediaDevices.getUserMedia({ [kind]: CONSTRAINTS[kind] }));
        } catch {
          // Refused or missing. The other one may still work.
        }
      }
    }
    if (wanted.every((kind) => !tracks[kind])) {
      say('Camera and microphone access was refused. Allow it in the browser to enter.');
    }
  } finally {
    delete root.dataset.busy;
    render();
  }
}

function stopAll() {
  stop('audio');
  stop('video');
  render();
}

/* ---------- Controls ---------- */

enterButton.addEventListener('click', () => {
  unlockAudio();
  request(['video', 'audio']);
});

Object.entries(toggles).forEach(([kind, button]) => {
  button.addEventListener('click', () => {
    if (tracks[kind]) {
      stop(kind);
      render();
    } else {
      if (kind === 'audio') unlockAudio();
      request([kind]);
    }
  });
});

let leaving = false;

/**
 * The way out: the buttons sink and fade (the opening animation run backwards), the
 * camera image fades with them, then the page leaves. Resolves straight away with
 * reduced motion.
 */
function playLeave() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  const easing = 'cubic-bezier(0.7, 0, 0.84, 0)';
  const bar = root.querySelector('.mirror__bar');
  const canvas = root.querySelector('[data-mirror-canvas]');
  const fade = { duration: 350, easing, fill: 'forwards' };
  canvas.animate([{ opacity: getComputedStyle(canvas).opacity }, { opacity: 0 }], fade);
  const out = bar.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 8px' }], fade);
  return out.finished.catch(() => {});
}

function close() {
  if (leaving) return;
  leaving = true;
  playLeave().then(leave);
}

// The page it returns to shrinks this logo back into its header (mirror-trigger.js). The
// logo goes with it, as markup, so that page can show it before its own scripts run.
const RETURN_KEY = 'crystal-mirror-leave';

function handOverLogo() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const svg = root.querySelector('.mirror__logo svg')?.cloneNode(true);
  if (!svg) return;
  svg.setAttribute('style', 'display:block;width:100%;height:100%');
  try {
    sessionStorage.setItem(RETURN_KEY, svg.outerHTML);
  } catch {
    // Storage can be blocked. The page then opens without the way back.
  }
}

function leave() {
  stopAll();
  handOverLogo();
  let sameSite = false;
  try {
    sameSite = Boolean(document.referrer) && new URL(document.referrer).origin === location.origin;
  } catch {
    // A bad referrer just means going home.
  }
  if (sameSite && history.length > 1) history.back();
  else location.assign('/');
}

root.querySelector('[data-mirror-close]').addEventListener('click', close);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') close();
});

document.addEventListener('visibilitychange', syncLoop);

// Release the camera when leaving, and start clean if the page comes back from cache.
addEventListener('pagehide', stopAll);
addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  leaving = false;
  root.getAnimations({ subtree: true }).forEach((animation) => {
    if (animation instanceof CSSAnimation || animation instanceof CSSTransition) return;
    animation.cancel();
  });
  render();
});
