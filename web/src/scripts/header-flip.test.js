import assert from 'node:assert/strict';
import test from 'node:test';
import { headerFlip } from './header-flip.js';

test('a section page pins the header with its usual vertical centering', () => {
  const flip = headerFlip({ top: 100, left: 28 }, { top: 640, left: 28 }, false);
  assert.deepEqual(flip, {
    start: 'translate(0px, -540px) translateY(-50%)',
    rest: 'translate(0px, 0px) translateY(-50%)',
  });
});

test('a project page pins the header without that centering', () => {
  const flip = headerFlip({ top: 360, left: 28 }, { top: 700, left: 40 }, true);
  assert.deepEqual(flip, {
    start: 'translate(-12px, -340px)',
    rest: 'translate(0px, 0px)',
  });
});

test('a shift under two pixels does not flip', () => {
  assert.equal(headerFlip({ top: 100, left: 28 }, { top: 101, left: 28 }, false), null);
});
