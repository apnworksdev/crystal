import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampShift } from './header-scroll.js';

test('nothing overflows: the header stays put', () => {
  assert.equal(clampShift(120, 0), 0);
  assert.equal(clampShift(-40, 0), 0);
});

test('the header moves no further than it overflows, and never past its rest', () => {
  assert.equal(clampShift(50, 200), 50);
  assert.equal(clampShift(500, 200), 200);
  assert.equal(clampShift(-10, 200), 0);
});

test('offsets are whole pixels', () => {
  assert.equal(clampShift(10.6, 200), 11);
  assert.equal(clampShift(80, 79.6), 80);
});

test('bad input reads as no offset', () => {
  assert.equal(clampShift(Number.NaN, 200), 0);
  assert.equal(clampShift(30, Number.NaN), 0);
});
