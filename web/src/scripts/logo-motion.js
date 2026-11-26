// Moves the wordmark in two places only, always from sound.
//
// Mirror page: the microphone. With no mic, or silence, the logo stays still.
// Project page: the video's own sound. A file video is measured directly. When the sound
// can't be heard (a Vimeo player lives in another site's frame, or a file's host won't
// share it), the letters move at random instead. Pausing, or reaching the end, holds the
// logo exactly as it is; playing again carries on from there. Leaving the project puts it
// back, since the header logo persists across pages.

import {
  bandLevels,
  createBandState,
  createRandomState,
  logoPath,
  parseLogoPath,
  randomLevels,
  widthsFor,
} from '../lib/logo-motion.js';

const HEADER = '.site-header__logo svg';
const MIRROR = '.mirror__logo svg';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

let letters = null;
let frame = 0;
let ctx = null;
let mic = null;
let media = null;
let bands = null;
let shown = null;
let sourceKind = '';
let random = null;
let lastTime = 0;
const nodes = new WeakMap();
const tapping = new WeakSet();

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

/** Opens the audio context during the click that starts a project, so a file video can be heard and measured. */
export function primeLogoAudio() {
  try {
    audio().resume().catch(() => {});
  } catch {
    // No Web Audio. The logo stays still.
  }
}

/** The mirror page already analyses the microphone. Pass that analyser, or null when it stops. */
export function setLogoMic(analyser) {
  mic = analyser || null;
  // Without the mic the logo eases back to rest; with it, it starts listening.
  startLogoMotion();
}

function onMirror() {
  return Boolean(document.querySelector('[data-mirror]'));
}

function marks() {
  return document.querySelectorAll(onMirror() ? MIRROR : HEADER);
}

function logoPaths() {
  return [...marks()].map((svg) => svg.querySelector('path')).filter(Boolean);
}

/** A project video that is actually playing. Vimeo reports that with data-playing. */
function playingProjectVideo() {
  const file = document.querySelector('[data-project-file]');
  if (file instanceof HTMLMediaElement) return !file.paused && !file.ended;
  const vimeo = document.querySelector('[data-project-vimeo]');
  return vimeo instanceof HTMLIFrameElement && vimeo.hasAttribute('data-playing');
}

/** A project page with a video: a paused or finished video holds the logo where it is. */
function holdsPose() {
  return !onMirror() && Boolean(document.querySelector('[data-project-file], [data-project-vimeo]'));
}

function settled() {
  return !shown || shown.every((level) => Math.abs(level) < 0.002);
}

/** The mirror while it hears the mic (or is easing back to rest), or a playing project video. */
function wantsMotion() {
  if (reduced.matches || document.hidden) return false;
  if (onMirror()) return Boolean(mic) || !settled();
  return playingProjectVideo();
}

function ensureLetters() {
  const paths = logoPaths();
  if (!paths.length) return letters;
  // Keep the drawn path, so the wordmark can be put back when the motion stops.
  const saved = paths.find((path) => path.dataset.rest)?.dataset.rest;
  if (!letters) letters = parseLogoPath(saved || paths[0].getAttribute('d') || '');
  if (!letters) return null;
  const rest = saved || paths[0].getAttribute('d') || '';
  for (const path of paths) {
    if (!path.dataset.rest) path.dataset.rest = rest;
  }
  return letters;
}

function restore() {
  for (const svg of document.querySelectorAll(`${HEADER}, ${MIRROR}`)) {
    const path = svg.querySelector('path');
    if (path?.dataset.rest) path.setAttribute('d', path.dataset.rest);
    svg.style.removeProperty('--logo-c');
  }
}

function cancel() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
}

function projectVideo() {
  const video = document.querySelector('[data-project-file]');
  if (!(video instanceof HTMLMediaElement)) return null;
  if (video.paused || video.ended || video.dataset.logoCors === 'failed') return null;
  return video;
}

function canTap(video) {
  if (video.dataset.logoCors === 'failed') return false;
  const raw = video.currentSrc || video.getAttribute('src');
  if (!raw) return false;
  let url;
  try {
    url = new URL(raw, location.href);
  } catch {
    return false;
  }
  if (url.origin === location.origin) return true;
  return video.crossOrigin === 'anonymous';
}

// Taking the audio over while the context is suspended would silence the video.
async function tap(video) {
  if (!video || nodes.has(video) || tapping.has(video) || !canTap(video)) return;
  tapping.add(video);
  try {
    const context = audio();
    await context.resume();
    if (context.state !== 'running' || !video.isConnected || nodes.has(video)) return;
    const source = context.createMediaElementSource(video);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.5;
    analyser.minDecibels = -90;
    analyser.maxDecibels = -24;
    source.connect(analyser);
    analyser.connect(context.destination);
    nodes.set(video, { source, analyser });
    media = video;
  } catch {
    video.dataset.logoCors = 'failed';
  } finally {
    tapping.delete(video);
  }
}

function releaseMedia() {
  if (!media || media.isConnected) return;
  try {
    nodes.get(media)?.source.disconnect();
  } catch {
    // Already gone with the page.
  }
  media = null;
}

const samples = new WeakMap();

/** One moment of sound: the spectrum, and how loud the waveform is (rmsDb). */
function sample(analyser, time) {
  let buffers = samples.get(analyser);
  if (!buffers || buffers.bins.length !== analyser.frequencyBinCount) {
    buffers = { bins: new Uint8Array(analyser.frequencyBinCount), wave: new Float32Array(analyser.fftSize) };
    samples.set(analyser, buffers);
  }
  const { bins, wave } = buffers;
  analyser.getByteFrequencyData(bins);
  analyser.getFloatTimeDomainData(wave);
  let sum = 0;
  for (let index = 0; index < wave.length; index += 1) sum += wave[index] * wave[index];
  const rms = Math.sqrt(sum / wave.length);
  return {
    bins,
    sampleRate: analyser.context.sampleRate,
    minDb: analyser.minDecibels,
    maxDb: analyser.maxDecibels,
    rmsDb: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
    time,
  };
}

function levels(time) {
  const count = letters.length;
  releaseMedia();
  const dt = lastTime ? time - lastTime : 0;
  lastTime = time;
  let kind;
  let video = null;
  if (onMirror()) kind = mic ? 'mic' : 'still';
  else {
    video = projectVideo();
    kind = video && nodes.has(video) ? 'video' : 'random';
  }
  if (kind !== sourceKind) {
    sourceKind = kind;
    bands = createBandState(count);
  }
  if (!shown || shown.length !== count) shown = Array(count).fill(0);
  if (!random || random.level.length !== count) random = createRandomState(count);

  let target;
  if (kind === 'mic') target = bandLevels(bands, sample(mic, time));
  else if (kind === 'video') target = bandLevels(bands, sample(nodes.get(video).analyser, time));
  else if (kind === 'random') target = randomLevels(random, dt);
  else target = Array(count).fill(0);

  for (let index = 0; index < count; index += 1) shown[index] += (target[index] - shown[index]) * 0.45;
  return shown;
}

function paint(now) {
  if (!letters) return;
  const widths = widthsFor(letters, levels(now / 1000));
  const d = logoPath(letters, widths);
  const c = `${widths[0].toFixed(2)}px`;
  for (const svg of marks()) {
    const path = svg.querySelector('path');
    if (path && path.getAttribute('d') !== d) path.setAttribute('d', d);
    // The phone header shows only the c, and clips to its rest width. Follow the
    // letter so the next one never peeks in. Desktop and the mirror ignore this.
    if (svg.closest('.site-header__logo')) svg.style.setProperty('--logo-c', c);
  }
}

/** Stops the motion. A paused project video holds the pose; anywhere else it goes back. */
function halt() {
  cancel();
  lastTime = 0;
  if (!holdsPose()) {
    restore();
    if (!onMirror()) shown = null;
  }
}

function tick(now) {
  if (!wantsMotion()) {
    frame = 0;
    halt();
    return;
  }
  frame = requestAnimationFrame(tick);
  paint(now);
}

export function startLogoMotion() {
  if (!wantsMotion()) {
    halt();
    return;
  }
  if (!ensureLetters()) return;
  if (frame) return;
  frame = requestAnimationFrame(tick);
}

function onPlay(event) {
  const video = event.target;
  if (!(video instanceof HTMLVideoElement) || !video.hasAttribute('data-project-file')) return;
  tap(video);
  startLogoMotion();
}

// Paused or finished: the logo holds where it is (see halt).
function onVideoStop(event) {
  const video = event.target;
  if (!(video instanceof HTMLVideoElement) || !video.hasAttribute('data-project-file')) return;
  if (!onMirror()) halt();
}

function onPointerDown() {
  ctx?.resume().catch(() => {});
  const video = projectVideo();
  if (video) tap(video);
}

// A file the CDN won't share can't be measured. Play it the ordinary way instead
// of leaving it blank. The logo then drifts, since the sound can't be read.
function onMediaError(event) {
  const video = event.target;
  if (!(video instanceof HTMLVideoElement) || !video.hasAttribute('data-project-file')) return;
  if (video.dataset.logoCors === 'failed' || !video.crossOrigin) return;
  video.dataset.logoCors = 'failed';
  const src = video.getAttribute('src');
  video.removeAttribute('crossorigin');
  video.crossOrigin = null;
  if (!src) return;
  video.removeAttribute('src');
  video.load();
  video.src = src;
  video.play().catch(() => {});
}

document.addEventListener('play', onPlay, true);
document.addEventListener('pause', onVideoStop, true);
document.addEventListener('ended', onVideoStop, true);
document.addEventListener('pointerdown', onPointerDown, true);
document.addEventListener('error', onMediaError, true);
document.addEventListener('visibilitychange', startLogoMotion);
// A new page starts from rest: a new project gets its own motion, and leaving one puts the logo back.
document.addEventListener('astro:after-swap', () => {
  cancel();
  restore();
  shown = null;
  random = null;
  sourceKind = '';
  lastTime = 0;
  startLogoMotion();
});
reduced.addEventListener('change', startLogoMotion);

startLogoMotion();
