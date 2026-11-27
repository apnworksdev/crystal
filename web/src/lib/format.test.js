import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creditRows, formatPrice } from './format.js';

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

test('credits split into a role and a name at the first colon', () => {
  const block = (text) => ({ _type: 'block', children: [{ _type: 'span', text }] });
  assert.deepEqual(
    creditRows([block('Director: Phil Lord & Christopher Miller'), block('Edited by:Joel Negron'), block('Crystal'), block('  ')]),
    [
      { label: 'Director', value: 'Phil Lord & Christopher Miller' },
      { label: 'Edited by', value: 'Joel Negron' },
      { label: '', value: 'Crystal' },
    ],
  );
  // A colon later in the name stays in the name.
  assert.deepEqual(creditRows([block('Mix: Studio: B')]), [{ label: 'Mix', value: 'Studio: B' }]);
  assert.deepEqual(creditRows(undefined), []);
});
