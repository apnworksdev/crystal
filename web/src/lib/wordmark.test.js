import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FORCE_COMPRESSED_FLEX,
  WORD,
  bandFor,
  conserveTotalWidth,
  flexToT,
  layout,
  letterPath,
  measure,
  restWidth,
  tToFlex,
  waveFlex,
} from './wordmark.js';

const rest = () => Array(WORD.length).fill(FORCE_COMPRESSED_FLEX);

test('flex and blend convert back and forth', () => {
  for (const flex of [0.7, 1, 1.3, 1.6]) assert.ok(Math.abs(tToFlex(flexToT(flex)) - flex) < 1e-9);
});

test('the still word is every letter at its narrowest', () => {
  for (const ch of WORD) assert.equal(flexToT(FORCE_COMPRESSED_FLEX), 0, ch);
  assert.ok(Math.abs(restWidth() - 77.09) < 0.01);
});

test('a moving word keeps one total width however its letters move', () => {
  const totals = [0, 0.4, 1.7, 3.2, 5].map((seconds) => {
    const flexes = [...WORD].map((_, i) => waveFlex(i, seconds));
    return measure(conserveTotalWidth(flexes)).full;
  });
  for (const total of totals) assert.ok(Math.abs(total - totals[0]) < 1e-6);
});

test('letters follow bass, mids and treble in that order', () => {
  assert.deepEqual([...WORD].map((_, i) => bandFor(i)), ['bass', 'bass', 'mid', 'mid', 'mid', 'treble', 'treble']);
});

test('a 4:1 box shows the whole word centred, as the header logo', () => {
  const placed = layout({ W: 96, H: 24, flexes: rest() });
  assert.equal(placed.fold, 0);
  const first = placed.letters[0];
  const width = placed.full * placed.unit;
  assert.ok(Math.abs(first.x - (96 - width) / 2) < 1e-9);
  assert.ok(Math.abs(width - 96 * (81.37 / 95.37)) < 1e-6);
});

test('a square box shows only the c, centred', () => {
  const placed = layout({ W: 24, H: 24, flexes: rest() });
  assert.equal(placed.fold, 1);
  const c = placed.letters[0];
  const cWidth = (144 / 113) * 10 * placed.unit;
  assert.ok(Math.abs(c.x + cWidth / 2 - 12) < 1e-9);
  assert.ok(placed.letters.slice(1).every((letter) => letter.alpha === 0));
});

test('with an inner share the word fills that share of the box', () => {
  const placed = layout({ W: 1000, H: 200, flexes: rest(), inner: 1 });
  assert.ok(Math.abs(placed.full * placed.unit - 1000) < 1e-9);
  assert.ok(Math.abs(placed.letters[0].x) < 1e-9);
});

test('letter paths blend between both shapes', () => {
  assert.match(letterPath('C', 0), /^M45\.257/);
  assert.notEqual(letterPath('R', 0), letterPath('R', 1));
});
