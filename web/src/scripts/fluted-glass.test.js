import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANDS, SPREAD, bandShifts } from './fluted-glass.js';

test('the filter moves each band to look at its own side, as the shader does', () => {
  const shifts = bandShifts();
  assert.equal(shifts.length, BANDS);
  // The middle band looks straight through; the outer ones look outwards, mirrored.
  assert.ok(Math.abs(shifts[1]) < 1e-9);
  assert.ok(shifts[0] < 0 && shifts[2] > 0);
  assert.ok(Math.abs(shifts[0] + shifts[2]) < 1e-9);
  // Band 0's window centre (0.5 - SPREAD) sits where the band's own centre plus its shift says.
  assert.ok(Math.abs(1 / 6 - shifts[0] - (0.5 - SPREAD)) < 1e-9);
});
