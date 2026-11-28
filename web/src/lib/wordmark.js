// The CRYSTAL wordmark from the studio's Modulizer tool (glyph set V3), lifted from the
// client's preview (assets/js/modulizer-logo.js, itself checked against the tool at
// git 8a5dc89). Every letter is a matched pair of paths, narrow and wide, with the same
// structure, so any width in between is a straight blend of the two. The word keeps its
// total width while the letters move: a letter that grows pushes its neighbours narrower.
//
// Only the maths lives here, with no canvas or DOM, so it can be tested in Node.
// scripts/wordmark.js draws it.

export const WORD = 'CRYSTAL';
export const GAP_UNITS = 0.4;
export const AMP = 0.45;
export const SPEED = 1;
export const PHASE_STEP = 0.6;

const ARG_COUNT = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

export function parseSvgPath(d) {
  const tokens = d.match(/[MLHVCSQTAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const segs = [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i].toUpperCase();
    i += 1;
    const n = ARG_COUNT[cmd];
    const args = [];
    for (let k = 0; k < n; k += 1) args.push(parseFloat(tokens[i++]));
    segs.push({ cmd, args });
  }
  return segs;
}

function lineToCubic(x0, y0, x1, y1) {
  return {
    cmd: 'C',
    args: [x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + ((x1 - x0) * 2) / 3, y0 + ((y1 - y0) * 2) / 3, x1, y1],
  };
}

// Both extremes become cubic curves, so a straight run in one and a nearly straight curve
// in the other still blend.
export function normalizeToCubic(segs) {
  const out = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  for (const seg of segs) {
    if (seg.cmd === 'M') {
      out.push({ cmd: 'M', args: [...seg.args] });
      [cx, cy] = seg.args;
      sx = cx;
      sy = cy;
    } else if (seg.cmd === 'H') {
      out.push(lineToCubic(cx, cy, seg.args[0], cy));
      cx = seg.args[0];
    } else if (seg.cmd === 'V') {
      out.push(lineToCubic(cx, cy, cx, seg.args[0]));
      cy = seg.args[0];
    } else if (seg.cmd === 'L') {
      out.push(lineToCubic(cx, cy, seg.args[0], seg.args[1]));
      [cx, cy] = seg.args;
    } else if (seg.cmd === 'C') {
      out.push({ cmd: 'C', args: [...seg.args] });
      cx = seg.args[4];
      cy = seg.args[5];
    } else if (seg.cmd === 'Z') {
      out.push({ cmd: 'Z', args: [] });
      cx = sx;
      cy = sy;
    } else {
      throw new Error(`normalizeToCubic: unsupported command ${seg.cmd}`);
    }
  }
  return out;
}

export function interpolateSegs(a, b, t) {
  if (a.length !== b.length) throw new Error('SVG extremes have different segment counts');
  return a.map((seg, i) => {
    const other = b[i];
    if (seg.cmd !== other.cmd || seg.args.length !== other.args.length) {
      throw new Error(`SVG extremes have mismatched structure at segment ${i}`);
    }
    return { cmd: seg.cmd, args: seg.args.map((v, k) => v + (other.args[k] - v) * t) };
  });
}

export function serializeSegs(segs) {
  return segs.map((s) => s.cmd + s.args.map((n) => +n.toFixed(3)).join(' ')).join('');
}

function glyphExtreme(width, height, d) {
  return { width, height, segs: normalizeToCubic(parseSvgPath(d)) };
}

export const GLYPHS = {
  C: {
    compressed: glyphExtreme(144, 113,
      'M45.2574 112.952H143.542V99.0133H51.9438C40.0258 99.0133 38.2923 93.3912 38.2923 82.1316V31.084C38.2923 19.8244 40.0258 14.2024 51.9438 14.2024H91.5827C103.501 14.2024 105.25 19.8244 105.25 31.084V44.0782H143.542V37.2481C143.542 1.73473 132.568 0.000107356 98.4085 0.000107356H45.2574C10.9738 -0.0153804 0 1.59534 0 37.2327V75.6887C0 111.063 10.9738 112.937 45.2574 112.937'),
    expanded: glyphExtreme(288, 113,
      'M45.2574 112.952H287.542V99.0133H51.9438C40.0258 99.0133 38.2923 93.3912 38.2923 82.1316V31.084C38.2923 19.8244 40.0258 14.2024 51.9438 14.2024H235.583C247.501 14.2024 249.25 19.8244 249.25 31.084V44.0782H287.542V37.2481C287.542 1.73473 276.568 0.000107356 242.408 0.000107356L45.2574 0.000107356C10.9738 -0.0153804 0 1.59534 0 37.2327V75.6887C0 111.063 10.9738 112.937 45.2574 112.937'),
  },
  R: {
    compressed: glyphExtreme(84, 113,
      'M0 112.952H38.0292V30.8206C38.0292 19.561 39.7627 13.939 51.6807 13.939H83.1472V0H45.2574C11.1131 0 0 2.0134 0 37.248V112.952Z'),
    expanded: glyphExtreme(166, 113,
      'M0 112.952H38.0292V30.8206C38.0292 19.561 39.7627 13.939 51.6807 13.939H165.5V0H45.2574C11.1131 0 0 2.0134 0 37.248V112.952Z'),
  },
  Y: {
    compressed: glyphExtreme(148, 113,
      'M1.05249 112.968H102.959C137.103 112.968 147.953 111.233 147.953 75.7196V0H109.924V49.5763H51.6807C39.7627 49.5763 38.0292 43.9542 38.0292 32.5552V0H0V25.7252C0 61.0992 10.5714 63.1126 42.5797 63.1126H109.939V82.147C109.939 92.338 108.206 99.0287 96.288 99.0287H1.08345V112.968H1.05249Z'),
    expanded: glyphExtreme(296, 113,
      'M1.05249 112.968H250.171C284.315 112.968 295.165 111.233 295.165 75.7196V0H257.136V49.5763H51.6807C39.7627 49.5763 38.0292 43.9542 38.0292 32.5552V0H0V25.7252C0 61.0992 10.5714 63.1126 42.5797 63.1126H257.152V82.147C257.152 92.338 255.418 99.0287 243.5 99.0287H1.08345V112.968H1.05249Z'),
  },
  S: {
    compressed: glyphExtreme(150, 113,
      'M0 112.968H104.182C136.314 112.968 149.037 110.954 149.037 80.6757C149.037 50.3971 136.592 49.4524 104.182 49.4524H55.9835C42.4558 49.4524 38.3078 43.5516 38.3078 31.7654C38.3078 19.9792 42.4558 13.939 55.9835 13.939H149.052V0H44.8704C12.7383 0 0.0154458 2.13731 0.0154458 32.0287C0.0154458 61.92 12.8621 63.3759 44.8704 63.3759H93.084C106.612 63.3759 110.76 69.1373 110.76 80.6602C110.76 91.5171 106.612 96.8759 93.084 96.8759H0.0154458V112.952L0 112.968Z'),
    expanded: glyphExtreme(300, 113,
      'M0 112.968H254.145C286.277 112.968 299 110.954 299 80.6757C299 50.3971 286.556 49.4524 254.145 49.4524H55.9835C42.4558 49.4524 38.3078 43.5516 38.3078 31.7654C38.3078 19.9792 42.4558 13.939 55.9835 13.939H299.016V0H44.8704C12.7383 0 0.0154458 2.13731 0.0154458 32.0287C0.0154458 61.92 12.8621 63.3759 44.8704 63.3759H243.047C256.575 63.3759 260.723 69.1373 260.723 80.6602C260.723 91.5171 256.575 96.8759 243.047 96.8759H0.0154458V112.952L0 112.968Z'),
  },
  T: {
    compressed: glyphExtreme(84, 134,
      'M45.2574 134H83.1473V120.061H53.0118C40.9545 120.061 39.3603 114.439 39.3603 103.04V34.9713H83.1473V21.0324H39.3603V0H0V96.6126C0 132.25 10.7107 134 45.2574 134Z'),
    expanded: glyphExtreme(165, 134,
      'M45.2574 134H165V120.061H53.0118C40.9545 120.061 39.3603 114.439 39.3603 103.04V34.9713H165V21.0324H39.3603V0H0V96.6126C0 132.25 10.7107 134 45.2574 134Z'),
  },
  A: {
    compressed: glyphExtreme(150, 113,
      'M1.06793 0.0154881V13.9545H97.3405C109.258 13.9545 111.007 20.6452 111.007 30.8361V49.5918H42.5797C10.5714 49.5918 0 51.6052 0 86.9792V112.968H38.0292V80.1336C38.0292 68.7501 39.7627 63.1126 51.6807 63.1126H111.007V112.952H149.037V37.248C149.037 1.73463 138.187 0 104.042 0H1.06793V0.0154881Z'),
    expanded: glyphExtreme(299, 113,
      'M1.06793 0.0154881V13.9545H246.5C258.418 13.9545 260.167 20.6452 260.167 30.8361V49.5918H42.5797C10.5714 49.5918 0 51.6052 0 86.9792V112.968H38.0292V80.1336C38.0292 68.7501 39.7627 63.1126 51.6807 63.1126H260.167V112.952H298.196V37.248C298.196 1.73463 287.346 0 253.202 0H1.06793V0.0154881Z'),
  },
  L: {
    compressed: glyphExtreme(84, 113,
      'M45.2728 112.968H83.1627V99.0287H51.6961C39.7781 99.0287 38.0292 93.4066 38.0292 82.147V0H0V75.7041C0 110.939 11.1131 112.952 45.2573 112.952'),
    expanded: glyphExtreme(166, 113,
      'M45.2728 112.968H166V99.0287H51.6961C39.7781 99.0287 38.0292 93.4066 38.0292 82.147V0H0V75.7041C0 110.939 11.1131 112.952 45.2573 112.952'),
  },
};
export const GLYPH_BASE_HEIGHT = 113;

export const FORCE_COMPRESSED_FLEX = 0.55;
const FORCE_EXPANDED_FLEX = 1.6;
const T_NEUTRAL = (1 - FORCE_COMPRESSED_FLEX) / (FORCE_EXPANDED_FLEX - FORCE_COMPRESSED_FLEX);
const REACTIVITY = 1.3;

/** flex (1 = rest) to the blend between the narrow (0) and wide (1) shape. Past 1 extrapolates. */
export function flexToT(flex) {
  const rawT = (flex - FORCE_COMPRESSED_FLEX) / (FORCE_EXPANDED_FLEX - FORCE_COMPRESSED_FLEX);
  return Math.max(0, T_NEUTRAL + (rawT - T_NEUTRAL) * REACTIVITY);
}

export function tToFlex(t) {
  const rawT = T_NEUTRAL + (t - T_NEUTRAL) / REACTIVITY;
  return FORCE_COMPRESSED_FLEX + rawT * (FORCE_EXPANDED_FLEX - FORCE_COMPRESSED_FLEX);
}

function compressedWidth(ch) {
  return GLYPHS[ch].compressed.width;
}

function stretchRange(ch) {
  return GLYPHS[ch].expanded.width - GLYPHS[ch].compressed.width;
}

/** A letter's width in wordmark units (the cap height is 10). */
export function glyphWidth(ch, flex) {
  return ((compressedWidth(ch) + stretchRange(ch) * flexToT(flex)) * 10) / GLYPH_BASE_HEIGHT;
}

const CONSERVE_REACH = 2;

/**
 * Holds the word at its neutral width: each letter's excess or shortfall goes to its
 * nearest neighbours, never to itself, so letters far from the motion stay still.
 * Changes `flexes` in place.
 */
export function conserveTotalWidth(flexes, width = 0) {
  const n = WORD.length;
  const baseFlex = 1 + width;
  const floor = [];
  const neutral = [];
  const raw = [];
  for (let i = 0; i < n; i += 1) {
    const ch = WORD[i];
    floor.push(compressedWidth(ch) / 10);
    neutral.push(glyphWidth(ch, baseFlex));
    raw.push(glyphWidth(ch, flexes[i]));
  }

  const desired = raw.slice();
  for (let j = 0; j < n; j += 1) {
    const excess = raw[j] - neutral[j];
    if (excess === 0) continue;
    const neighbors = [];
    for (let d = 1; d <= CONSERVE_REACH; d += 1) {
      if (j - d >= 0) neighbors.push({ i: j - d, w: 1 / d });
      if (j + d < n) neighbors.push({ i: j + d, w: 1 / d });
    }
    const weightSum = neighbors.reduce((a, nb) => a + nb.w, 0);
    for (const nb of neighbors) desired[nb.i] -= excess * (nb.w / weightSum);
  }

  // Letters clamped at their narrowest pass what they could not give to letters with room.
  for (let pass = 0; pass < n; pass += 1) {
    let shortfall = 0;
    const room = [];
    for (let i = 0; i < n; i += 1) {
      if (desired[i] < floor[i]) {
        shortfall += floor[i] - desired[i];
        desired[i] = floor[i];
        room.push(0);
      } else room.push(desired[i] - floor[i]);
    }
    if (shortfall <= 1e-9) break;
    const roomSum = room.reduce((a, b) => a + b, 0);
    if (roomSum <= 1e-9) break;
    for (let i = 0; i < n; i += 1) {
      if (room[i] > 0) desired[i] -= shortfall * (room[i] / roomSum);
    }
  }

  for (let i = 0; i < n; i += 1) {
    const ch = WORD[i];
    flexes[i] = tToFlex((desired[i] * 10 - compressedWidth(ch)) / stretchRange(ch));
  }
  return flexes;
}

// The tool's standard wave.
const SINE_HARMONICS = [
  { mul: 1, weight: 1, phase: 0 },
  { mul: 2.3, weight: 0.5, phase: 0.7 },
  { mul: 4.1, weight: 0.25, phase: 1.3 },
];
const SINE_HARMONIC_NORM = SINE_HARMONICS.reduce((a, h) => a + h.weight, 0);

export function multiSine(phase) {
  let sum = 0;
  for (const h of SINE_HARMONICS) sum += h.weight * Math.sin(phase * h.mul + h.phase);
  return sum / SINE_HARMONIC_NORM;
}

/** Letter i's flex in wave mode at `seconds`. */
export function waveFlex(i, seconds) {
  return 1 + AMP * multiSine(seconds * SPEED - i * PHASE_STEP);
}

/* ---------- Sound ---------- */

// C R follow the bass, Y S T the mids, A L the treble.
export const BAND_HZ = { bass: [20, 250], mid: [250, 2000], treble: [2000, 8000] };
const PRESENCE_HZ = [40, 12000];
const BAND_OCTAVE_RANGE = 2;
const BAND_FLOOR = 0.0001;
const BAND_AVG_RATE = 0.015;
const PRESENCE_THRESHOLD_DB = -60;
const PRESENCE_UP = 1 / 48;
const PRESENCE_DOWN = 1 / 30;

const bandLog = (lin) => Math.log2(Math.max(BAND_FLOOR, lin));

/** Which band moves letter i: the first third bass, the last third treble, the rest mids. */
export function bandFor(i, wordLen = WORD.length) {
  const edge = Math.max(1, Math.floor(wordLen / 3));
  return i < edge ? 'bass' : i >= wordLen - edge ? 'treble' : 'mid';
}

export function createBands() {
  return {
    lin: { bass: 0, mid: 0, treble: 0 },
    avg: { bass: bandLog(0), mid: bandLog(0), treble: bandLog(0) },
    presence: 0,
    active: false,
  };
}

/**
 * One frame of sound. `spectrum` is { bins (Uint8Array from getByteFrequencyData),
 * sampleRate, minDb, maxDb }.
 */
export function updateBands(state, spectrum) {
  const { bins, sampleRate, minDb, maxDb } = spectrum;
  const spanDb = maxDb - minDb;
  const bin = (hz) => Math.max(0, Math.min(bins.length - 1, Math.round((hz / (sampleRate / 2)) * bins.length)));

  const lo = bin(PRESENCE_HZ[0]);
  const hi = bin(PRESENCE_HZ[1]);
  let peak = 0;
  for (let k = lo; k <= hi; k += 1) if (bins[k] > peak) peak = bins[k];
  const peakDb = minDb + (peak / 255) * spanDb;
  state.active = peakDb > PRESENCE_THRESHOLD_DB;
  // As in the tool: at full presence it dips a frame and climbs back, which keeps the
  // band averages on the fast rate while sound plays.
  const target = state.active ? 1 : 0;
  state.presence = target > state.presence
    ? Math.min(1, state.presence + PRESENCE_UP)
    : Math.max(0, state.presence - PRESENCE_DOWN);

  const rate = state.presence < 1 ? 0.08 : BAND_AVG_RATE;
  for (const name of ['bass', 'mid', 'treble']) {
    const [loHz, hiHz] = BAND_HZ[name];
    const a0 = bin(loHz);
    const a1 = bin(hiHz);
    let sumSq = 0;
    for (let k = a0; k <= a1; k += 1) {
      const amp = 10 ** ((minDb + (bins[k] / 255) * spanDb) / 20);
      sumSq += amp * amp;
    }
    state.lin[name] = Math.sqrt(sumSq / (a1 - a0 + 1));
    state.avg[name] += (bandLog(state.lin[name]) - state.avg[name]) * rate;
  }
  return state;
}

export function presenceEase(state) {
  const x = state.presence;
  return x * x * (3 - 2 * x);
}

/** Smoothed -1..1 swing of letter i from its band's usual level. `smoothed` is kept per letter. */
export function audioLevel(state, smoothed, i) {
  const name = bandFor(i, smoothed.length);
  const logRatio = bandLog(state.lin[name]) - state.avg[name];
  const raw = state.active ? Math.max(-1, Math.min(1, logRatio / BAND_OCTAVE_RANGE)) : 0;
  const rate = raw > smoothed[i] ? 0.6 : 0.18;
  smoothed[i] += (raw - smoothed[i]) * rate;
  return smoothed[i];
}

/* ---------- Layout ---------- */

export const DISPLAY_SMOOTH_RATE = 0.35 + (0.02 - 0.35) * 0.32;
export const MIC_GAIN = 1.8;
export const MIC_PREAMP = 16;

// The header logo is a 96 × 24 block with the word 81.37 wide inside it, as the static logo.
const BLOCK_RATIO = 4;
const REST_SHARE = 81.37 / 95.37;
const CAP_SHARE = 11.86 / 24;

/** Width of the word in units at these flexes, and each letter's width. */
export function measure(flexes) {
  const widths = [...WORD].map((ch, i) => glyphWidth(ch, flexes[i]));
  const full = widths.reduce((sum, w) => sum + w, 0) + GAP_UNITS * (WORD.length - 1);
  return { widths, full };
}

/** The word at rest (every letter at its narrowest), in units. */
export function restWidth() {
  return measure(Array(WORD.length).fill(FORCE_COMPRESSED_FLEX)).full;
}

/**
 * Where each letter goes in a W × H box.
 *  - `inner` set: the word is that share of the box's width, centred (the intro, the mirror).
 *  - otherwise: sized like the header logo by the box's height. A box four times as wide
 *    as tall shows the whole word; a square shows the C alone, centred. In between, the
 *    other letters fold away (iso 0 → 1) and the C slides to the middle.
 * Returns { unit, y, letters: [{ ch, t, x, scale, sx, alpha }] }.
 */
export function layout({ W, H, flexes, inner = null, iso = null }) {
  const { widths, full } = measure(flexes);
  const fold = inner ? 0 : iso ?? Math.max(0, Math.min(1, (BLOCK_RATIO - W / H) / (BLOCK_RATIO - 1)));
  const k = 1 - fold;
  let total = widths[0];
  widths.forEach((w, i) => {
    if (i) total += (w + GAP_UNITS) * k;
  });
  const unit = inner
    ? (W * inner) / full
    : Math.min((H * BLOCK_RATIO * REST_SHARE) / full, (H * CAP_SHARE) / 10);
  const padRest = (H * BLOCK_RATIO - full * unit) / 2;
  const padIso = (H - widths[0] * unit) / 2;
  let x = inner ? (W - total * unit) / 2 : padIso + (padRest - padIso) * k;
  const y = (H - 10 * unit) / 2;
  const scale = (10 * unit) / GLYPH_BASE_HEIGHT;
  const letters = [];
  for (let i = 0; i < WORD.length; i += 1) {
    const ch = WORD[i];
    const sx = i ? k : 1;
    if (i) x += GAP_UNITS * unit * k;
    letters.push({
      ch,
      t: flexToT(flexes[i]),
      x,
      // Taller letters (T) rise above the cap line instead of shrinking.
      top: y - (GLYPHS[ch].compressed.height - GLYPH_BASE_HEIGHT) * scale,
      scale,
      sx,
      alpha: i ? k * k : 1,
    });
    x += widths[i] * unit * sx;
  }
  return { unit, y, full, fold, letters };
}

/** The path of letter `ch` at blend t, as SVG path data in glyph units. */
export function letterPath(ch, t) {
  const g = GLYPHS[ch];
  return serializeSegs(interpolateSegs(g.compressed.segs, g.expanded.segs, t));
}
