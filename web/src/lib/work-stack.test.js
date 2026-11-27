import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RISE, cardSize, stackDepth, stackStyle, stackTop, wrapIndex } from './work-stack.js';

test('the card at the position is in front, the next ones behind it', () => {
  assert.equal(stackDepth(0, 0, 8), 0);
  assert.equal(stackDepth(1, 0, 8), 1);
  assert.equal(stackDepth(5, 0, 8), 5);
});

test('the stack is endless both ways', () => {
  assert.equal(stackDepth(0, 7, 8), 1);
  assert.equal(stackDepth(0, 8, 8), 0);
  assert.equal(stackDepth(0, -1, 8), 1);
  assert.equal(stackDepth(2, 17.5, 8), 0.5);
});

test('a card leaving the front is passed until it has gone, then waits at the very back', () => {
  assert.equal(stackDepth(0, 0.5, 8), -0.5);
  assert.equal(stackDepth(0, 1, 8), 7);
  assert.equal(stackDepth(0, 1.5, 8), 6.5);
});

test('the card arriving at the back of the pile fades in, the one leaving it fades out', () => {
  // Six cards: the last place of the pile is depth 4. Waiting behind it (depth 5): unseen.
  assert.equal(stackStyle(5, 6).opacity, 0);
  // Half way in: half the opacity of that place.
  assert.equal(stackStyle(4.5, 6).opacity, stackStyle(4.5).opacity * 0.5);
  assert.equal(stackStyle(4, 6).opacity, stackStyle(4).opacity);
  // Two cards: the other one always shows.
  assert.ok(stackStyle(1, 2).opacity > 0);
});

test('two cards: the other waits behind; one card is always in front', () => {
  assert.equal(stackDepth(1, 0, 2), 1);
  assert.equal(stackDepth(0, 0.25, 2), -0.25);
  assert.equal(stackDepth(0, 3.4, 1), 0);
});

test('cards behind rise, blur and fade like the reference', () => {
  assert.deepEqual(stackStyle(0), { y: 0, blur: 0, opacity: 1, z: 1000, passed: false });
  assert.equal(stackStyle(1).y, -RISE);
  assert.equal(stackStyle(1).blur, 2);
  assert.equal(stackStyle(2).blur, 4);
  assert.equal(stackStyle(3).blur, 8);
  assert.equal(stackStyle(4).blur, 16);
  assert.equal(stackStyle(4).opacity, 0.8);
  assert.equal(stackStyle(5).opacity, 0);
  assert.equal(stackStyle(9).y, -5 * RISE);
});

test('a passed card falls away in front of the pile and fades', () => {
  const half = stackStyle(-0.5);
  assert.equal(half.y, 70);
  assert.equal(half.opacity, 0.25);
  // Above the card coming forward, so it is seen to leave instead of vanishing behind it.
  assert.ok(half.z > stackStyle(0).z);
  assert.equal(half.passed, true);
  assert.equal(stackStyle(0).passed, false);
  assert.equal(stackStyle(-1).opacity, 0);
});

test('desktop cards share one area and stay inside the caps', () => {
  assert.deepEqual(cardSize(16 / 9, { width: 1440, height: 900 }), { w: 650, h: 366 });
  const square = cardSize(1, { width: 1440, height: 900 });
  assert.deepEqual(square, { w: 480, h: 480 });
  const tall = cardSize(0.75, { width: 1440, height: 900 });
  assert.equal(tall.h, 480);
  assert.ok(tall.w % 2 === 0);
});

test('desktop cards grow on big screens and shrink to the room', () => {
  assert.equal(cardSize(16 / 9, { width: 2880, height: 2000 }).w, 1300);
  assert.equal(cardSize(1, { width: 1440, height: 900, room: 300 }).h, 300);
});

test('phone cards fit the width, 314 on a 393 screen', () => {
  assert.equal(cardSize(16 / 9, { phone: true, width: 393, height: 852 }).w, 314);
  assert.equal(cardSize(1.5, { phone: true, width: 393, height: 852 }).w, 314);
  assert.equal(cardSize(0.5, { phone: true, width: 393, height: 852, room: 400 }).h, 400);
});

test('the desktop front card sits on the 25px pitch above the header line', () => {
  assert.equal(stackTop(1440, 900), 238);
  assert.equal(wrapIndex(-1, 5), 4);
});
