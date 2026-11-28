// Moves the wordmark (wordmark.js) from sound, in two places:
//
// Project page: the header logo moves while the video plays. When its sound can be read (a
// file its host shares), C and R follow the bass, Y, S and T the mids, A and L the treble.
// When it can't (a Vimeo player lives in another site's frame, or a file's host won't share
// it), a stand-in sound moves them (lib/sound-level.js). The »« glass bends with the same
// sound (projectSound). Pausing, or reaching the end, stops the logo where it is; playing
// again carries on from there. Leaving the project puts it back.
// Mirror page: the microphone (mirror.js hands over its analyser).

import { createRandomSpectrum } from '../lib/sound-level.js';
import { createWordmark } from './wordmark.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');

let ctx = null;
let header = null;
let mirror = null;
let media = null;
const nodes = new WeakMap();
const tapping = new WeakSet();

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

/** The header logo's wordmark. The header persists across pages, so it is made once. */
export function headerWordmark() {
  const canvas = document.querySelector('.site-header__logo [data-wordmark]');
  if (!canvas) return null;
  if (header?.canvas !== canvas) {
    header?.destroy();
    header = createWordmark(canvas);
    canvas.closest('.site-header__logo')?.setAttribute('data-wordmark-ready', '');
  }
  return header;
}

function mirrorWordmark() {
  const canvas = document.querySelector('.mirror__logo [data-wordmark]');
  if (!canvas) return null;
  if (mirror?.canvas !== canvas) {
    mirror?.destroy();
    mirror = createWordmark(canvas, { inner: 1 });
    canvas.closest('.mirror__logo')?.setAttribute('data-wordmark-ready', '');
  }
  return mirror;
}

/** Opens the audio context during the click that starts a project, so a file video can be heard and measured. */
export function primeLogoAudio() {
  try {
    audio().resume().catch(() => {});
  } catch {
    // No Web Audio. The logo plays the wave instead.
  }
}

/** The mirror page analyses the microphone. Pass that analyser, or null when it stops. */
export function setLogoMic(analyser) {
  const mark = mirrorWordmark();
  if (!mark) return;
  if (analyser && !reduced.matches) mark.setMode('mic', analyser);
  else mark.setMode('rest');
}

/** A project video that is actually playing. Vimeo reports that with data-playing. */
function playingProjectVideo() {
  const file = document.querySelector('[data-project-file]');
  if (file instanceof HTMLMediaElement) return !file.paused && !file.ended ? file : null;
  const vimeo = document.querySelector('[data-project-vimeo]');
  return vimeo instanceof HTMLIFrameElement && vimeo.hasAttribute('data-playing') ? vimeo : null;
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
    source.connect(analyser);
    analyser.connect(context.destination);
    nodes.set(video, { source, analyser });
    media = video;
  } catch {
    video.dataset.logoCors = 'failed';
  } finally {
    tapping.delete(video);
  }
  startLogoMotion();
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

function onProject() {
  return Boolean(document.querySelector('[data-project-file], [data-project-vimeo]'));
}

let standIn = null;

/** An analyser-shaped stand-in for a sound that can't be heard. */
function standInAnalyser() {
  if (!standIn) {
    const source = createRandomSpectrum();
    standIn = {
      frequencyBinCount: 1024,
      minDecibels: -100,
      maxDecibels: -30,
      context: { sampleRate: source.sampleRate },
      getByteFrequencyData(bins) {
        source.fill(bins, performance.now() / 1000);
      },
    };
  }
  return standIn;
}

/** The sound the logo follows: the video's own when it can be read, otherwise the stand-in. */
function projectAnalyser(playing) {
  const node = playing instanceof HTMLVideoElement ? nodes.get(playing) : null;
  return node ? node.analyser : standInAnalyser();
}

/**
 * The sound the »« glass bends with: the same one the logo follows while the video plays,
 * or null when it is paused or hasn't started, so the glass settles with the logo.
 */
export function projectSound() {
  const playing = playingProjectVideo();
  return playing ? projectAnalyser(playing) : null;
}

/** Matches the header logo to what the project's video is doing. */
export function startLogoMotion() {
  const mark = headerWordmark();
  if (!mark) return;
  releaseMedia();
  if (reduced.matches || !onProject()) {
    if (mark.mode !== 'rest') mark.setMode('rest');
    return;
  }
  const playing = playingProjectVideo();
  if (!playing) {
    // Paused or finished: the logo stops where it is.
    if (mark.mode === 'audio') mark.hold();
    return;
  }
  mark.setMode('audio', projectAnalyser(playing));
}

function onPlay(event) {
  const video = event.target;
  if (!(video instanceof HTMLVideoElement) || !video.hasAttribute('data-project-file')) return;
  tap(video);
  startLogoMotion();
}

function onVideoStop(event) {
  const video = event.target;
  if (!(video instanceof HTMLVideoElement) || !video.hasAttribute('data-project-file')) return;
  startLogoMotion();
}

function onPointerDown() {
  ctx?.resume().catch(() => {});
  const video = playingProjectVideo();
  if (video instanceof HTMLVideoElement) tap(video);
}

// A file the CDN won't share can't be measured. Play it the ordinary way instead of
// leaving it blank. The logo then plays the wave, since the sound can't be read.
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
// A new page starts from rest: a new project gets its own motion, and leaving one puts the logo back.
document.addEventListener('astro:after-swap', () => {
  // A page can change the colours (the Archive's test): the letters take the new one.
  headerWordmark()?.recolour();
  headerWordmark()?.reset();
  startLogoMotion();
});
reduced.addEventListener('change', startLogoMotion);

// The mirror page has no header: its own wordmark waits, still, for the mic.
if (document.querySelector('[data-mirror]')) mirrorWordmark()?.redraw();
startLogoMotion();
