import assert from 'node:assert/strict';
import test from 'node:test';
import { productLocations, projectLocations } from './locations.js';

test('a product with a slug offers the merch page and its product page', () => {
  assert.deepEqual(
    productLocations({
      title: 'Crystal Cap',
      slug: 'crystal-cap',
    }),
    [
      { title: 'Merch', href: '/merch' },
      { title: 'Crystal Cap', href: '/merch/crystal-cap' },
    ],
  );
});

test('a product without a slug offers only the merch page', () => {
  assert.deepEqual(productLocations({ title: 'Crystal Cap' }), [{ title: 'Merch', href: '/merch' }]);
});


test('a project on the home page keeps its page and the archive', () => {
  assert.deepEqual(
    projectLocations({
      title: 'Season Trailer',
      slug: 'riftline-season-trailer',
      showInWork: false,
      showInArchive: true,
      onHome: true,
    }),
    [
      { title: 'Season Trailer', href: '/projects/riftline-season-trailer' },
      { title: 'Archive', href: '/archive' },
    ],
  );
});

test('a project on neither list offers the archive instead of a page', () => {
  assert.deepEqual(
    projectLocations({
      title: 'Catalogue Line',
      slug: 'catalogue-line',
      showInWork: false,
      showInArchive: true,
      onHome: false,
    }),
    [{ title: 'Archive', href: '/archive' }],
  );
});

test('a project on the work page offers its page, the work page, and the archive', () => {
  assert.deepEqual(
    projectLocations({
      title: 'Gameplay Trailer',
      slug: 'emberfall-gameplay-trailer',
      showInWork: true,
      showInArchive: true,
      onHome: true,
    }),
    [
      { title: 'Gameplay Trailer', href: '/projects/emberfall-gameplay-trailer' },
      { title: 'Work', href: '/work' },
      { title: 'Archive', href: '/archive' },
    ],
  );
});
