// Waveform peaks for the project scrubber. File audio when the browser allows it;
// otherwise a stable pattern seeded by the project.

const BAR_COUNT = 96;

// Reading the real waveform means downloading the whole file a second time and decoding all
// of its audio. Only worth it for short clips. Anything bigger keeps the seeded pattern.
const MAX_PEAK_BYTES = 8 * 1024 * 1024;

/** The file size from a HEAD request, or 0 when the server does not say. */
async function fileSize(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) return 0;
    return Number(response.headers.get('content-length')) || 0;
  } catch {
    return 0;
  }
}

function hashSeed(text) {
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 0–1 peak list for a project. */
export function seededPeaks(seed, count = BAR_COUNT) {
  const random = mulberry32(hashSeed(String(seed || 'crystal')));
  const peaks = [];
  let previous = 0.2;
  for (let index = 0; index < count; index += 1) {
    const spike = random() > 0.92 ? 0.55 : 0;
    const next = previous * 0.5 + random() * 0.55 + spike;
    previous = Math.min(1, Math.max(0, next));
    peaks.push(previous);
  }
  return peaks;
}

/** Builds peaks from a small same-origin or CORS-open audio/video URL. Null for big files. */
export async function peaksFromMediaUrl(url, count = BAR_COUNT) {
  if (!url || typeof AudioContext === 'undefined') return null;

  const size = await fileSize(url);
  if (!size || size > MAX_PEAK_BYTES) return null;

  const context = new AudioContext();
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const channel = buffer.getChannelData(0);
    const block = Math.max(1, Math.floor(channel.length / count));
    const peaks = [];
    for (let index = 0; index < count; index += 1) {
      const start = index * block;
      let max = 0;
      for (let sample = start; sample < start + block && sample < channel.length; sample += 1) {
        const value = Math.abs(channel[sample]);
        if (value > max) max = value;
      }
      peaks.push(max);
    }
    const loudest = Math.max(...peaks, 0.0001);
    return peaks.map((value) => value / loudest);
  } catch {
    return null;
  } finally {
    await context.close().catch(() => {});
  }
}

const BAR = 1;
const GAP = 1;

/** Stretches a peak list to the number of 1px bars that fit the scrubber. */
function samplePeaks(peaks, count) {
  if (!peaks.length || count < 1) return [];
  if (peaks.length === count) return peaks;
  const out = [];
  for (let index = 0; index < count; index += 1) {
    const at = (index / Math.max(count - 1, 1)) * (peaks.length - 1);
    const low = Math.floor(at);
    const high = Math.min(peaks.length - 1, low + 1);
    const mix = at - low;
    out.push(peaks[low] * (1 - mix) + peaks[high] * mix);
  }
  return out;
}

/** Draws 1px bars for played time, and a gray 1px line for the rest. */
export function createWaveform(canvas, peaks) {
  let progress = 0;
  let values = peaks?.length ? peaks : seededPeaks('crystal');

  const draw = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width < 2 || height < 2) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const step = BAR + GAP;
    const count = Math.max(1, Math.floor((width + GAP) / step));
    const bars = samplePeaks(values, count);
    const mid = Math.floor(height / 2);
    const playedUntil = progress * width;
    const color = getComputedStyle(canvas).color || '#F7F7F7';
    const gray = getComputedStyle(canvas).getPropertyValue('--wave-rest').trim() || 'rgba(247, 247, 247, 0.35)';

    if (playedUntil < width) {
      context.fillStyle = gray;
      context.fillRect(Math.max(0, playedUntil), mid, width - Math.max(0, playedUntil), 1);
    }

    context.fillStyle = color;
    bars.forEach((peak, index) => {
      const x = index * step;
      if (x + BAR > playedUntil) return;
      const barHeight = Math.max(1, Math.round(peak * (height * 0.9)));
      context.fillRect(x, mid - Math.floor(barHeight / 2), BAR, barHeight);
    });
  };

  const resize = () => draw();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(canvas);
  draw();

  return {
    setPeaks(next) {
      if (next?.length) values = next;
      draw();
    },
    setProgress(ratio) {
      progress = Math.min(1, Math.max(0, ratio));
      draw();
    },
    destroy() {
      observer?.disconnect();
    },
  };
}
