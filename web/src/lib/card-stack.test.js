import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEPTH_RISE,
  OPEN_BLUR,
  OPEN_FADE,
  cardStackStyle,
  depthOf,
  follow,
  loopOffset,
  openPileStyle,
} from './card-stack.js';

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

test('following a target eases toward it without passing it', () => {
  // A tenth of the duration closes half the gap, as the expo-out does.
  assert.equal(follow(0, 1, 50, 500), 0.5);
  assert.ok(follow(0, 1, 500, 500) > 0.99);
  assert.ok(follow(0, 1, 500, 500) <= 1);
  assert.equal(follow(0, 1, 16, 0), 1);
  assert.equal(follow(0.3, 1, 0, 500), 0.3);
});

test('following in steps lands where one long step does', () => {
  let value = 0;
  for (let i = 0; i < 10; i += 1) value = follow(value, 4, 16, 500);
  assert.ok(Math.abs(value - follow(0, 4, 160, 500)) < 1e-9);
});

test('loop offsets go the short way round', () => {
  assert.equal(loopOffset(0, 0, 6), 0);
  assert.equal(loopOffset(1, 0, 6), 1);
  assert.equal(loopOffset(5, 0, 6), -1);
  assert.equal(loopOffset(0, 5.5, 6), 0.5);
  assert.equal(loopOffset(2, 0, 3), -1);
  assert.equal(loopOffset(0, 12, 3), 0);
});

test('an opening product blurs and fades the pile behind it', () => {
  const style = cardStackStyle(2);
  assert.deepEqual(openPileStyle(style, 0), style);
  const open = openPileStyle(style, 1);
  assert.equal(open.blur, style.blur + OPEN_BLUR);
  assert.ok(Math.abs(open.opacity - style.opacity * (1 - OPEN_FADE)) < 1e-9);
  assert.equal(open.y, style.y);
});

test('the pile disappears completely, and evenly over the opening, not all at the start', () => {
  const style = cardStackStyle(1);
  assert.equal(OPEN_FADE, 1);
  assert.equal(openPileStyle(style, 1).opacity, 0);
  // A tenth of the way in, most of it is still there; half way, about half.
  assert.ok(openPileStyle(style, 0.1).opacity > style.opacity * 0.9);
  const half = openPileStyle(style, 0.5).opacity / style.opacity;
  assert.ok(half > 0.4 && half < 0.6);
});
