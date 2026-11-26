// The wordmark's letters stretch with a signal, while the whole word keeps its width.
// Only the horizontal runs change length. Each vertical stroke stays the thickness
// it was drawn at, and a loud letter hands its extra width to its neighbours so the
// header bubble never has to resize.

const TOKEN = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;

// How far a letter may swing, as a fraction of its own width, and how narrow it may
// get. Wide enough to read clearly as the letters pumping with the sound.
const AMP = 0.75;
const FLOOR = 0.4;
// A flat end this wide is the cap of a vertical stroke, not a bar to stretch.
const STEM = 3.65;
const REACH = 2;

const HARMONICS = [
  [1, 1, 0],
  [2.3, 0.5, 0.7],
  [4.1, 0.25, 1.3],
];
const HARMONIC_NORM = 1.75;

// Log-spaced, so a kick and a voice land on different letters instead of both
// piling into the first one.
const BAND_HZ = [40, 12000];
const FLOOR_AMP = 0.0001;
// A band this many octaves louder than its own recent level swings its letter fully.
const OCTAVE = 1.2;
// Loudness of the waveform, in dB below full scale. About -75 is silence, -55 a quiet
// room, -45 a low voice, -35 talking, and from -25 up (shouting) it is all the same.
const QUIET_DB = -75;
const LOUD_DB = -25;
// Just above 1 keeps the room quieter than a voice: background noise moves the letters a
// little, talking moves them most of the way.
const LOUD_CURVE = 1.1;

function num(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/**
 * Splits the wordmark path into letters. Contours belong to one letter until a
 * gap opens. Null when the path isn't the absolute wordmark this knows how to move.
 */
export function parseLogoPath(d) {
  const tokens = String(d || '').match(TOKEN);
  if (!tokens) return null;

  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const contours = [];
  let contour = null;

  const read = () => {
    if (i >= tokens.length || /[a-zA-Z]/.test(tokens[i])) return null;
    return Number(tokens[i++]);
  };

  const point = (px) => {
    if (!contour) return;
    contour.minX = Math.min(contour.minX, px);
    contour.maxX = Math.max(contour.maxX, px);
  };

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd !== cmd.toUpperCase()) return null;

    if (cmd === 'M') {
      const nx = read();
      const ny = read();
      if (nx === null || ny === null) return null;
      contour = { minX: Infinity, maxX: -Infinity, segs: [] };
      contours.push(contour);
      x = nx;
      y = ny;
      sx = x;
      sy = y;
      point(x);
      contour.segs.push({ cmd: 'M', x, y });
      cmd = 'L';
    } else if (cmd === 'L') {
      const nx = read();
      const ny = read();
      if (nx === null || ny === null || !contour) return null;
      x = nx;
      y = ny;
      point(x);
      contour.segs.push({ cmd: 'L', x, y });
    } else if (cmd === 'H') {
      const nx = read();
      if (nx === null || !contour) return null;
      x = nx;
      point(x);
      contour.segs.push({ cmd: 'H', x });
    } else if (cmd === 'V') {
      const ny = read();
      if (ny === null || !contour) return null;
      y = ny;
      point(x);
      contour.segs.push({ cmd: 'V', y });
    } else if (cmd === 'C') {
      const x1 = read();
      const y1 = read();
      const x2 = read();
      const y2 = read();
      const nx = read();
      const ny = read();
      if ([x1, y1, x2, y2, nx, ny].some((value) => value === null) || !contour) return null;
      point(x1);
      point(x2);
      x = nx;
      y = ny;
      point(x);
      contour.segs.push({ cmd: 'C', x1, y1, x2, y2, x, y });
    } else if (cmd === 'Z') {
      if (!contour) return null;
      x = sx;
      y = sy;
      contour.segs.push({ cmd: 'Z' });
    } else return null;
  }

  // The path draws the letters out of reading order. Sort, then a gap starts a new one.
  contours.sort((a, b) => a.minX - b.minX);
  const letters = [];
  for (const item of contours) {
    const last = letters[letters.length - 1];
    if (!last || item.minX > last.maxX + 0.45) {
      letters.push({ contours: [item], minX: item.minX, maxX: item.maxX });
    } else {
      last.contours.push(item);
      last.minX = Math.min(last.minX, item.minX);
      last.maxX = Math.max(last.maxX, item.maxX);
    }
  }
  if (letters.length < 2) return null;

  for (const letter of letters) {
    letter.width = letter.maxX - letter.minX;
    letter.columns = rigidColumns(letter);
  }
  return letters;
}

// Vertical strokes, including the curves at their corners, move as solid blocks.
// A horizontal run between those blocks is the only part that grows or shrinks.
function rigidColumns(letter) {
  const vertical = new Set();
  for (const contour of letter.contours) {
    let x = 0;
    for (const seg of contour.segs) {
      if (seg.cmd === 'M' || seg.cmd === 'H' || seg.cmd === 'C') x = seg.x;
      else if (seg.cmd === 'V') vertical.add(x.toFixed(3));
    }
  }
  const onStem = (value) => [...vertical].some((edge) => Math.abs(Number(edge) - value) < 0.05);

  const parent = new Map();
  const find = (key) => {
    if (!parent.has(key)) parent.set(key, key);
    let root = parent.get(key);
    while (root !== parent.get(root)) root = parent.get(root);
    parent.set(key, root);
    return root;
  };
  const join = (a, b) => {
    const left = find(a);
    const right = find(b);
    if (left !== right) parent.set(left, right);
  };
  const keyOf = (value) => value.toFixed(3);

  for (const contour of letter.contours) {
    let x = 0;
    let sx = 0;
    for (const seg of contour.segs) {
      if (seg.cmd === 'M') {
        x = seg.x;
        sx = x;
        find(keyOf(x));
      } else if (seg.cmd === 'V') {
        find(keyOf(x));
      } else if (seg.cmd === 'H') {
        // The short flat end of a stem stays with it. A longer bar is the stretch.
        if (onStem(x) && onStem(seg.x) && Math.abs(seg.x - x) <= STEM) join(keyOf(x), keyOf(seg.x));
        else find(keyOf(seg.x));
        x = seg.x;
      } else if (seg.cmd === 'C') {
        join(keyOf(x), keyOf(seg.x1));
        join(keyOf(seg.x1), keyOf(seg.x2));
        join(keyOf(seg.x2), keyOf(seg.x));
        x = seg.x;
      } else if (Math.abs(x - sx) <= STEM) join(keyOf(x), keyOf(sx));
    }
  }

  const groups = new Map();
  for (const key of parent.keys()) {
    const root = find(key);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(Number(key));
  }
  const columns = [...groups.values()]
    .map((xs) => ({ min: Math.min(...xs), max: Math.max(...xs) }))
    .sort((a, b) => a.min - b.min);
  const merged = [];
  for (const column of columns) {
    const last = merged[merged.length - 1];
    if (last && column.min <= last.max + 0.05) last.max = Math.max(last.max, column.max);
    else merged.push({ min: column.min, max: column.max });
  }
  return merged.length ? merged : [{ min: letter.minX, max: letter.maxX }];
}

// Keeps every vertical block the width it was drawn at, and puts the whole
// change into the horizontal runs between them.
function mapX(letter, value, delta) {
  const columns = letter.columns;
  const gaps = [];
  let gapSum = 0;
  for (let index = 0; index < columns.length - 1; index += 1) {
    const gap = Math.max(0, columns[index + 1].min - columns[index].max);
    gaps.push(gap);
    gapSum += gap;
  }

  let out = columns[0].min;
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    if (value <= column.max || index === columns.length - 1) return out + (value - column.min);
    const gap = gaps[index];
    const grown = Math.max(0, gap + (gapSum > 0 ? delta * (gap / gapSum) : 0));
    if (value < columns[index + 1].min) {
      const across = gap > 0 ? (value - column.max) / gap : 0;
      return out + (column.max - column.min) + across * grown;
    }
    out += column.max - column.min + grown;
  }
  return out;
}

/** A slow travelling wave, one value per letter, each between -1 and 1. */
export function waveLevels(time, count) {
  const levels = [];
  for (let index = 0; index < count; index += 1) {
    const phase = time * 0.9 - index * 0.68;
    let sum = 0;
    for (const [mul, weight, offset] of HARMONICS) sum += weight * Math.sin(phase * mul + offset);
    levels.push(sum / HARMONIC_NORM);
  }
  return levels;
}

/**
 * Motion for a video whose sound can't be heard (a Vimeo frame, or a file its host won't
 * share): each letter chases its own random target, picked again after a short, uneven
 * wait, so it reads like a beat rather than a steady wave. `dt` is in seconds.
 */
export function createRandomState(count) {
  return { target: Array(count).fill(0), wait: Array(count).fill(0), level: Array(count).fill(0) };
}

export function randomLevels(state, dt, rand = Math.random) {
  // Capped at two frames, so resuming after a pause carries on instead of jumping.
  const step = Math.max(0, Math.min(1 / 30, dt));
  for (let index = 0; index < state.level.length; index += 1) {
    state.wait[index] -= step;
    if (state.wait[index] <= 0) {
      // Mostly medium moves, now and then a full one, like hits in a track.
      const size = rand() < 0.3 ? 1 : 0.7;
      state.target[index] = (rand() * 2 - 1) * size;
      state.wait[index] = 0.12 + rand() * 0.5;
    }
    // Quick to rise, slower to fall back, as a level meter does. Per 60 fps frame.
    const rate = state.target[index] > state.level[index] ? 0.3 : 0.1;
    const follow = 1 - (1 - rate) ** (step * 60);
    state.level[index] += (state.target[index] - state.level[index]) * follow;
  }
  return state.level.slice();
}

export function createBandState(count) {
  const quiet = Math.log2(FLOOR_AMP);
  return {
    avg: Array(count).fill(quiet),
    level: Array(count).fill(0),
    loud: 0,
  };
}

function hzToBin(hz, bins, sampleRate) {
  const nyquist = sampleRate / 2;
  return Math.max(0, Math.min(bins - 1, Math.round((hz / nyquist) * (bins - 1))));
}

/**
 * How much a sound should move the logo, 0 to 1, from its loudness in dB. Compressed
 * hard: the room's own noise gives a little, a low voice a bit more, talking most of
 * it, and shouting no more than talking.
 */
export function loudnessOf(db) {
  if (!Number.isFinite(db)) return 0;
  const t = Math.max(0, Math.min(1, (db - QUIET_DB) / (LOUD_DB - QUIET_DB)));
  return t ** LOUD_CURVE;
}

/**
 * Turns one moment of sound into a -1..1 level per letter. How loud it is (rmsDb, from
 * the waveform) sets how far the letters move. Which way each one moves comes from its
 * own frequency band, measured against that band's recent level, plus a slow wave, so a
 * steady sound such as a room's hum still moves them a little.
 */
export function bandLevels(state, { bins, sampleRate, minDb, maxDb, rmsDb, time = 0 }) {
  const count = state.level.length;
  const n = bins.length;
  let db = rmsDb;
  if (!Number.isFinite(db)) {
    // No waveform: estimate from the spectrum's peak, which runs about 20 dB above it.
    const lo = hzToBin(BAND_HZ[0], n, sampleRate);
    const hi = hzToBin(BAND_HZ[1], n, sampleRate);
    let peak = 0;
    for (let index = lo; index <= hi; index += 1) if (bins[index] > peak) peak = bins[index];
    db = peak ? minDb + (peak / 255) * (maxDb - minDb) - 20 : -Infinity;
  }
  const loud = loudnessOf(db);
  // Quick to rise, slower to settle, like a level meter.
  state.loud += (loud - state.loud) * (loud > state.loud ? 0.35 : 0.08);
  const rate = 0.03;
  const [loHz, hiHz] = BAND_HZ;
  const ratio = hiHz / loHz;
  const span = maxDb - minDb;

  for (let index = 0; index < count; index += 1) {
    const from = hzToBin(loHz * ratio ** (index / count), n, sampleRate);
    let to = hzToBin(loHz * ratio ** ((index + 1) / count), n, sampleRate);
    if (to <= from) to = Math.min(n - 1, from + 1);
    let sumSq = 0;
    for (let bin = from; bin <= to; bin += 1) {
      const amp = 10 ** ((minDb + (bins[bin] / 255) * span) / 20);
      sumSq += amp * amp;
    }
    const log = Math.log2(Math.max(FLOOR_AMP, Math.sqrt(sumSq / (to - from + 1))));
    state.avg[index] += (log - state.avg[index]) * rate;
    const raw = Math.max(-1, Math.min(1, (log - state.avg[index]) / OCTAVE));
    const follow = raw > state.level[index] ? 0.6 : 0.18;
    state.level[index] += (raw - state.level[index]) * follow;
  }

  const wave = waveLevels(time, count);
  return state.level.map((level, index) =>
    state.loud * Math.max(-1, Math.min(1, 0.55 * wave[index] + 0.85 * level)),
  );
}

/** Letter widths for these levels. The sum matches the word's rest width. */
/** The narrowest a letter may get: never below FLOOR, and always keeping a quarter of its
    bars, so its vertical strokes never meet. */
function floorOf(letter) {
  let rigid = 0;
  for (const column of letter.columns) rigid += column.max - column.min;
  const bars = Math.max(0, letter.width - rigid);
  return Math.max(letter.width * FLOOR, rigid + bars * 0.25);
}

export function widthsFor(letters, levels) {
  const neutral = letters.map((letter) => letter.width);
  const floor = letters.map(floorOf);
  const raw = neutral.map((width, index) => width * (1 + (levels[index] || 0) * AMP));
  const desired = raw.slice();
  const count = letters.length;

  for (let index = 0; index < count; index += 1) {
    const excess = raw[index] - neutral[index];
    if (!excess) continue;
    const neighbors = [];
    for (let distance = 1; distance <= REACH; distance += 1) {
      if (index - distance >= 0) neighbors.push([index - distance, 1 / distance]);
      if (index + distance < count) neighbors.push([index + distance, 1 / distance]);
    }
    const weight = neighbors.reduce((sum, [, value]) => sum + value, 0);
    if (!weight) continue;
    for (const [neighbor, value] of neighbors) desired[neighbor] -= excess * (value / weight);
  }

  for (let pass = 0; pass < count; pass += 1) {
    let shortfall = 0;
    const room = [];
    for (let index = 0; index < count; index += 1) {
      if (desired[index] < floor[index]) {
        shortfall += floor[index] - desired[index];
        desired[index] = floor[index];
        room.push(0);
      } else room.push(desired[index] - floor[index]);
    }
    if (shortfall <= 1e-6) break;
    const roomSum = room.reduce((sum, value) => sum + value, 0);
    if (roomSum <= 1e-6) break;
    for (let index = 0; index < count; index += 1) {
      if (room[index] > 0) desired[index] -= (shortfall * room[index]) / roomSum;
    }
  }

  return desired;
}

/** The wordmark path with each letter at the given width. Gaps stay as drawn. */
export function logoPath(letters, widths) {
  let cursor = letters[0].minX;
  let d = '';

  for (let index = 0; index < letters.length; index += 1) {
    const letter = letters[index];
    const delta = widths[index] - letter.width;
    const shift = cursor - letter.minX;
    const xOf = (value) => num(mapX(letter, value, delta) + shift);

    for (const contour of letter.contours) {
      for (const seg of contour.segs) {
        if (seg.cmd === 'M') d += `M${xOf(seg.x)} ${num(seg.y)}`;
        else if (seg.cmd === 'L') d += `L${xOf(seg.x)} ${num(seg.y)}`;
        else if (seg.cmd === 'H') d += `H${xOf(seg.x)}`;
        else if (seg.cmd === 'V') d += `V${num(seg.y)}`;
        else if (seg.cmd === 'C') {
          d += `C${xOf(seg.x1)} ${num(seg.y1)} ${xOf(seg.x2)} ${num(seg.y2)} ${xOf(seg.x)} ${num(seg.y)}`;
        } else d += 'Z';
      }
    }

    const next = letters[index + 1];
    const gap = next ? next.minX - letter.maxX : 0;
    cursor += widths[index] + gap;
  }

  return d;
}
