import assert from 'node:assert/strict';
import test from 'node:test';
import { merchStackStyle } from './merch-stack.js';

test('the front product is sharp and fully visible', () => {
  assert.deepEqual(merchStackStyle(0, 0), {
    opacity: 1,
    blur: 0,
    shift: 0,
    scale: 1,
  });
});

test('each product behind is 4px more blurred', () => {
  assert.equal(merchStackStyle(1, 0).blur, 4);
  assert.equal(merchStackStyle(2, 0).blur, 8);
  assert.equal(merchStackStyle(5, 0).blur, 20);
});

test('as the front product leaves, it fades, blurs, and lifts', () => {
  const mid = merchStackStyle(0, 0.5);
  assert.ok(mid.opacity < 1);
  assert.ok(mid.blur > 0);
  assert.ok(mid.shift < 0);
});

test('the next product loses 4px of blur as it comes forward', () => {
  assert.equal(merchStackStyle(1, 0).blur, 4);
  assert.equal(merchStackStyle(1, 1).blur, 0);
  assert.equal(merchStackStyle(1, 0.5).blur, 2);
});

test('each product behind is 10% bigger', () => {
  assert.equal(merchStackStyle(0, 0).scale, 1);
  assert.equal(merchStackStyle(1, 0).scale, 1.1);
  assert.equal(merchStackStyle(2, 0).scale, 1.2);
  assert.ok(Math.abs(merchStackStyle(1, 0.5).scale - 1.05) < 1e-9);
});

test('four products show; the fifth fades in as the front one leaves', () => {
  assert.equal(merchStackStyle(3, 0).opacity, 1);
  assert.equal(merchStackStyle(4, 0).opacity, 0);
  assert.equal(merchStackStyle(4, 0.5).opacity, 0.5);
  assert.equal(merchStackStyle(5, 0.5).opacity, 0);
});
