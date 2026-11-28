// Draws the CRYSTAL wordmark (lib/wordmark.js) into a canvas, as the studio's Modulizer
// does. Used by the header logo, the intro and the mirror page.
//
// Modes: 'rest' (still, the static logo), 'wave' (the tool's standard wave, scaled by
// setWave), 'audio' (an analyser fed by a video's sound) and 'mic' (an analyser fed by
// the microphone, pushed harder because a voice is quieter than a soundtrack). Motion
// eases out of the still word and settles back into it.
//
// The letters take the canvas's CSS `color`. The canvas follows its own box: a box four
// times as wide as tall shows the whole word, a square shows the C alone, centred, and in
// between the other letters fold away (the phone header).

import {
  AMP,
  DISPLAY_SMOOTH_RATE,
  FORCE_COMPRESSED_FLEX,
  MIC_GAIN,
  WORD,
  audioLevel,
  conserveTotalWidth,
  createBands,
  layout,
  letterPath,
  presenceEase,
  updateBands,
  waveFlex,
} from '../lib/wordmark.js';

const paths = new Map();

// Blends are rounded to 1/2000, so the still word and repeated poses reuse their paths.
function path2d(ch, t) {
  const key = `${ch}${Math.round(t * 2000)}`;
  let path = paths.get(key);
  if (!path) {
    if (paths.size > 4000) paths.clear();
    path = new Path2D(letterPath(ch, Math.round(t * 2000) / 2000));
    paths.set(key, path);
  }
  return path;
}

const samples = new WeakMap();

function spectrum(analyser) {
  let bins = samples.get(analyser);
  if (!bins || bins.length !== analyser.frequencyBinCount) {
    bins = new Uint8Array(analyser.frequencyBinCount);
    samples.set(analyser, bins);
  }
  analyser.getByteFrequencyData(bins);
  return {
    bins,
    sampleRate: analyser.context.sampleRate,
    minDb: analyser.minDecibels,
    maxDb: analyser.maxDecibels,
  };
}

/**
 * Paints the word into `ctx` inside the box (x, y, W, H) at these flexes. Shared with the
 * intro, which draws its shrinking box itself.
 */
export function paintWord(ctx, { x = 0, y = 0, W, H, flexes, inner = null, iso = null, fill }) {
  const placed = layout({ W, H, flexes, inner, iso });
  ctx.fillStyle = fill;
  for (const letter of placed.letters) {
    if (letter.sx <= 0.002) continue;
    ctx.save();
    ctx.globalAlpha = letter.alpha;
    ctx.translate(x + letter.x, y + letter.top);
    ctx.scale(letter.scale * letter.sx, letter.scale);
    ctx.fill(path2d(letter.ch, letter.t));
    ctx.restore();
  }
  return placed;
}

export const REST_FLEXES = Object.freeze(Array(WORD.length).fill(FORCE_COMPRESSED_FLEX));

/**
 * The moving word: keeps each letter's flex and eases it towards its target every frame.
 * Separate from the canvas so the intro can drive one without owning a canvas of its own.
 */
export function createMotion() {
  const smoothed = new Array(WORD.length).fill(0);
  const display = new Array(WORD.length).fill(FORCE_COMPRESSED_FLEX);
  const bands = createBands();
  let motion = 0;

  return {
    /**
     * One frame. `source`: { mode, wave, analyser } where an analyser is read in 'audio'
     * and 'mic'. Returns the flexes to draw and whether the word has come to rest.
     */
    step(seconds, { mode = 'rest', wave = 1, analyser = null } = {}) {
      const listening = (mode === 'audio' || mode === 'mic') && analyser;
      const fromMic = mode === 'mic';
      if (listening) updateBands(bands, spectrum(analyser));
      const moving = listening ? 1 : mode === 'wave' ? wave : 0;
      motion += (moving - motion) * DISPLAY_SMOOTH_RATE;
      if (Math.abs(moving - motion) < 0.001) motion = moving;
      const C = FORCE_COMPRESSED_FLEX;
      for (let i = 0; i < WORD.length; i += 1) {
        const live = listening
          ? 1 + AMP * audioLevel(bands, smoothed, i) * 4.5 * presenceEase(bands) * (fromMic ? MIC_GAIN : 1)
          : mode === 'wave'
            ? waveFlex(i, seconds)
            : 1;
        const target = C + (live - C) * moving;
        display[i] += (target - display[i]) * DISPLAY_SMOOTH_RATE;
      }
      const kept = conserveTotalWidth(display.slice());
      const flexes = display.map((d, i) => d + (kept[i] - d) * motion);
      const still = mode === 'rest' && motion === 0 && display.every((d) => Math.abs(d - C) < 0.001);
      if (still) display.fill(C);
      return { flexes: still ? REST_FLEXES : flexes, still };
    },
    /** Back to the still word at once. */
    reset() {
      display.fill(FORCE_COMPRESSED_FLEX);
      smoothed.fill(0);
      motion = 0;
      Object.assign(bands, createBands());
    },
  };
}

/**
 * A canvas that draws the word. Options: `inner` (the word's share of the box width; leave
 * it out to size it like the header logo) and `bg` (a fill behind it, none by default).
 */
export function createWordmark(canvas, { inner = null, bg = null } = {}) {
  const ctx = canvas.getContext('2d');
  const motion = createMotion();
  let source = { mode: 'rest', wave: 1, analyser: null };
  let running = false;
  let held = null;
  let last = REST_FLEXES;
  let fill = '';

  function draw(now) {
    running = false;
    if (!canvas.isConnected) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (!W || !H) return;
    const pw = Math.round(W * dpr);
    const ph = Math.round(H * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
    }
    if (!fill) fill = getComputedStyle(canvas).color;
    let frame;
    if (held) frame = { flexes: held, still: true };
    else frame = motion.step(now / 1000, source);
    last = frame.flexes;
    paintWord(ctx, { W, H, flexes: frame.flexes, inner, fill });
    if (!frame.still && !document.hidden) kick();
  }

  function kick() {
    if (running) return;
    running = true;
    requestAnimationFrame(draw);
  }

  // The box can change size on its own (the phone logo folding to the C): draw again.
  const resize = 'ResizeObserver' in window ? new ResizeObserver(() => kick()) : null;
  resize?.observe(canvas);
  const onVisible = () => {
    if (!document.hidden) kick();
  };
  document.addEventListener('visibilitychange', onVisible);

  return {
    canvas,
    /** 'rest', 'wave', 'audio' or 'mic'. An analyser is needed for the last two. */
    setMode(mode, analyser = source.analyser) {
      held = null;
      source = { ...source, mode, analyser };
      kick();
    },
    get mode() {
      return source.mode;
    },
    /** How much of the wave shows, 0 to 1 (the intro fades it out as it lands). */
    setWave(amount) {
      source = { ...source, wave: amount };
      kick();
    },
    setInner(value) {
      inner = value;
      kick();
    },
    /** Freezes the word as it is now (a paused video holds its pose). */
    hold() {
      held = last.slice();
      kick();
    },
    /** Straight back to the still word, without easing. */
    reset() {
      held = null;
      source = { ...source, mode: 'rest' };
      motion.reset();
      kick();
    },
    /** The colour comes from CSS: call after it changes. */
    recolour() {
      fill = '';
      kick();
    },
    redraw: kick,
    destroy() {
      resize?.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
