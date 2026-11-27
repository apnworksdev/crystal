import assert from 'node:assert/strict';
import { test } from 'node:test';
import { centredIndex, copiesAfter, wrapIntoList } from './awards-loop.js';

test('wrapIntoList keeps positions inside the list', () => {
  assert.equal(wrapIntoList(1000, 1000), 1000);
  assert.equal(wrapIntoList(1500, 1000), 1500);
  assert.equal(wrapIntoList(2000, 1000), 1000);
  assert.equal(wrapIntoList(2250, 1000), 1250);
});

test('wrapIntoList wraps upwards into the copy above', () => {
  assert.equal(wrapIntoList(999, 1000), 1999);
  assert.equal(wrapIntoList(0, 1000), 1000);
  assert.equal(wrapIntoList(-250, 1000), 1750);
});

test('wrapIntoList leaves positions alone without a measured list', () => {
  assert.equal(wrapIntoList(42, 0), 42);
});

test('copiesAfter fills at least one screen below the list', () => {
  assert.equal(copiesAfter(2000, 800), 1);
  assert.equal(copiesAfter(300, 800), 3);
  assert.equal(copiesAfter(0, 800), 1);
});

test('centredIndex finds the entry under the centre, in any copy', () => {
  const rows = [
    { top: 0, height: 50 },
    { top: 100, height: 50 },
    { top: 200, height: 50 },
    { top: 300, height: 50 },
  ];
  assert.equal(centredIndex(rows, 120, 2), 1);
  assert.equal(centredIndex(rows, 210, 2), 0);
  assert.equal(centredIndex(rows, 349, 2), 1);
});

test('centredIndex picks the nearer entry in a gap', () => {
  const rows = [
    { top: 0, height: 50 },
    { top: 100, height: 50 },
  ];
  assert.equal(centredIndex(rows, 60, 2), 0);
  assert.equal(centredIndex(rows, 90, 2), 1);
  assert.equal(centredIndex([], 10, 2), -1);
});
