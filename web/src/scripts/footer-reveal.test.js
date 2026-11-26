import assert from 'node:assert/strict';
import { test } from 'node:test';
import { footerRise, headerRestBottom } from './footer-reveal.js';

test('desktop: the header already rests at the middle', () => {
  // 1000px tall window, 24px header centred: top 488, bottom 512.
  assert.equal(headerRestBottom(488, 24, 1000), 512);
  assert.equal(footerRise(488, 24, 1000), 488);
});

test('phone: a header docked low rests at the middle once the footer pushes it', () => {
  assert.equal(headerRestBottom(760, 24, 812), 418);
  assert.equal(footerRise(760, 24, 812), 394);
});

test('a header above the middle keeps its own bottom edge', () => {
  assert.equal(headerRestBottom(20, 24, 812), 44);
  assert.equal(footerRise(20, 24, 812), 768);
});
