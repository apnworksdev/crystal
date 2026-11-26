import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPrice } from './format.js';

test('a bare number gets a dollar sign', () => {
  assert.equal(formatPrice('15'), '$15');
  assert.equal(formatPrice(' 15.00 '), '$15.00');
});

test('a price with its own currency stays as written', () => {
  assert.equal(formatPrice('$15'), '$15');
  assert.equal(formatPrice('€35'), '€35');
  assert.equal(formatPrice('USD 15'), 'USD 15');
});

test('no price stays empty', () => {
  assert.equal(formatPrice(undefined), '');
  assert.equal(formatPrice(''), '');
});
