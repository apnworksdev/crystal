import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEPTH_RISE, depthOf, cardStackStyle } from './card-stack.js';

test('the card at the position is in front, the next ones behind it', () => {
  assert.equal(depthOf(0, 0, 6), 0);
  assert.equal(depthOf(1, 0, 6), 1);
  assert.equal(depthOf(3, 0, 6), 3);
});

test('the stack loops: the first card comes after the last', () => {
  assert.equal(depthOf(0, 5, 6), 1);
  assert.equal(depthOf(0, 5.5, 6), 0.5);
});

test('the front card leaves over the first half of a step', () => {
  assert.equal(depthOf(0, 0.25, 6), -0.25);
});

test('then it is back at the far end of the pile', () => {
  assert.equal(depthOf(0, 0.75, 6), 5.25);
  assert.equal(depthOf(5, 0, 6), 5);
});

test('two cards: the other one waits just behind', () => {
  assert.equal(depthOf(1, 0, 2), 1);
  assert.equal(depthOf(0, 0.25, 2), -0.25);
  assert.equal(depthOf(0, 0.75, 2), 1.25);
});

test('at rest every card of a small pile shows', () => {
  [0, 1, 2].forEach((index) => {
    assert.ok(cardStackStyle(depthOf(index, 0, 3), false, 3).opacity > 0.9);
  });
});

test('a card coming round to the back fades in instead of appearing', () => {
  // Three cards: the far end is depth 2. Just after the front card leaves, it is at 2.5.
  assert.equal(cardStackStyle(2.5, false, 3).opacity, 0);
  assert.ok(cardStackStyle(2.25, false, 3).opacity > 0.4);
  assert.ok(cardStackStyle(2.25, false, 3).opacity < 0.6);
});

test('front card is sharp and in place', () => {
  const style = cardStackStyle(0);
  assert.deepEqual([style.y, style.blur, style.opacity, style.scale], [0, 0, 1, 1]);
});

test('cards behind rise, blur and fade step by step', () => {
  const one = cardStackStyle(1);
  const two = cardStackStyle(2);
  assert.equal(one.y, -DEPTH_RISE);
  assert.equal(two.y, -2 * DEPTH_RISE);
  assert.ok(two.blur > one.blur);
  assert.ok(two.opacity < one.opacity);
  assert.ok(one.z > two.z);
});

test('between two places the values blend, so nothing jumps', () => {
  const half = cardStackStyle(1.5);
  assert.equal(half.y, -1.5 * DEPTH_RISE);
  assert.equal(half.blur, 3);
});

test('a leaving card drops, grows and fades out within half a step', () => {
  const leaving = cardStackStyle(-0.25);
  assert.ok(leaving.y > 0);
  assert.ok(leaving.scale > 1);
  assert.ok(leaving.opacity < 1);
  assert.equal(cardStackStyle(-0.5).opacity, 0);
});

test('reduced motion keeps a leaving card in place', () => {
  const leaving = cardStackStyle(-0.25, true);
  assert.equal(leaving.y, 0);
  assert.equal(leaving.scale, 1);
});

test('deep cards are not drawn', () => {
  assert.equal(cardStackStyle(6).opacity, 0);
});
