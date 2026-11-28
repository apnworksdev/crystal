import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBands, updateBands, audioLevel } from './wordmark.js';
import { createLevel, createRandomSpectrum, spectrumEnergy } from './sound-level.js';

// A seeded random, so the stand-in spectrum is the same every run.
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

test('the stand-in spectrum moves every band of the wordmark', () => {
  const random = seeded(7);
  const source = createRandomSpectrum({ random });
  const bins = new Uint8Array(1024);
  const bands = createBands();
  const smoothed = new Array(7).fill(0);
  const seen = { bass: [0, 0], mid: [0, 0], treble: [0, 0] };
  for (let frame = 0; frame < 60 * 12; frame += 1) {
    source.fill(bins, frame / 60);
    updateBands(bands, { bins, sampleRate: source.sampleRate, minDb: -100, maxDb: -30 });
    [0, 3, 6].forEach((i, n) => {
      const name = ['bass', 'mid', 'treble'][n];
      const swing = audioLevel(bands, smoothed, i);
      seen[name][0] = Math.min(seen[name][0], swing);
      seen[name][1] = Math.max(seen[name][1], swing);
    });
  }
  assert.ok(bands.active, 'reads as sound playing');
  for (const [name, [lo, hi]] of Object.entries(seen)) {
    assert.ok(hi - lo > 0.4, `${name} swings (${lo.toFixed(2)} to ${hi.toFixed(2)})`);
  }
});

test('spectrumEnergy averages the bins in range', () => {
  const bins = new Uint8Array(1024);
  assert.equal(spectrumEnergy(bins, 48000), 0);
  bins.fill(255);
  assert.equal(spectrumEnergy(bins, 48000), 1);
  assert.equal(spectrumEnergy(null, 48000), 0);
});

test('createLevel stays between 0 and 1 and follows loud and quiet', () => {
  const level = createLevel();
  let peak = 0;
  let low = 1;
  for (let i = 0; i < 600; i += 1) {
    const value = level.update(Math.floor(i / 30) % 2 === 0 ? 0.7 : 0.3);
    assert.ok(value >= 0 && value <= 1);
    if (i > 120) {
      peak = Math.max(peak, value);
      low = Math.min(low, value);
    }
  }
  assert.ok(peak > 0.8, `loud parts reach near the top (${peak})`);
  assert.ok(low < 0.2, `quiet parts fall near the bottom (${low})`);
});

test('createLevel eases to silence when quiet', () => {
  const level = createLevel();
  level.update(0.2);
  level.update(0.9);
  for (let i = 0; i < 60; i += 1) level.quiet();
  assert.ok(level.value < 0.01);
});

test('the stand-in spectrum drives the level up and down', () => {
  const source = createRandomSpectrum({ random: seeded(3) });
  const bins = new Uint8Array(1024);
  const level = createLevel();
  let lo = 1;
  let hi = 0;
  for (let frame = 0; frame < 60 * 10; frame += 1) {
    source.fill(bins, frame / 60);
    const value = level.update(spectrumEnergy(bins, source.sampleRate));
    if (frame > 60) {
      lo = Math.min(lo, value);
      hi = Math.max(hi, value);
    }
  }
  assert.ok(hi > 0.7 && lo < 0.3, `level ranges ${lo.toFixed(2)} to ${hi.toFixed(2)}`);
});
