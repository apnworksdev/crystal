import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  bandLevels,
  createBandState,
  createRandomState,
  logoPath,
  loudnessOf,
  parseLogoPath,
  randomLevels,
  waveLevels,
  widthsFor,
} from './logo-motion.js';

const logo = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../components/icons/Logo.astro'),
  'utf8',
);
const path = logo.match(/d="([^"]+)"/)[1];
const letters = parseLogoPath(path);
const sum = (values) => values.reduce((total, value) => total + value, 0);

test('the wordmark is the seven letters of crystal', () => {
  assert.equal(letters.length, 7);
  // The phone header clips to this c.
  assert.ok(Math.abs(letters[0].width - 12.71) < 0.02);
  assert.ok(letters[0].minX < 0.01);
});

test('at rest the letters keep the width they were drawn at', () => {
  const neutral = letters.map((letter) => letter.width);
  const widths = widthsFor(letters, neutral.map(() => 0));
  widths.forEach((width, index) => assert.ok(Math.abs(width - neutral[index]) < 0.001));
  const again = parseLogoPath(logoPath(letters, widths));
  assert.equal(again.length, 7);
  assert.ok(Math.abs(sum(again.map((letter) => letter.width)) - sum(neutral)) < 0.08);
});

test('a loud letter widens, and the word stays the same width', () => {
  const neutral = letters.map((letter) => letter.width);
  const widths = widthsFor(letters, [1, -0.4, 0.2, -1, 0.6, 0, -0.5]);
  assert.ok(widths[0] > neutral[0]);
  assert.ok(Math.abs(sum(widths) - sum(neutral)) < 0.05);
  widths.forEach((width, index) => assert.ok(width >= neutral[index] * 0.4 - 0.001));
});

test('a stretch lengthens the bars and leaves the vertical strokes their drawn width', () => {
  const stemWidths = (list) => {
    const widths = [];
    for (const letter of list) {
      const edges = [];
      for (const contour of letter.contours) {
        let x = 0;
        for (const seg of contour.segs) {
          if (seg.cmd === 'M' || seg.cmd === 'H' || seg.cmd === 'C') x = seg.x;
          else if (seg.cmd === 'V') edges.push(x);
        }
      }
      edges.sort((a, b) => a - b);
      for (let left = 0; left < edges.length; left += 1) {
        for (let right = left + 1; right < edges.length; right += 1) {
          const width = edges[right] - edges[left];
          if (width > 3.2 && width < 3.7) widths.push(width);
        }
      }
    }
    return widths.sort((a, b) => a - b);
  };

  const before = stemWidths(letters);
  const stretched = parseLogoPath(logoPath(letters, widthsFor(letters, [1, -1, 1, -1, 1, -1, 1])));
  const after = stemWidths(stretched);
  // Every stroke is still there at its drawn width. A short bar can bring two strokes'
  // edges 3.2 to 3.7 apart, which this count also picks up, so extra matches are fine.
  const left = after.slice();
  before.forEach((width) => {
    const match = left.findIndex((other) => Math.abs(other - width) < 0.02);
    assert.ok(match >= 0);
    left.splice(match, 1);
  });
  assert.ok(stretched[0].width > letters[0].width + 0.4);
});

test('the idle wave stays inside a letter and is not the same on every letter', () => {
  const levels = waveLevels(1.7, 7);
  assert.equal(levels.length, 7);
  levels.forEach((level) => assert.ok(level >= -1 && level <= 1));
  assert.ok(Math.max(...levels) - Math.min(...levels) > 0.2);
});

test('silence settles, and a low note moves the first letter more than the last', () => {
  const bins = new Uint8Array(1024);
  const state = createBandState(7);
  const sample = { bins, sampleRate: 48000, minDb: -90, maxDb: -20 };
  for (let frame = 0; frame < 80; frame += 1) bandLevels(state, sample);
  const quiet = bandLevels(state, sample);
  quiet.forEach((level) => assert.ok(Math.abs(level) < 0.05));

  // About 80 Hz, the first letter's band.
  bins[2] = 255;
  bins[3] = 255;
  let loud = quiet;
  for (let frame = 0; frame < 8; frame += 1) loud = bandLevels(state, sample);
  assert.ok(loud[0] > loud[6]);
  assert.ok(loud[0] > 0.05);
});

// A fixed sequence, so the test does not depend on chance.
function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

test('without sound the letters move at random, each its own way, and stay in range', () => {
  const state = createRandomState(7);
  const rand = seeded(7);
  let levels = [];
  for (let frame = 0; frame < 120; frame += 1) levels = randomLevels(state, 1 / 60, rand);
  assert.ok(levels.every((level) => level >= -1 && level <= 1));
  assert.ok(new Set(levels.map((level) => level.toFixed(3))).size > 3);
});

test('a long pause does not make the random motion jump', () => {
  const state = createRandomState(7);
  const rand = seeded(3);
  for (let frame = 0; frame < 60; frame += 1) randomLevels(state, 1 / 60, rand);
  const before = state.level.slice();
  const after = randomLevels(state, 30, rand);
  after.forEach((level, index) => assert.ok(Math.abs(level - before[index]) < 0.6));
});

test('the room moves the logo a little, a low voice more, and shouting no more than talking', () => {
  assert.equal(loudnessOf(-90), 0);
  const room = loudnessOf(-55);
  const whisper = loudnessOf(-45);
  const talk = loudnessOf(-30);
  const shout = loudnessOf(-10);
  assert.ok(room > 0.05 && room < 0.45);
  assert.ok(whisper > room && whisper < talk);
  assert.ok(talk > 0.75);
  assert.ok(shout - talk < 0.2);
});

test('a steady hum still moves the letters, gently', () => {
  const bins = new Uint8Array(1024).fill(60);
  const state = createBandState(7);
  let levels = [];
  for (let frame = 0; frame < 120; frame += 1) {
    levels = bandLevels(state, { bins, sampleRate: 48000, minDb: -90, maxDb: -20, rmsDb: -55, time: frame / 60 });
  }
  const spread = Math.max(...levels) - Math.min(...levels);
  assert.ok(spread > 0.05);
  assert.ok(levels.every((level) => Math.abs(level) < 0.4));
});
