// The project video's sound, as the header logo and the »« glass use it. No DOM.
//
// When the video's sound can be read, both follow its AnalyserNode. When it can't (Vimeo,
// or a file its host won't share), createRandomSpectrum stands in: three bands that wander
// and kick like music, so they still move while the video plays. createLevel turns either
// spectrum into the one 0 to 1 level that bends the glass.

/** The range the glass listens to: bass and mids, where the beat is. */
export const LEVEL_HZ = [20, 2000];

/** Average loudness of `bins` (0 to 255, as getByteFrequencyData) between two frequencies, 0 to 1. */
export function spectrumEnergy(bins, sampleRate, [lo, hi] = LEVEL_HZ) {
  if (!bins?.length || !sampleRate) return 0;
  const toBin = (hz) => Math.max(0, Math.min(bins.length - 1, Math.round((hz / (sampleRate / 2)) * bins.length)));
  const a = toBin(lo);
  const b = Math.max(a, toBin(hi));
  let sum = 0;
  for (let k = a; k <= b; k += 1) sum += bins[k];
  return sum / ((b - a + 1) * 255);
}

/**
 * Follows a loudness and says how loud it is now compared with how loud it has been, 0 to 1.
 * Quiet and loud soundtracks both use the whole range. Rises fast, falls back slowly.
 */
export function createLevel({ attack = 0.55, release = 0.12, span = 0.04 } = {}) {
  let floor = null;
  let ceil = null;
  let level = 0;
  return {
    update(value) {
      if (floor === null) {
        floor = value;
        ceil = value + span;
      }
      // The floor follows the quiet parts down at once and creeps up; the ceiling follows
      // the loud parts up at once and creeps down.
      floor = value < floor ? value : floor + (value - floor) * 0.004;
      ceil = value > ceil ? value : ceil + (value - ceil) * 0.004;
      const raw = Math.max(0, Math.min(1, (value - floor) / Math.max(span, ceil - floor)));
      level += (raw - level) * (raw > level ? attack : release);
      return level;
    },
    /** Silence: eases back down to 0 (a paused video). */
    quiet() {
      level += (0 - level) * release;
      return level;
    },
    get value() {
      return level;
    },
  };
}

// The stand-in's bands, as byte levels: a steady body with swings either side of it. The
// wordmark moves a letter fully at two octaves (12 dB) from its band's usual level, which is
// about 44 steps here, so the swings reach that now and then.
const BODY = 160;
const SWING = 48;
const BAND_EDGES = [250, 2000];

/**
 * A stand-in spectrum. `fill(bins, seconds)` writes one frame into `bins`. The bass kicks on
 * a loose beat, the mids and treble drift. `random` is injectable for tests.
 */
export function createRandomSpectrum({ sampleRate = 48000, random = Math.random } = {}) {
  const bands = [0, 0, 0];
  const targets = [0, 0, 0];
  let nextKick = 0;
  let nextDrift = 0;
  let last = null;
  return {
    sampleRate,
    fill(bins, seconds) {
      const dt = last === null ? 1 / 60 : Math.max(0, Math.min(0.1, seconds - last));
      last = seconds;
      if (seconds >= nextKick) {
        targets[0] = 0.6 + random() * 0.4;
        nextKick = seconds + 0.38 + random() * 0.3;
      }
      if (seconds >= nextDrift) {
        targets[1] = random() * 2 - 1;
        targets[2] = random() * 2 - 1;
        nextDrift = seconds + 0.25 + random() * 0.5;
      }
      // The kick falls away after it lands; the others ease towards where they drift.
      targets[0] += (-0.6 - targets[0]) * Math.min(1, dt * 3.2);
      bands[0] += (targets[0] - bands[0]) * Math.min(1, dt * 18);
      bands[1] += (targets[1] - bands[1]) * Math.min(1, dt * 5);
      bands[2] += (targets[2] - bands[2]) * Math.min(1, dt * 7);
      const hzPerBin = sampleRate / 2 / bins.length;
      for (let k = 0; k < bins.length; k += 1) {
        const hz = k * hzPerBin;
        const band = hz < BAND_EDGES[0] ? 0 : hz < BAND_EDGES[1] ? 1 : 2;
        // Higher frequencies are quieter, as in most music, and nothing above 12 kHz.
        const tilt = hz > 12000 ? -BODY : -Math.log2(1 + hz / 1000) * 6;
        const grain = (random() - 0.5) * 6;
        bins[k] = Math.max(0, Math.min(255, Math.round(BODY + tilt + bands[band] * SWING + grain)));
      }
      return bins;
    },
  };
}
