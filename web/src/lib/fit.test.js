import assert from 'node:assert/strict';
import { test } from 'node:test';
import { containBox, stageBox } from './fit.js';

test('a wide picture in a taller box gets bars above and below', () => {
  assert.deepEqual(containBox(1000, 800, 1920, 800), { left: 0, top: 191.66666666666666, width: 1000, height: 416.6666666666667 });
});

test('a tall picture in a wide box gets bars at the sides', () => {
  assert.deepEqual(containBox(1000, 500, 1000, 1000), { left: 250, top: 0, width: 500, height: 500 });
});

test('a picture of the same shape fills the box', () => {
  assert.deepEqual(containBox(800, 450, 1920, 1080), { left: 0, top: 0, width: 800, height: 450 });
});

test('an unknown picture size gives the whole box', () => {
  assert.deepEqual(containBox(800, 450, 0, 0), { left: 0, top: 0, width: 800, height: 450 });
});

test('the stage keeps the margin around it and room for the bar', () => {
  assert.deepEqual(stageBox(375, 812, { margin: 20, bar: 24 }), { left: 20, top: 20, width: 335, height: 748 });
});

test('the stage is never wider than its maximum', () => {
  assert.deepEqual(stageBox(1920, 1080, { margin: 20, bar: 24, maxWidth: 1280 }), { left: 320, top: 20, width: 1280, height: 1016 });
});
